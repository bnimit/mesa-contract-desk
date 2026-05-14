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
}

export interface AnalysisRound {
  timestamp: number;
  branches: string[];
  proposals: AgentResult[];
}

export interface AgentResult {
  agentName: string;
  branch: string;
  status: "success" | "error";
  proposal?: AgentProposal;
  error?: string;
}

export interface MarketQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}
