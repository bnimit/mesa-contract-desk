import Anthropic from "@anthropic-ai/sdk";
import type { Portfolio, TradeAction } from "../../shared/types.js";

let client: Anthropic | null = null;

export function reinitializeAnthropic(apiKey: string): void {
  client = new Anthropic({ apiKey });
}

export function clearAnthropic(): void {
  client = null;
}

export function hasAnthropicKey(): boolean {
  return client !== null;
}

function getClient(): Anthropic {
  if (!client) {
    throw new Error("Anthropic API key not configured — add it in Settings");
  }
  return client;
}

export interface AgentInput {
  portfolio: Portfolio;
  marketData: string;
  agentRole: string;
  agentName: string;
  constraints: string;
  memoryBlock?: string;
  playbookContents: string;
  nextRound: number;
  timestamp: number;
}

export interface AgentOutput {
  actions: TradeAction[];
  reasoning: string;
  strategy: string;
  playbookEntry: string;
}

const CONSTRAINTS_BLOCK = `TRADE CONSTRAINTS:
- Max spend per trade: 30% of available cash
- Max sell per position: 50% of shares held
- Only trade tickers already in the portfolio
- Must keep at least $500 cash after all trades

YOUR JOB:
You are competing against two other agents who use different lenses. Take a clear stand from YOUR specific perspective — don't play it safe.
- You MUST propose at least ONE buy and/or ONE sell action. "Hold everything" is not a valid response.
- Pick the stock that, through YOUR lens, has the strongest buy or sell signal — act decisively.
- Don't recommend the consensus-safe move. Recommend the move that best reflects YOUR specialty.

YOUR PLAYBOOK ENTRY:
The playbook is a shared markdown file on Mesa's main branch. All three agents append to it over time, and you can see your own past entries (and the other agents') in the playbook contents below. Each round you must write a NEW entry that follows this exact format:

## [Round NNN · Your Name · YYYY-MM-DD HH:MM]

**Observed**: One paragraph on what you noticed in the current market data through your lens.

**Reasoning**: One paragraph connecting your observation to your decision. Reference your past entries if relevant ("My round-002 SELL on NVDA was correct...").

**Decision**: A one-line summary of the trades you're proposing this round.

**Confidence**: high | medium | low

The header must match the format exactly so it can be parsed.`;

export async function runAgentPrompt(input: AgentInput): Promise<AgentOutput> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are ${input.agentName}, a ${input.agentRole}.

CURRENT PORTFOLIO:
${JSON.stringify(input.portfolio, null, 2)}

MARKET DATA:
${input.marketData}

THE SHARED PLAYBOOK (Mesa main branch · playbook.md):
\`\`\`
${input.playbookContents}
\`\`\`

This round is Round ${String(input.nextRound).padStart(3, "0")}, timestamp ${new Date(input.timestamp).toISOString()}.

${CONSTRAINTS_BLOCK}

Respond with ONLY valid JSON in this exact format. The "playbookEntry" must use the exact header format specified above.

{
  "strategy": "one sentence summary of your approach, in first person",
  "playbookEntry": "## [Round ${String(input.nextRound).padStart(3, "0")} · ${input.agentName} · YYYY-MM-DD HH:MM]\\n\\n**Observed**: ...\\n\\n**Reasoning**: ...\\n\\n**Decision**: ...\\n\\n**Confidence**: high|medium|low",
  "actions": [
    { "ticker": "AAPL", "action": "buy|sell|hold", "shares": 5, "reason": "why, in YOUR vocabulary", "confidence": "high|medium|low" }
  ],
  "reasoning": "2-3 paragraph explanation strongly reflecting YOUR specialty"
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Agent did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    actions: parsed.actions as TradeAction[],
    reasoning: parsed.reasoning as string,
    strategy: parsed.strategy as string,
    playbookEntry: parsed.playbookEntry as string,
  };
}
