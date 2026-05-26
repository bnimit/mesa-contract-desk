# Mesa SDK Full Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local filesystem fallback with the real Mesa SDK API, then add real diffs, an activity feed, and webhook-driven live updates to the UI.

**Architecture:** The existing `MesaService` interface in `server/services/mesa.ts` abstracts all storage operations. We add a `SdkMesa` class that implements it using the `Mesa` REST client from `@mesadev/sdk`. The interface gains new methods (`getDiff`, `getChangeId`) to expose Mesa-specific features. Server-Sent Events (SSE) push live operation logs to the frontend. Webhooks from Mesa fire into an Express endpoint that feeds the same SSE channel.

**Tech Stack:** `@mesadev/sdk` v0.28.2 (already installed), Express SSE, React `EventSource`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/services/mesa.ts` | Modify | Extend `MesaService` interface with `getDiff`, `getChangeId`, `getActivity`. Add runtime backend selection based on `MESA_API_KEY`. |
| `server/services/mesa-sdk.ts` | Create | `SdkMesa` class implementing `MesaService` using `Mesa` REST client. Maps bookmarks → branches, changes → commits. |
| `server/routes/api.ts` | Modify | Add `/api/diff`, `/api/activity` endpoints. Add SSE endpoint `/api/events`. |
| `server/routes/events.ts` | Create | SSE manager: register clients, broadcast events, webhook receiver. |
| `shared/types.ts` | Modify | Add `MesaDiffEntry`, `MesaActivityEvent`, `MesaDiffHunk` types. |
| `client/src/types.ts` | Modify | Re-export new shared types. |
| `client/src/hooks/useApi.ts` | Modify | Add `useDiff`, `useActivity` hooks. |
| `client/src/hooks/useMesaEvents.ts` | Create | `useMesaEvents` hook: EventSource subscription for SSE. |
| `client/src/components/DiffView.tsx` | Create | Renders Mesa diff hunks in a code-diff style panel. |
| `client/src/components/ActivityFeed.tsx` | Create | Live feed of Mesa operations (branch created, file written, merged). |
| `client/src/components/AgentCard.tsx` | Modify | Add expandable diff section per agent card. |
| `client/src/components/AnalysisLoading.tsx` | Modify | Show live progress from SSE events during analysis. |
| `client/src/components/ComparisonView.tsx` | Modify | Pass diff data to agent cards. |
| `client/src/App.tsx` | Modify | Add Section 05 (Activity Feed), wire SSE hook. |
| `client/src/index.css` | Modify | Add diff-line styling (added/deleted/context). |

---

### Task 1: Extend MesaService Interface and Add Shared Types

**Files:**
- Modify: `server/services/mesa.ts`
- Modify: `shared/types.ts`
- Modify: `client/src/types.ts`

- [ ] **Step 1: Add new types to `shared/types.ts`**

Append these types at the end of the file:

```typescript
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
```

- [ ] **Step 2: Re-export new types from client types**

In `client/src/types.ts`, add to the re-export list:

```typescript
export type {
  // ... existing exports ...
  MesaDiffHunk,
  MesaDiffEntry,
  MesaDiffResponse,
  MesaActivityEvent,
} from "@shared/types.js";
```

- [ ] **Step 3: Extend MesaService interface in `server/services/mesa.ts`**

Add three new methods to the `MesaService` interface and provide no-op implementations in `LocalFsMesa`:

```typescript
export interface MesaService {
  // ... existing methods ...
  getChangeId(branch: string): Promise<string | null>;
  getDiff(baseChangeId: string, headChangeId: string): Promise<import("../../shared/types.js").MesaDiffResponse | null>;
  getActivity(limit: number): Promise<import("../../shared/types.js").MesaActivityEvent[]>;
}
```

`LocalFsMesa` stubs return `null`, `null`, and `[]` respectively.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts client/src/types.ts server/services/mesa.ts
git commit -m "feat: extend MesaService interface with diff, changeId, and activity methods"
```

---

### Task 2: Implement SdkMesa Backend

**Files:**
- Create: `server/services/mesa-sdk.ts`
- Modify: `server/services/mesa.ts` (swap export)

- [ ] **Step 1: Create `server/services/mesa-sdk.ts`**

This is the core integration. The Mesa SDK uses "bookmarks" for branches and "changes" for commits. Content is base64-encoded in the REST API.

