import { mesa } from "../services/mesa.js";
import { runAgentPrompt, type AgentInput } from "../services/claude.js";
import { validateProposal, applyActions } from "../validators/trade.js";
import type { Portfolio, AgentResult } from "../../shared/types.js";

export interface AgentConfig {
  name: string;
  role: string;
  fetchMarketData: (tickers: string[]) => Promise<string>;
}

export async function runAgent(
  config: AgentConfig,
  branchName: string,
  currentPrices: Map<string, number>
): Promise<AgentResult> {
  try {
    const portfolioRaw = await mesa.readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(portfolioRaw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);

    const marketData = await config.fetchMarketData(tickers);

    const input: AgentInput = {
      portfolio,
      marketData,
      agentRole: config.role,
      constraints: "",
    };

    const output = await runAgentPrompt(input);

    const errors = validateProposal(portfolio, output.actions, currentPrices);
    if (errors.length > 0) {
      const validActions = output.actions.filter(
        (a) => !errors.some((e) => e.action.ticker === a.ticker && e.action.action === a.action)
      );
      output.actions = validActions;
    }

    const proposedPortfolio = applyActions(portfolio, output.actions, currentPrices);

    await mesa.writeFile(branchName, "portfolio.json", JSON.stringify(proposedPortfolio, null, 2));
    await mesa.writeFile(branchName, "reasoning.md", `# ${config.name} Analysis\n\n${output.reasoning}`);

    let newMarketValue = proposedPortfolio.cash;
    for (const h of proposedPortfolio.portfolio) {
      newMarketValue += h.shares * (currentPrices.get(h.ticker) ?? 0);
    }

    return {
      agentName: config.name,
      branch: branchName,
      status: "success",
      proposal: {
        agentName: config.name,
        strategy: output.strategy,
        actions: output.actions,
        proposedPortfolio,
        reasoning: output.reasoning,
        newMarketValue,
      },
    };
  } catch (error) {
    return {
      agentName: config.name,
      branch: branchName,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
