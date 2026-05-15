import Anthropic from "@anthropic-ai/sdk";
import type { Portfolio, TradeAction } from "../../shared/types.js";

let client: Anthropic;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

const CONSTRAINTS_BLOCK = `TRADE CONSTRAINTS (you MUST follow these):
- Max spend per trade: 30% of available cash
- Max sell per position: 50% of shares held
- Only trade tickers already in the portfolio
- Must keep at least $500 cash after all trades
- Return actions as JSON array`;

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

Analyze the portfolio and propose trades. Respond with ONLY valid JSON in this exact format:
{
  "strategy": "one sentence summary of your approach",
  "actions": [
    { "ticker": "AAPL", "action": "buy|sell|hold", "shares": 5, "reason": "why", "confidence": "high|medium|low" }
  ],
  "reasoning": "2-3 paragraph explanation of your analysis"
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