```typescript
import { Mesa } from "@mesadev/sdk";
import type { MesaService } from "./mesa.js";
import type { MesaDiffResponse, MesaDiffEntry, MesaActivityEvent } from "../../shared/types.js";

const REPO_NAME = "portfolio-advisor";

export class SdkMesa implements MesaService {
  private client: Mesa;
  private repoReady = false;

  constructor(apiKey: string) {
    this.client = new Mesa({ apiKey });
  }

  async init() {
    const org = await this.client.resolveOrg();
    try {
      await this.client.repos.get({ repo: REPO_NAME });
      this.repoReady = true;
    } catch {
      await this.client.repos.create({ name: REPO_NAME, default_bookmark: "main" });
      this.repoReady = true;
    }
  }

  async readFile(branch: string, filePath: string): Promise<string> {
    const bookmark = this.toBookmark(branch);
    const bookmarks = await this.client.bookmarks.list({ repo: REPO_NAME });
    const bm = bookmarks.bookmarks.find((b) => b.name === bookmark);
    if (!bm) throw new Error(`Bookmark ${bookmark} not found`);

    const resp = await this.client.content.get({
      repo: REPO_NAME,
      change_id: bm.change_id,
      path: filePath,
    });

    if (resp.type !== "file") throw new Error(`${filePath} is not a file`);
    return Buffer.from(resp.content, "base64").toString("utf-8");
  }

  async writeFile(branch: string, filePath: string, content: string): Promise<void> {
    const bookmark = this.toBookmark(branch);
    const bm = await this.resolveBookmark(bookmark);

    await this.client.changes.create({
      repo: REPO_NAME,
      base_change_id: bm.change_id,
      message: `write ${filePath}`,
      author: { name: "Mesa Portfolio Advisor", email: "agent@mesa.dev" },
      files: [
        {
          path: filePath,
          content: Buffer.from(content, "utf-8").toString("base64"),
          encoding: "base64" as const,
          action: "upsert" as const,
        },
      ],
    });

    // After creating a change, we need to move the bookmark forward.
    // The change.create returns the new change ID — move the bookmark to it.
    // Actually, we need the response. Let's capture it:
  }

  async listFiles(branch: string, dir: string): Promise<string[]> {
    const bookmark = this.toBookmark(branch);
    const bm = await this.resolveBookmark(bookmark);

    try {
      const resp = await this.client.content.get({
        repo: REPO_NAME,
        change_id: bm.change_id,
        path: dir,
        depth: 1,
      });
      if (resp.type !== "dir") return [];
      return resp.entries.map((e: { name: string }) => e.name).sort();
    } catch {
      return [];
    }
  }

  async createBranch(branchName: string, fromBranch: string): Promise<void> {
    const sourceBookmark = this.toBookmark(fromBranch);
    const bm = await this.resolveBookmark(sourceBookmark);
    const targetBookmark = this.toBookmark(branchName);

    await this.client.bookmarks.create({
      repo: REPO_NAME,
      name: targetBookmark,
      change_id: bm.change_id,
    });
  }

  async mergeBranch(branchName: string, intoBranch: string): Promise<void> {
    const source = this.toBookmark(branchName);
    const target = this.toBookmark(intoBranch);

    await this.client.bookmarks.merge({
      repo: REPO_NAME,
      source,
      target,
    });
  }

  async deleteBranch(branchName: string): Promise<void> {
    const bookmark = this.toBookmark(branchName);
    try {
      await this.client.bookmarks.delete({ repo: REPO_NAME, bookmark });
    } catch {
      // already deleted
    }
  }

  async listCommits(branch: string, limit: number): Promise<{ hash: string; message: string; timestamp: number }[]> {
    const bookmark = this.toBookmark(branch);
    try {
      const resp = await this.client.changes.list({
        repo: REPO_NAME,
        bookmark,
        limit,
      });
      return resp.changes.map((c) => ({
        hash: c.id,
        message: c.message,
        timestamp: new Date(c.created_at).getTime(),
      }));
    } catch {
      return [];
    }
  }

  async getChangeId(branch: string): Promise<string | null> {
    const bookmark = this.toBookmark(branch);
    const bm = await this.resolveBookmark(bookmark);
    return bm?.change_id ?? null;
  }

  async getDiff(baseChangeId: string, headChangeId: string): Promise<MesaDiffResponse | null> {
    try {
      const resp = await this.client.diffs.get({
        repo: REPO_NAME,
        base_change_id: baseChangeId,
        head_change_id: headChangeId,
      });

      return {
        baseChangeId: resp.base_change_id,
        headChangeId: resp.head_change_id,
        stats: {
          additions: resp.stats.additions,
          deletions: resp.stats.deletions,
          entries: resp.stats.entries,
        },
        entries: resp.entries.map((e): MesaDiffEntry => ({
          path: e.path,
          status: e.status,
          hunks: (e.hunks ?? []).map((h) => ({
            oldStart: h.old_start,
            oldLines: h.old_lines,
            newStart: h.new_start,
            newLines: h.new_lines,
            lines: h.lines.map((l) => ({ kind: l.kind, content: l.content })),
          })),
        })),
      };
    } catch {
      return null;
    }
  }

  async getActivity(limit: number): Promise<MesaActivityEvent[]> {
    try {
      const resp = await this.client.changes.list({ repo: REPO_NAME, limit });
      return resp.changes.map((c) => ({
        id: c.id,
        type: "file_written" as const,
        detail: c.message,
        timestamp: new Date(c.created_at).getTime(),
      }));
    } catch {
      return [];
    }
  }

  backendName() {
    return "mesa-sdk";
  }

  private toBookmark(branch: string): string {
    // Mesa bookmarks can't contain '/' — replace with '--'
    return branch.replace(/\//g, "--");
  }

  private async resolveBookmark(bookmark: string) {
    const resp = await this.client.bookmarks.list({ repo: REPO_NAME });
    const bm = resp.bookmarks.find((b) => b.name === bookmark);
    if (!bm) throw new Error(`Bookmark '${bookmark}' not found in repo ${REPO_NAME}`);
    return bm;
  }
}
```

