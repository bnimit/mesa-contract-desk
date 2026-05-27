import { getMesa } from "../services/mesa.js";
import { runAgentPrompt, type AgentInput } from "../services/claude.js";
import { validateProposal, applyActions } from "../validators/trade.js";
import { readAgentMemory, memoryBlock } from "../services/memory.js";
import { readPlaybook, appendEntry, nextRoundNumber } from "../services/playbook.js";
import type { Portfolio, AgentResult } from "../../shared/types.js";

export interface AgentConfig {
  name: string;
  role: string;
  fetchMarketData: (tickers: string[]) => Promise<string>;
}

export interface RunContext {
  timestamp: number;
}

export async function runAgent(
  config: AgentConfig,
  branchName: string,
  currentPrices: Map<string, number>,
  ctx: RunContext
): Promise<AgentResult> {
  try {
    const portfolioRaw = await getMesa().readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(portfolioRaw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);

    const marketData = await config.fetchMarketData(tickers);
    const memory = await readAgentMemory(config.name, currentPrices);
    const playbookContents = await readPlaybook("main");
    const nextRound = nextRoundNumber(playbookContents);

    const input: AgentInput = {
      portfolio,
      marketData,
      agentRole: config.role,
      agentName: config.name,
      constraints: "",
      memoryBlock: memoryBlock(memory),
      playbookContents,
      nextRound,
      timestamp: ctx.timestamp,
    };

    const output = await runAgentPrompt(input);

    const errors = validateProposal(portfolio, output.actions, currentPrices);
    if (errors.length > 0) {
      const validActions = output.actions.filter(
        (a) => !errors.some((e) => e.action.ticker === a.ticker && e.action.action === a.action)
      );
      output.actions = validActions;
    }

    if (output.actions.length === 0) {
      output.actions = portfolio.portfolio.map((h) => ({
        ticker: h.ticker,
        action: "hold" as const,
        shares: h.shares,
        reason: "No strong signal, staying put",
        confidence: "low" as const,
      }));
    }

    const proposedPortfolio = applyActions(portfolio, output.actions, currentPrices);

    // Append this agent's playbook entry to its own branch.
    await appendEntry(branchName, output.playbookEntry);

    // Persist the proposed portfolio on the agent's branch.
    await getMesa().writeFile(branchName, "portfolio.json", JSON.stringify(proposedPortfolio, null, 2));
    await getMesa().writeFile(branchName, "reasoning.md", `# ${config.name} Analysis\n\n${output.reasoning}`);

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
        cashBefore: portfolio.cash,
        cashAfter: proposedPortfolio.cash,
        cashDelta: proposedPortfolio.cash - portfolio.cash,
        memory,
        playbookEntry: output.playbookEntry,
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
