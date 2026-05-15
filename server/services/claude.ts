import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Portfolio, TradeAction } from "../../shared/types.js";

function loadApiKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.startsWith("sk-")) return fromEnv;

  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}

  throw new Error("ANTHROPIC_API_KEY not found in environment or .env file");
}

let client: Anthropic;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: loadApiKey() });
  }
  return client;
}

export interface AgentInput {
  portfolio: Portfolio;
  marketData: string;
  agentRole: string;
  constraints: string;
}

export interface AgentOutput {
  actions: TradeAction[];
  reasoning: string;
  strategy: string;
}

const CONSTRAINTS_BLOCK = `TRADE CONSTRAINTS:
- Max spend per trade: 30% of available cash
- Max sell per position: 50% of shares held
- Only trade tickers already in the portfolio
- Must keep at least $500 cash after all trades

YOUR JOB:
You are competing against two other agents who use different lenses. Your job is to take a clear stand from YOUR specific perspective — not to play it safe.
- You MUST propose at least ONE buy and/or ONE sell action. "Hold everything" is not a valid response.
- Pick the stock that, through YOUR lens, has the strongest buy or sell signal — and act on it decisively.
- Don't recommend the most consensus-safe move. Recommend the move that best reflects YOUR specialty.`;

export async function runAgentPrompt(input: AgentInput): Promise<AgentOutput> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a ${input.agentRole}.

CURRENT PORTFOLIO:
${JSON.stringify(input.portfolio, null, 2)}

MARKET DATA:
${input.marketData}

${CONSTRAINTS_BLOCK}

Respond with ONLY valid JSON in this exact format:
{
  "strategy": "one sentence summary of your approach, written in first person from your specialty's perspective",
  "actions": [
    { "ticker": "AAPL", "action": "buy|sell|hold", "shares": 5, "reason": "why, using YOUR specialty's vocabulary", "confidence": "high|medium|low" }
  ],
  "reasoning": "2-3 paragraph explanation that strongly reflects YOUR specialty — use the language and reasoning style of YOUR field, not generic financial advice"
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
  };
}