**Important implementation note:** The `writeFile` method needs to capture the change ID from `changes.create` and then `bookmarks.move` the bookmark forward. Let me fix that in the actual implementation — the plan above shows the structure, but the `writeFile` body needs:

```typescript
async writeFile(branch: string, filePath: string, content: string): Promise<void> {
  const bookmark = this.toBookmark(branch);
  const bm = await this.resolveBookmark(bookmark);

  const change = await this.client.changes.create({
    repo: REPO_NAME,
    base_change_id: bm.change_id,
    message: `write ${filePath}`,
    author: { name: "Mesa Portfolio Advisor", email: "agent@mesa.dev" },
    files: [
      {
        path: filePath,
        content: Buffer.from(content, "utf-8").toString("base64"),
        encoding: "base64" as const,
        action: "upsert" as const,
      },
    ],
  });

  await this.client.bookmarks.move({
    repo: REPO_NAME,
    bookmark,
    change_id: change.id,
  });
}
```

- [ ] **Step 2: Update `server/services/mesa.ts` to select backend at runtime**

Replace the final export in `mesa.ts` with:

```typescript
import { SdkMesa } from "./mesa-sdk.js";

function createBackend(): MesaService {
  const apiKey = process.env.MESA_API_KEY;
  if (apiKey && apiKey.length > 0) {
    console.log("Using Mesa SDK backend (api.mesa.dev)");
    return new SdkMesa(apiKey);
  }
  console.log("Using local filesystem backend (mesa-repo/)");
  return new LocalFsMesa();
}

export const mesa: MesaService = createBackend();
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 4: Test with local backend (no MESA_API_KEY)**

Run the server and confirm it still uses `local-fs`:
```bash
npx tsx server/index.ts
```
Expected: Console shows "Using local filesystem backend" and the app functions normally.

- [ ] **Step 5: Test with Mesa backend**

Set `MESA_API_KEY` in `.env` and restart the server:
```bash
npx tsx server/index.ts
```
Expected: Console shows "Using Mesa SDK backend" and `init()` creates or finds the `portfolio-advisor` repo. The `/api/settings` endpoint should show `mesa-sdk` as active.

- [ ] **Step 6: Commit**

```bash
git add server/services/mesa-sdk.ts server/services/mesa.ts
git commit -m "feat: add SdkMesa backend using Mesa REST API with runtime backend selection"
```

---

### Task 3: Add Diff API Endpoint and UI

**Files:**
- Modify: `server/routes/api.ts`
- Create: `client/src/components/DiffView.tsx`
- Modify: `client/src/hooks/useApi.ts`
- Modify: `client/src/components/AgentCard.tsx`
- Modify: `client/src/components/ComparisonView.tsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Add `/api/diff` endpoint to `server/routes/api.ts`**

After the existing `/analyze` endpoint, add:

