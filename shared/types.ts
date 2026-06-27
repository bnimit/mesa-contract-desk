export interface StorageBackend {
  name: string;
  label: string;
  description: string;
  available: boolean;
  active: boolean;
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
