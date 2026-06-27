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

export interface RedlineEdit {
  id: string;                      // unique within a strategy, e.g. "e1"
  type: "replace" | "delete" | "insert";
  targetClauseId?: string;         // replace | delete
  afterClauseId?: string | null;   // insert position (null = prepend)
  heading?: string;                // insert | replace (new heading)
  proposedText?: string;           // replace | insert
  justification: string;
}

export interface AuditEvent {
  id: string;
  kind: "proposed" | "approved" | "rejected" | "rolled_back" | "merged";
  editId?: string;
  clauseHeading?: string;
  author: string;      // department name or "human reviewer"
  approver?: string;
  justification?: string;
  timestamp: number;
}

export type Department = "legal" | "finance" | "security" | "commercial" | "privacy";

export interface Persona {
  id: Department;
  label: string;
  domain: string;        // what this reviewer redlines (used in the agent prompt + UI)
  color: string;         // hex, for cards / branches / audit
  cannedAvailable: boolean;
}

export interface ClauseProposal {
  department: Department;
  edit: RedlineEdit;
}

export interface ClauseDecision {
  id: string;                          // stable: "dec-{clauseId}" or "dec-ins-{department}-{editId}"
  kind: "modify" | "insert";
  targetClauseId?: string;
  heading: string;
  originalText: string | null;         // null for insert
  proposals: ClauseProposal[];
  acceptedDepartment: Department | null;
  decided: boolean;
}

export interface ReviewState {
  id: number;
  status: "merging" | "merged";
  base: Contract;
  contract: Contract;                  // base ⊕ accepted
  decisions: ClauseDecision[];
  departments: Department[];           // who reviewed
  audit: AuditEvent[];
}