```typescript
apiRouter.get("/diff", async (req, res) => {
  try {
    const { base, head } = req.query as { base?: string; head?: string };
    if (!base || !head) {
      res.status(400).json({ error: "base and head change IDs required" });
      return;
    }
    const diff = await mesa.getDiff(base, head);
    res.json({ diff });
  } catch (error) {
    res.status(500).json({ error: "Failed to get diff" });
  }
});
```

Also, modify the `runAnalysis` function to capture and return change IDs for each agent branch. Before agents run, capture the "before" change ID for main. After each agent runs, capture the "after" change ID on the agent branch. Include both in the response so the client can request diffs.

In the analysis response, add a `changeIds` map:

```typescript
// Inside runAnalysis, after agents finish:
const changeIds: Record<string, { base: string | null; head: string | null }> = {};
for (const a of agents) {
  const baseId = await mesa.getChangeId("main");
  const headId = await mesa.getChangeId(a.branch);
  changeIds[a.branch] = { base: baseId, head: headId };
}

return { timestamp, results, replayedFrom, changeIds };
```

- [ ] **Step 2: Add diff line styles to `client/src/index.css`**

```css
.diff-added {
  background: rgba(31, 107, 63, 0.08);
}

.diff-deleted {
  background: rgba(160, 40, 37, 0.08);
}

.diff-annotation {
  color: var(--color-mute);
  font-style: italic;
}
```

- [ ] **Step 3: Create `client/src/components/DiffView.tsx`**

```tsx
import type { MesaDiffEntry } from "../types.js";

interface DiffViewProps {
  entries: MesaDiffEntry[];
  agentColor: string;
}

export function DiffView({ entries, agentColor }: DiffViewProps) {
  if (entries.length === 0) return null;

  return (
    <div className="border border-line bg-canvas-2/30 font-mono text-xs">
      <div className="px-3 py-2 border-b border-line section-label flex items-center justify-between">
        <span>Mesa diff · files changed</span>
        <span className={`${agentColor} text-[10px]`}>
          {entries.length} file{entries.length !== 1 ? "s" : ""}
        </span>
      </div>
      {entries.map((entry) => (
        <div key={entry.path}>
          <div className="px-3 py-1.5 border-b border-line/60 flex items-center gap-2 text-ink-2">
            <span className={
              entry.status === "added" ? "text-up" :
              entry.status === "deleted" ? "text-down" : "text-ink-2"
            }>
              {entry.status === "added" ? "A" : entry.status === "deleted" ? "D" : "M"}
            </span>
            <span>{entry.path}</span>
          </div>
          {entry.hunks.length > 0 && (
            <div className="p-3 leading-relaxed whitespace-pre-wrap">
              {entry.hunks.map((hunk, hi) => (
                <div key={hi}>
                  <div className="diff-annotation text-[10px] mb-1">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  </div>
                  {hunk.lines.map((line, li) => (
                    <div
                      key={li}
                      className={
                        line.kind === "added" ? "diff-added" :
                        line.kind === "deleted" ? "diff-deleted" :
                        line.kind === "annotation" ? "diff-annotation" : ""
                      }
                    >
                      <span className={
                        line.kind === "added" ? "text-up" :
                        line.kind === "deleted" ? "text-down" : "text-mute-2"
                      }>
                        {line.kind === "added" ? "+" : line.kind === "deleted" ? "-" : " "}
                      </span>
                      {" "}{line.content}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update `AgentCard.tsx` to accept and show diffs**

Add an optional `diff` prop of type `MesaDiffEntry[] | undefined`. Render `<DiffView>` in a `<details>` block below the playbook diff, only when diff data exists.

```tsx
// In the AgentCard props:
interface AgentCardProps {
  result: AgentResult;
  onAccept: () => void;
  diff?: MesaDiffEntry[];
}

// In the component body, after the PlaybookDiff block:
{diff && diff.length > 0 && (
  <details className="mb-6 group/diff">
    <summary className="section-label cursor-pointer hover:text-ink transition-colors flex items-center gap-2">
      <span>Mesa diff</span>
      <span className="text-mute-2 group-open/diff:rotate-90 transition-transform">›</span>
    </summary>
    <div className="mt-3">
      <DiffView entries={diff} agentColor={meta.color} />
    </div>
  </details>
)}
```

- [ ] **Step 5: Update `ComparisonView.tsx` to pass diffs through**

Add `diffs` prop of type `Record<string, MesaDiffEntry[]>` and pass each agent's diff to its `AgentCard`.

```tsx
interface ComparisonViewProps {
  results: AgentResult[];
  onAccept: (branch: string) => void;
  onDismiss: () => void;
  diffs?: Record<string, MesaDiffEntry[]>;
}

