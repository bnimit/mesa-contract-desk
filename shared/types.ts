export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
}

export interface Portfolio {
  portfolio: Holding[];
  cash: number;
  lastUpdated: string;
}

export interface TradeAction {
  ticker: string;
  action: "buy" | "sell" | "hold";
  shares: number;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface AgentProposal {
  agentName: string;
  strategy: string;
  actions: TradeAction[];
  proposedPortfolio: Portfolio;
  reasoning: string;
  newMarketValue: number;
  memory?: AgentMemory;
}

export interface AgentMemory {
  reviewed: number;
  correct: number;
  wrong: number;
  records: PastPredictionRecord[];
}

export interface PastPredictionRecord {
  timestamp: number;
  ticker: string;
  action: "buy" | "sell" | "hold";
  shares: number;
  priceWhenPredicted: number;
  currentPrice: number;
  changePercent: number;
  outcome: "correct" | "wrong" | "pending";
}

export interface AgentResult {
  agentName: string;
  branch: string;
  status: "success" | "error";
  proposal?: AgentProposal;
  error?: string;
}

export interface AnalysisRound {
  timestamp: number;
  branches: string[];
  results: AgentResult[];
  mergedAgent?: string;
}

export interface StorageBackend {
  name: string;
  label: string;
  description: string;
  available: boolean;
  active: boolean;
}

export interface MarketQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}
