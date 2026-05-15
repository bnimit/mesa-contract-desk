export type {
  Portfolio,
  Holding,
  TradeAction,
  AgentProposal,
  AgentResult,
  AgentMemory,
  PastPredictionRecord,
  PlaybookEntry,
  MarketQuote,
  StorageBackend,
} from "@shared/types.js";

export interface PortfolioWithPrices {
  portfolio: (import("@shared/types.js").Holding & { currentPrice: number; name: string })[];
  cash: number;
  lastUpdated: string;
  marketValue: number;
}

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; timestamp: number; results: import("@shared/types.js").AgentResult[] }
  | { status: "error"; message: string };

export interface HistoryRoundSummary {
  timestamp: number;
  agents: { name: string; action: string; merged: boolean }[];
  mergedAgent?: string;
  replayedFrom?: number;
}