// In the JSX, when rendering AgentCard:
<AgentCard result={r} onAccept={() => onAccept(r.branch)} diff={diffs?.[r.branch]} />
```

- [ ] **Step 6: Update `useApi.ts` analysis hook to fetch diffs**

After analysis completes, if `changeIds` is present in the response, fetch diffs for each agent branch and store them in state. Pass through to the analysis state.

Update `AnalysisState` in `client/src/types.ts`:
```typescript
| { status: "done"; timestamp: number; results: AgentResult[]; diffs?: Record<string, MesaDiffEntry[]> }
```

In `useAnalysis`, after receiving results:
```typescript
let diffs: Record<string, MesaDiffEntry[]> | undefined;
if (data.changeIds) {
  diffs = {};
  for (const [branch, ids] of Object.entries(data.changeIds as Record<string, { base: string; head: string }>)) {
    if (ids.base && ids.head) {
      try {
        const diffRes = await fetch(`/api/diff?base=${ids.base}&head=${ids.head}`);
        const diffData = await diffRes.json();
        if (diffData.diff) diffs[branch] = diffData.diff.entries;
      } catch { /* skip */ }
    }
  }
}
setState({ status: "done", timestamp: data.timestamp, results: data.results, diffs });
```

- [ ] **Step 7: Wire diffs from App.tsx to ComparisonView**

In `App.tsx`, when rendering `ComparisonView`:
```tsx
<ComparisonView
  results={state.results}
  onAccept={handleAccept}
  onDismiss={handleDismiss}
  diffs={state.status === "done" ? state.diffs : undefined}
/>
```

- [ ] **Step 8: Verify the diff UI works**

Run the app, trigger an analysis. If using the Mesa SDK backend, diffs should appear in the agent cards. If using local-fs backend, the diff section simply won't appear (getDiff returns null).

- [ ] **Step 9: Commit**

```bash
git add server/routes/api.ts client/src/components/DiffView.tsx client/src/components/AgentCard.tsx client/src/components/ComparisonView.tsx client/src/hooks/useApi.ts client/src/types.ts client/src/App.tsx client/src/index.css
git commit -m "feat: add real Mesa diff view in agent comparison cards"
```

---

### Task 4: SSE Infrastructure and Activity Feed

**Files:**
- Create: `server/routes/events.ts`
- Modify: `server/index.ts`
- Modify: `server/routes/api.ts`
- Create: `client/src/hooks/useMesaEvents.ts`
- Create: `client/src/components/ActivityFeed.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `server/routes/events.ts` (SSE manager)**

This module manages SSE connections and provides a `broadcast` function other modules can call.

```typescript
import type { Request, Response } from "express";
import type { MesaActivityEvent } from "../../shared/types.js";

const clients = new Set<Response>();
let eventId = 0;

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(":\n\n"); // comment to establish connection

  clients.add(res);
  req.on("close", () => clients.delete(res));
}

export function broadcast(event: MesaActivityEvent) {
  eventId++;
  const data = `id: ${eventId}\nevent: mesa\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

export function emitActivity(
  type: MesaActivityEvent["type"],
  detail: string,
  extra?: { agent?: string; branch?: string }
) {
  broadcast({
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 6),
    type,
    detail,
    timestamp: Date.now(),
    ...extra,
  });
}
```

- [ ] **Step 2: Mount SSE endpoint in `server/index.ts`**

After `app.use("/api", apiRouter);`, add:

```typescript
import { sseHandler } from "./routes/events.js";

