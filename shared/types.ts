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
  cashBefore: number;
  cashAfter: number;
  cashDelta: number;
  memory?: AgentMemory;
  playbookEntry?: string;
}

export interface PlaybookEntry {
  agent: string;
  round: number;
  timestamp: number;
  body: string;
  raw: string;
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
  replayedFrom?: number;
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

export interface MesaDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: { kind: "context" | "added" | "deleted" | "annotation"; content: string }[];
}

export interface MesaDiffEntry {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  hunks: MesaDiffHunk[];
}

export interface MesaDiffResponse {
  baseChangeId: string;
  headChangeId: string;
  stats: { additions: number; deletions: number; entries: number };
  entries: MesaDiffEntry[];
}

export interface MesaActivityEvent {
  id: string;
  type: "branch_created" | "file_written" | "branch_merged" | "branch_deleted" | "analysis_started" | "agent_complete";
  agent?: string;
  branch?: string;
  detail: string;
  timestamp: number;
}

export interface KeyStatus {
  mesa: boolean;
  anthropic: boolean;
}

// ── Webhook Targets ──────────────────────────────────────────────────
export interface WebhookTarget {
  id: string;
  name: string | null;
  url: string;
  events: string[];
  createdAt: string;
}

// ── Change History (rich commit log) ─────────────────────────────────
export interface MesaChange {
  id: string;
  message: string;
  author: { name: string; email: string };
  timestamp: number;
  isConflicted: boolean;
  filesChanged?: number;
}

// ── Repository Tags ──────────────────────────────────────────────────
export type RepoTags = Record<string, string>;

// ── Contract Redline Workflow ────────────────────────────────────────
export interface Clause {
  id: string;        // stable slug, e.g. "liability"
  heading: string;   // "8. Limitation of Liability"
  text: string;
}

export interface ContractMeta {
  title: string;
  parties: string[];
  version: number;
  lastApproved: string | null; // ISO timestamp
}

export interface Contract {
  meta: ContractMeta;
  clauses: Clause[];
}

export type Posture = "aggressive" | "balanced" | "minimal";

export interface RedlineEdit {
  id: string;                      // unique within a strategy, e.g. "e1"
  type: "replace" | "delete" | "insert";
  targetClauseId?: string;         // replace | delete
  afterClauseId?: string | null;   // insert position (null = prepend)
  heading?: string;                // insert | replace (new heading)
  proposedText?: string;           // replace | insert
  justification: string;
}

export interface RedlineStrategy {
  posture: Posture;
  branch: string;
  edits: RedlineEdit[];
  summary: string;
}

export interface AuditEvent {
  id: string;
  kind: "proposed" | "approved" | "rejected" | "rolled_back" | "merged";
  editId?: string;
  clauseHeading?: string;
  author: string;      // posture name or "human reviewer"
  approver?: string;
  justification?: string;
  timestamp: number;
}

export interface ReviewState {
  id: number;                              // timestamp
  status: "picking" | "gating" | "merged";
  posture: Posture | null;
  branch: string | null;                   // review/{id} once picked
  base: Contract;
  contract: Contract;                      // base ⊕ applied
  pending: RedlineEdit[];
  applied: RedlineEdit[];
  rejected: RedlineEdit[];
  audit: AuditEvent[];
  strategies?: RedlineStrategy[];          // present while status === "picking"
}
