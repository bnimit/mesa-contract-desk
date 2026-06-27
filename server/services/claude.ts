import Anthropic from "@anthropic-ai/sdk";
import type { Portfolio, TradeAction, Contract, RedlineEdit } from "../../shared/types.js";

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

export function getClient(): Anthropic {
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

IMPORTANT: Write "reason" in plain English a non-investor would understand. No jargon. Max 10 words. Example: "Price dropped 5%, good time to buy more" or "Stock keeps falling, cut losses now".

{
  "strategy": "one sentence summary of your approach, in first person, plain English",
  "playbookEntry": "## [Round ${String(input.nextRound).padStart(3, "0")} · ${input.agentName} · YYYY-MM-DD HH:MM]\\n\\n**Observed**: ...\\n\\n**Reasoning**: ...\\n\\n**Decision**: ...\\n\\n**Confidence**: high|medium|low",
  "actions": [
    { "ticker": "AAPL", "action": "buy|sell|hold", "shares": 5, "reason": "plain English, max 10 words", "confidence": "high|medium|low" }
  ],
  "reasoning": "2-3 sentences in plain English explaining your thinking"
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

const REDLINE_SCHEMA_HINT = `Respond with ONLY a valid JSON array. Each element is one redline edit:
[
  {
    "id": "e1",
    "type": "replace" | "delete" | "insert",
    "targetClauseId": "<clause id to replace or delete>",   // omit for insert
    "afterClauseId": "<clause id to insert after, or null for top>", // insert only
    "heading": "<new clause heading>",                         // replace/insert
    "proposedText": "<new clause text in plain contract English>", // replace/insert
    "justification": "<one sentence, why this protects your client>"
  }
]
Only use clause ids that appear in the contract. Propose 2-5 edits. No prose outside the JSON.`;

export function parseRedlineEdits(text: string): RedlineEdit[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Agent did not return a JSON array");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Redline output was not an array");
  return parsed.map((e, i) => ({
    id: typeof e.id === "string" ? e.id : `e${i + 1}`,
    type: e.type,
    targetClauseId: e.targetClauseId,
    afterClauseId: e.afterClauseId ?? null,
    heading: e.heading,
    proposedText: e.proposedText,
    justification: e.justification ?? "",
  })) as RedlineEdit[];
}

export async function runRedlinePrompt(contract: Contract, role: string): Promise<RedlineEdit[]> {
  const clauseList = contract.clauses
    .map((c) => `[id: ${c.id}] ${c.heading}\n${c.text}`)
    .join("\n\n");

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a contract attorney. ${role}

You are redlining this ${contract.meta.title} on behalf of the Customer. The clauses, each with a stable [id], are:

${clauseList}

${REDLINE_SCHEMA_HINT}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseRedlineEdits(text);
}