app.get("/api/events", sseHandler);
```

- [ ] **Step 3: Instrument `api.ts` with activity emissions**

Import `emitActivity` from `events.ts` and sprinkle emit calls in key spots:

- In `runAnalysis`, after creating each agent branch:
  ```typescript
  emitActivity("branch_created", `Forked ${a.branch} from main`, { branch: a.branch });
  ```

- In `runAnalysis`, after each agent finishes (inside `Promise.all` wrapping):
  ```typescript
  // Wrap each runAgent in a helper that emits on completion
  const runAndEmit = async (a: typeof agents[0]) => {
    emitActivity("analysis_started", `${a.config.name} analyzing portfolio`, { agent: a.config.name, branch: a.branch });
    const result = await runAgent(a.config, a.branch, currentPrices, { timestamp });
    emitActivity("agent_complete", `${a.config.name} finished: ${result.status}`, { agent: a.config.name, branch: a.branch });
    return result;
  };
  const results = await Promise.all(agents.map(runAndEmit));
  ```

- In merge: `emitActivity("branch_merged", ...)` 
- In deleteBranch loop: `emitActivity("branch_deleted", ...)`

- [ ] **Step 4: Add `/api/activity` endpoint**

```typescript
apiRouter.get("/activity", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const events = await mesa.getActivity(limit);
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: "Failed to load activity" });
  }
});
```

- [ ] **Step 5: Create `client/src/hooks/useMesaEvents.ts`**

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import type { MesaActivityEvent } from "../types.js";

export function useMesaEvents() {
  const [events, setEvents] = useState<MesaActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("mesa", (e) => {
      try {
        const event: MesaActivityEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 50));
      } catch { /* ignore malformed */ }
    });

    return () => es.close();
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, clear };
}
```

- [ ] **Step 6: Create `client/src/components/ActivityFeed.tsx`**

