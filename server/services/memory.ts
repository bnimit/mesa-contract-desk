import { getMesa } from "./mesa.js";
import type { AgentMemory, PastPredictionRecord, AnalysisRound } from "../../shared/types.js";

const HISTORY_DIR = "history";
const MAX_HISTORY_LOOKBACK = 5;

export async function readAgentMemory(
  agentName: string,
  currentPrices: Map<string, number>
): Promise<AgentMemory> {
  const files = await getMesa().listFiles("main", HISTORY_DIR);
  const recent = files.slice(-MAX_HISTORY_LOOKBACK);

  const records: PastPredictionRecord[] = [];

  for (const file of recent) {
    try {
      const raw = await getMesa().readFile("main", `${HISTORY_DIR}/${file}`);
      const round = JSON.parse(raw) as StoredRound;
      const myResult = round.results.find((r) => r.agentName === agentName);
      if (!myResult?.proposal) continue;

      for (const action of myResult.proposal.actions) {
        if (action.action === "hold") continue;

        const priceWhen = round.snapshotPrices[action.ticker];
        const priceNow = currentPrices.get(action.ticker);
        if (!priceWhen || !priceNow) continue;

        const changePercent = ((priceNow - priceWhen) / priceWhen) * 100;
        let outcome: "correct" | "wrong" | "pending" = "pending";
        if (Math.abs(changePercent) > 0.5) {
          if (action.action === "buy" && changePercent > 0) outcome = "correct";
          else if (action.action === "sell" && changePercent < 0) outcome = "correct";
          else outcome = "wrong";
        }

        records.push({
          timestamp: round.timestamp,
          ticker: action.ticker,
          action: action.action,
          shares: action.shares,
          priceWhenPredicted: priceWhen,
          currentPrice: priceNow,
          changePercent,
          outcome,
        });
      }
    } catch {
      // skip malformed history files
    }
  }

  const correct = records.filter((r) => r.outcome === "correct").length;
  const wrong = records.filter((r) => r.outcome === "wrong").length;

  return {
    reviewed: records.length,
    correct,
    wrong,
    records,
  };
}

export function memoryBlock(memory: AgentMemory): string {
  if (memory.reviewed === 0) {
    return "YOUR PAST PREDICTIONS: (no history yet — this is your first round)";
  }

  const lines = memory.records.map((r) => {
    const dir = r.changePercent >= 0 ? "+" : "";
    const mark =
      r.outcome === "correct" ? "✓ CORRECT" : r.outcome === "wrong" ? "✗ WRONG" : "· too soon to tell";
    return `─ ${r.action.toUpperCase()} ${r.ticker} @ $${r.priceWhenPredicted.toFixed(2)} → now $${r.currentPrice.toFixed(2)} (${dir}${r.changePercent.toFixed(2)}%) → ${mark}`;
  });

  const decided = memory.correct + memory.wrong;
  const pct = decided > 0 ? Math.round((memory.correct / decided) * 100) : 0;

  return `YOUR PAST PREDICTIONS (read from Mesa history):
${lines.join("\n")}

Track record: ${memory.correct}/${decided} correct (${pct}%)

Use this to refine your approach. Lean harder into signals that worked. Be more cautious about signals that failed.`;
}

interface StoredRound {
  timestamp: number;
  snapshotPrices: Record<string, number>;
  results: {
    agentName: string;
    branch: string;
    status: "success" | "error";
    proposal?: {
      strategy: string;
      actions: { ticker: string; action: "buy" | "sell" | "hold"; shares: number }[];
    };
  }[];
  mergedAgent?: string;
  replayedFrom?: number;
}

export async function saveRoundSnapshot(round: AnalysisRound, currentPrices: Map<string, number>): Promise<void> {
  const snapshot: StoredRound = {
    timestamp: round.timestamp,
    snapshotPrices: Object.fromEntries(currentPrices),
    mergedAgent: round.mergedAgent,
    replayedFrom: round.replayedFrom,
    results: round.results.map((r) => ({
      agentName: r.agentName,
      branch: r.branch,
      status: r.status,
      proposal: r.proposal
        ? {
            strategy: r.proposal.strategy,
            actions: r.proposal.actions.map((a) => ({
              ticker: a.ticker,
              action: a.action,
              shares: a.shares,
            })),
          }
        : undefined,
    })),
  };

  await getMesa().writeFile(
    "main",
    `${HISTORY_DIR}/${round.timestamp}.json`,
    JSON.stringify(snapshot, null, 2)
  );
}

export async function listHistoryRounds(currentPrices: Map<string, number>): Promise<HistoryRoundSummary[]> {
  const files = await getMesa().listFiles("main", HISTORY_DIR);
  const summaries: HistoryRoundSummary[] = [];

  for (const file of files) {
    try {
      const raw = await getMesa().readFile("main", `${HISTORY_DIR}/${file}`);
      const round = JSON.parse(raw) as StoredRound;

      const agents = round.results.map((r) => {
        if (!r.proposal) return { name: r.agentName, action: "error", merged: false };
        const nonHold = r.proposal.actions.filter((a) => a.action !== "hold");
        return {
          name: r.agentName,
          action: nonHold[0]
            ? `${nonHold[0].action.toUpperCase()} ${nonHold[0].ticker}`
            : "HOLD",
          merged: round.mergedAgent === r.agentName,
        };
      });

      summaries.push({
        timestamp: round.timestamp,
        agents,
        mergedAgent: round.mergedAgent,
        replayedFrom: round.replayedFrom,
      });
    } catch {
      // skip
    }
  }

  return summaries.reverse();
}

export interface HistoryRoundSummary {
  timestamp: number;
  agents: { name: string; action: string; merged: boolean }[];
  mergedAgent?: string;
  replayedFrom?: number;
}