```tsx
import type { MesaActivityEvent } from "../types.js";

interface ActivityFeedProps {
  events: MesaActivityEvent[];
  connected: boolean;
}

const TYPE_ICONS: Record<MesaActivityEvent["type"], string> = {
  branch_created: "⑂",
  file_written: "✎",
  branch_merged: "⊕",
  branch_deleted: "✕",
  analysis_started: "◌",
  agent_complete: "◉",
};

const TYPE_COLORS: Record<MesaActivityEvent["type"], string> = {
  branch_created: "text-mesa",
  file_written: "text-ink-2",
  branch_merged: "text-up",
  branch_deleted: "text-mute",
  analysis_started: "text-mesa",
  agent_complete: "text-up",
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export function ActivityFeed({ events, connected }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="serif-quote text-lg text-mute">
          No activity yet. Run an analysis to see Mesa operations stream in.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4 font-mono text-xs text-mute">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-up" : "bg-down"}`} />
          <span>SSE {connected ? "connected" : "disconnected"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-line">
      <div className="px-6 py-3 border-b border-line flex items-center justify-between">
        <div className="section-label">Live operations</div>
        <div className="flex items-center gap-2 font-mono text-xs text-mute">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-up" : "bg-down"}`} />
          <span>SSE {connected ? "connected" : "disconnected"}</span>
        </div>
      </div>
      <div className="divide-y divide-line/60 max-h-80 overflow-y-auto">
        {events.map((e) => (
          <div key={e.id} className="px-6 py-3 flex items-start gap-3 reveal">
            <span className={`font-mono text-sm mt-0.5 ${TYPE_COLORS[e.type]}`}>
              {TYPE_ICONS[e.type]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-ink leading-relaxed">{e.detail}</div>
              <div className="flex items-center gap-3 mt-1">
                {e.agent && (
                  <span className="font-mono text-[10px] tracking-widest uppercase text-mute">
                    {e.agent}
                  </span>
                )}
                {e.branch && (
                  <span className="font-mono text-[10px] text-mute-2 truncate">
                    {e.branch}
                  </span>
                )}
              </div>
            </div>
            <span className="font-mono text-[10px] text-mute-2 whitespace-nowrap mt-0.5">
              {relativeTime(e.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire ActivityFeed into App.tsx**

Add a new Section 05 between the current Playbook section and the footer:

```tsx
import { useMesaEvents } from "./hooks/useMesaEvents.js";
import { ActivityFeed } from "./components/ActivityFeed.js";

// Inside App():
const { events: mesaEvents, connected: sseConnected } = useMesaEvents();

// In JSX, after section 04:
{/* Section 05: Activity */}
<div className="hairline mb-20" />
<div className="grid grid-cols-12 gap-8 mb-20">
  <aside className="col-span-12 md:col-span-2">
    <div className="section-number">05</div>
    <div className="section-label mt-4">Activity</div>
  </aside>
  <div className="col-span-12 md:col-span-10">
    <ActivityFeed events={mesaEvents} connected={sseConnected} />
  </div>
</div>
```

- [ ] **Step 8: Verify SSE and activity feed work**

Start the server and client. Open the app. The activity section should show "No activity yet" with a green SSE dot. Run an analysis — events should stream in live showing branches being created, agents starting, agents completing.

- [ ] **Step 9: Commit**

```bash
git add server/routes/events.ts server/index.ts server/routes/api.ts client/src/hooks/useMesaEvents.ts client/src/components/ActivityFeed.tsx client/src/App.tsx
git commit -m "feat: add SSE-powered live activity feed for Mesa operations"
```

---

### Task 5: Live Analysis Progress via SSE

**Files:**
- Modify: `client/src/components/AnalysisLoading.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update `AnalysisLoading.tsx` to accept live events**

Add a prop for the event stream and show real-time agent status:

```tsx
import type { MesaActivityEvent } from "../types.js";

interface AnalysisLoadingProps {
  events?: MesaActivityEvent[];
}

export function AnalysisLoading({ events = [] }: AnalysisLoadingProps) {
  const branches = [
    { name: "fundamentals", color: "text-fundamentals", label: "Fundamental analysis", key: "Fundamentals" },
    { name: "sentiment", color: "text-sentiment", label: "Market sentiment", key: "Sentiment" },
    { name: "technical", color: "text-technical", label: "Technical analysis", key: "Technical" },
  ];

  const agentStatus = (agentKey: string): "waiting" | "running" | "done" => {
    const complete = events.find(
      (e) => e.type === "agent_complete" && e.agent === agentKey
    );
    if (complete) return "done";
    const started = events.find(
      (e) => e.type === "analysis_started" && e.agent === agentKey
    );
    if (started) return "running";
    return "waiting";
  };

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-8 pb-6 border-b border-line">
        <div>
          <div className="section-label mb-2 flex items-center gap-2">
            <span className="dot-1">●</span>
            <span className="dot-2">●</span>
            <span className="dot-3">●</span>
            <span className="ml-2">Branching from main</span>
          </div>
          <h2 className="display-heading text-3xl">
            Agents working in parallel
          </h2>
        </div>
      </div>

      <div className="font-mono text-sm space-y-3 py-8 px-4">
        <div className="flex items-center gap-3 text-mute">
          <span className="text-ink">●</span>
          <span className="text-ink">main</span>
          <span className="text-mute-2">↳</span>
        </div>

        {branches.map((b, i) => {
          const status = agentStatus(b.key);
          return (
            <div
              key={b.name}
              className="reveal flex items-center gap-3"
              style={{ animationDelay: `${0.2 + i * 0.15}s` }}
            >
              <span className="text-mute-2 ml-3">├──</span>
              <span className={b.color}>
                {status === "done" ? (
                  <span>●</span>
                ) : status === "running" ? (
                  <span className="dot-1" style={{ animationDelay: `${i * 0.2}s` }}>○</span>
                ) : (
                  <span className="text-mute-2">○</span>
                )}
              </span>
              <span className={b.color}>agent/{b.name}</span>
              <span className="text-mute text-xs">
                — {status === "done" ? "complete ✓" : status === "running" ? b.label : "waiting"}
              </span>
            </div>
          );
        })}

        <div className="pt-4 text-xs text-mute italic font-sans">
          Each agent reads <span className="font-mono not-italic text-ink-2">portfolio.json</span>, fetches market data, writes its proposal to its own branch. No locks, no conflicts.
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Pass events to `AnalysisLoading` from `App.tsx`**

```tsx
{state.status === "loading" && <AnalysisLoading events={mesaEvents} />}
```

- [ ] **Step 3: Verify live progress works**

Run an analysis. The loading UI should show each agent transitioning from "waiting" → "running" → "complete ✓" in real-time as SSE events arrive.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/AnalysisLoading.tsx client/src/App.tsx
git commit -m "feat: show live agent progress during analysis via SSE"
```

---

### Task 6: Update Settings Panel and Backend Description

**Files:**
- Modify: `server/routes/api.ts` (settings endpoint)
- Modify: `client/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Update the settings endpoint descriptions**

In `api.ts`, update the `mesa-sdk` backend description to reflect that it's now functional:

```typescript
{
  name: "mesa-sdk",
  label: "Mesa SDK · api.mesa.dev",
  description:
    "Real branches on Mesa's versioned filesystem. Sub-50ms reads, instant forks, full audit trail. Connected via MESA_API_KEY.",
  available: hasMesaKey,
  active: active === "mesa-sdk",
},
```

- [ ] **Step 2: Add repo info to settings response**

When the Mesa SDK is active, include org and repo info:

```typescript
// In the settings handler, after building backends array:
let mesaInfo: { org?: string; repo?: string; whoami?: string } | undefined;
if (active === "mesa-sdk") {
  try {
    const { Mesa } = await import("@mesadev/sdk");
    const client = new Mesa({ apiKey: process.env.MESA_API_KEY });
    const who = await client.whoami();
    mesaInfo = { org: who.org.slug, repo: "portfolio-advisor", whoami: who.key_name ?? who.key_id ?? "unknown" };
  } catch { /* skip */ }
}
res.json({ backends, mesaInfo });
```

- [ ] **Step 3: Show Mesa connection info in SettingsPanel**

When the mesa-sdk backend is active and `mesaInfo` is present, display org, repo, and key info:

```tsx
// Add mesaInfo to props
interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  backends: StorageBackend[];
  loading: boolean;
  mesaInfo?: { org?: string; repo?: string; whoami?: string };
}

// In the JSX, after the backends list and before "How the swap works":
{mesaInfo && (
  <div className="mt-8 pt-6 border-t border-line">
    <div className="section-label mb-3">Mesa connection</div>
    <div className="font-mono text-xs space-y-2 text-ink-2">
      <div className="flex justify-between">
        <span className="text-mute">org</span>
        <span>{mesaInfo.org}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-mute">repo</span>
        <span>{mesaInfo.repo}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-mute">key</span>
        <span>{mesaInfo.whoami}</span>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Update `useSettings` hook and pass mesaInfo through**

In `useApi.ts`, the settings response now includes `mesaInfo`. Add it to the hook return value. In `App.tsx`, pass it to `SettingsPanel`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/api.ts client/src/components/SettingsPanel.tsx client/src/hooks/useApi.ts client/src/App.tsx
git commit -m "feat: show Mesa connection details in settings panel"
```

---

### Task 7: Webhook Receiver (Optional Enhancement)

**Files:**
- Modify: `server/routes/events.ts`
- Modify: `server/index.ts`

This task adds a webhook endpoint that Mesa can call when events happen on the repo (e.g., from other clients or external changes). This extends the activity feed beyond just this app's own operations.

- [ ] **Step 1: Add webhook receiver endpoint**

In `server/index.ts`, add a webhook route:

```typescript
import { Mesa } from "@mesadev/sdk";

// After existing middleware:
app.post("/api/webhooks/mesa", express.raw({ type: "application/json" }), async (req, res) => {
  const apiKey = process.env.MESA_API_KEY;
  const webhookSecret = process.env.MESA_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    res.status(501).json({ error: "Webhooks not configured" });
    return;
  }

  const client = new Mesa({ apiKey, webhookSecret });

  client.webhooks.on("change.created", (event) => {
    emitActivity("file_written", `External change: ${event.payload.message ?? "no message"}`, {
      branch: event.payload.bookmark_name,
    });
  });

  client.webhooks.on("bookmark.merged", (event) => {
    emitActivity("branch_merged", `External merge: ${event.payload.source} → ${event.payload.target}`, {
      branch: event.payload.target,
    });
  });

  try {
    await client.webhooks.receive(new Request(req.url!, {
      method: "POST",
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([, v]) => typeof v === "string") as [string, string][]
      ),
      body: req.body,
    }));
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Invalid webhook" });
  }
});
```

- [ ] **Step 2: Add `MESA_WEBHOOK_SECRET` to `.env.example`**

```
MESA_WEBHOOK_SECRET=            # Optional — for receiving Mesa webhooks
```

- [ ] **Step 3: Commit**

```bash
git add server/index.ts .env.example
git commit -m "feat: add Mesa webhook receiver for external activity events"
```

---

### Task 8: End-to-End Verification

- [ ] **Step 1: Test with local-fs backend (no MESA_API_KEY)**

Ensure nothing is broken:
- Start server and client
- Verify portfolio loads
- Run analysis → agents complete → comparison view shows
- Merge one agent → portfolio updates
- History and playbook update
- Activity feed shows SSE events
- Settings panel shows local-fs as active

- [ ] **Step 2: Test with Mesa SDK backend**

Set `MESA_API_KEY` in `.env`:
- Start server — should log "Using Mesa SDK backend"
- Settings panel should show mesa-sdk as active with connection info
- Run analysis — verify branches created on Mesa, agents work, merge works
- Check diffs appear in agent cards
- Verify activity feed streams events
- Check history/playbook persist across server restarts

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```
