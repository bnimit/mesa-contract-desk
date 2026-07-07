import { Mesa } from "@mesadev/sdk";
import type { MesaService } from "./mesa.js";
import type {
  MesaDiffResponse,
  MesaDiffEntry,
  MesaDiffHunk,
  MesaActivityEvent,
  WebhookTarget,
  MesaChange,
  RepoTags,
} from "../../shared/types.js";

const REPO_NAME = "contract-redline";
const AUTHOR = { name: "Mesa Contract Desk", email: "bot@mesa.dev" };

/**
 * Returns true when an SDK error looks like a 404 / NOT_FOUND.
 * The Mesa SDK throws the raw error body `{ error: { code, message } }`,
 * so we pattern-match on that shape.
 */
function isNotFound(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    // Shape 1: { error: { code: "NOT_FOUND" } }
    if (e.error && typeof e.error === "object") {
      const inner = e.error as Record<string, unknown>;
      if (
        typeof inner.code === "string" &&
        inner.code.toUpperCase().includes("NOT_FOUND")
      ) {
        return true;
      }
    }
    // Shape 2: { code: "NOT_FOUND" }  (in case the SDK unwraps)
    if (
      typeof e.code === "string" &&
      e.code.toUpperCase().includes("NOT_FOUND")
    ) {
      return true;
    }
  }
  return false;
}

export class SdkMesa implements MesaService {
  private readonly client: Mesa;

  constructor(apiKey: string) {
    this.client = new Mesa({ apiKey });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Resolve a bookmark name to its current change_id.
   * Fetches the full bookmark list (the repo will rarely have more than
   * a handful of bookmarks) and finds the matching entry.
   */
  private async resolveBookmark(name: string): Promise<string> {
    const res = await this.client.bookmarks.list({ repo: REPO_NAME });
    const bm = res.bookmarks.find((b) => b.name === name);
    if (!bm) {
      throw new Error(`Bookmark "${name}" not found in repo ${REPO_NAME}`);
    }
    return bm.change_id;
  }

  // ── MesaService implementation ──────────────────────────────────────

  async init(): Promise<void> {
    await this.client.resolveOrg();

    try {
      await this.client.repos.get({ repo: REPO_NAME });
    } catch (err: unknown) {
      if (isNotFound(err)) {
        await this.client.repos.create({
          name: REPO_NAME,
          default_bookmark: "main",
        });
        console.log(`Created Mesa repo "${REPO_NAME}"`);
        return;
      }
      throw err;
    }

    // Ensure the "main" bookmark exists. If it was deleted (e.g. by a demo
    // reset), recreate the repo so we get a clean "main" bookmark.
    const res = await this.client.bookmarks.list({ repo: REPO_NAME });
    if (!res.bookmarks.some((b) => b.name === "main")) {
      console.log("Main bookmark missing — recreating repo");
      await this.client.repos.delete({ repo: REPO_NAME });
      await this.client.repos.create({
        name: REPO_NAME,
        default_bookmark: "main",
      });
    }
  }

  async readFile(branch: string, filePath: string): Promise<string> {
    const changeId = await this.resolveBookmark(branch);
    const res = await this.client.content.get({
      repo: REPO_NAME,
      change_id: changeId,
      path: filePath,
    });
    if (res.type !== "file") {
      throw new Error(
        `Expected file at "${filePath}" but got ${res.type}`,
      );
    }
    return Buffer.from(res.content, "base64").toString("utf-8");
  }

  async writeFile(
    branch: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    const changeId = await this.resolveBookmark(branch);
    const encoded = Buffer.from(content, "utf-8").toString("base64");

    const change = await this.client.changes.create({
      repo: REPO_NAME,
      base_change_id: changeId,
      message: `write ${filePath}`,
      author: AUTHOR,
      files: [
        {
          path: filePath,
          content: encoded,
          encoding: "base64",
          action: "upsert",
        },
      ],
    });

    // Advance the bookmark to the newly created change.
    await this.client.bookmarks.move({
      repo: REPO_NAME,
      bookmark: branch,
      change_id: change.id,
    });
  }

  async writeFiles(
    branch: string,
    files: { path: string; content: string }[],
  ): Promise<void> {
    if (files.length === 0) return;
    const changeId = await this.resolveBookmark(branch);

    // One change carrying every file, then a single bookmark move — turns an
    // N-file save from 3N round-trips into 3, which matters a lot on the
    // network-backed cloud backend.
    const change = await this.client.changes.create({
      repo: REPO_NAME,
      base_change_id: changeId,
      message: `write ${files.map((f) => f.path).join(", ")}`,
      author: AUTHOR,
      files: files.map((f) => ({
        path: f.path,
        content: Buffer.from(f.content, "utf-8").toString("base64"),
        encoding: "base64",
        action: "upsert" as const,
      })),
    });

    await this.client.bookmarks.move({
      repo: REPO_NAME,
      bookmark: branch,
      change_id: change.id,
    });
  }

  async deleteFile(branch: string, filePath: string): Promise<void> {
    // Mesa SDK doesn't have a delete content API — overwrite with empty marker
    await this.writeFile(branch, filePath, "");
  }

  async listFiles(branch: string, dir: string): Promise<string[]> {
    const changeId = await this.resolveBookmark(branch);
    try {
      const res = await this.client.content.get({
        repo: REPO_NAME,
        change_id: changeId,
        path: dir,
        depth: 1,
      });
      if (res.type === "dir") {
        return res.entries.map((e) => e.name).sort();
      }
      // If the path itself is a file, return its name as the sole entry.
      return [res.name];
    } catch (err: unknown) {
      if (isNotFound(err)) {
        return [];
      }
      throw err;
    }
  }

  async createBranch(
    branchName: string,
    fromBranch: string,
  ): Promise<void> {
    const changeId = await this.resolveBookmark(fromBranch);
    await this.client.bookmarks.create({
      repo: REPO_NAME,
      name: branchName,
      change_id: changeId,
    });
  }

  async mergeBranch(
    branchName: string,
    intoBranch: string,
  ): Promise<void> {
    await this.client.bookmarks.merge({
      repo: REPO_NAME,
      source: branchName,
      target: intoBranch,
    });
  }

  async deleteBranch(branchName: string): Promise<void> {
    try {
      await this.client.bookmarks.delete({
        repo: REPO_NAME,
        bookmark: branchName,
      });
    } catch {
      // Already deleted or never existed — that's fine.
    }
  }

  async listCommits(
    branch: string,
    limit: number,
  ): Promise<{ hash: string; message: string; timestamp: number }[]> {
    const res = await this.client.changes.list({
      repo: REPO_NAME,
      bookmark: branch,
      limit,
    });
    return res.changes.map((c) => ({
      hash: c.id,
      message: c.message,
      timestamp: new Date(c.created_at).getTime(),
    }));
  }

  backendName(): string {
    return "mesa-sdk";
  }

  async getChangeId(branch: string): Promise<string | null> {
    try {
      return await this.resolveBookmark(branch);
    } catch {
      return null;
    }
  }

  async getDiff(
    baseChangeId: string,
    headChangeId: string,
  ): Promise<MesaDiffResponse | null> {
    try {
      const res = await this.client.diffs.get({
        repo: REPO_NAME,
        base_change_id: baseChangeId,
        head_change_id: headChangeId,
      });

      const entries: MesaDiffEntry[] = res.entries.map((e) => {
        const hunks: MesaDiffHunk[] = (e.hunks ?? []).map((h) => ({
          oldStart: h.old_start,
          oldLines: h.old_lines,
          newStart: h.new_start,
          newLines: h.new_lines,
          lines: h.lines.map((l) => ({
            kind: l.kind,
            content: l.text,
          })),
        }));
        return {
          path: e.path,
          status: e.status,
          hunks,
        };
      });

      return {
        baseChangeId: res.base_change_id,
        headChangeId: res.head_change_id,
        stats: {
          additions: res.stats.additions,
          deletions: res.stats.deletions,
          entries: res.stats.entries,
        },
        entries,
      };
    } catch {
      return null;
    }
  }

  async getActivity(limit: number): Promise<MesaActivityEvent[]> {
    try {
      const res = await this.client.changes.list({
        repo: REPO_NAME,
        limit,
      });
      return res.changes.map((c) => ({
        id: c.id,
        type: "file_written" as const,
        detail: c.message,
        timestamp: new Date(c.created_at).getTime(),
      }));
    } catch {
      return [];
    }
  }

  // ── Webhook Targets ────────────────────────────────────────────────

  async listWebhookTargets(): Promise<WebhookTarget[]> {
    try {
      const res = await this.client.webhookTargets.list();
      return res.webhook_targets.map((t) => ({
        id: t.id,
        name: t.name,
        url: t.url,
        events: t.events,
        createdAt: t.created_at,
      }));
    } catch {
      return [];
    }
  }

  async createWebhookTarget(url: string, name?: string, events?: string[]): Promise<WebhookTarget> {
    const res = await this.client.webhookTargets.create({
      url,
      name: name || undefined,
      events: (events as any) || undefined,
    });
    return {
      id: res.id,
      name: res.name,
      url: res.url,
      events: res.events,
      createdAt: res.created_at,
    };
  }

  async deleteWebhookTarget(id: string): Promise<void> {
    await this.client.webhookTargets.delete({ webhookTargetId: id });
  }

  // ── Rich Change History ────────────────────────────────────────────

  async listChanges(limit: number): Promise<MesaChange[]> {
    try {
      const res = await this.client.changes.list({
        repo: REPO_NAME,
        limit,
      });
      return res.changes.map((c) => ({
        id: c.id,
        message: c.message,
        author: { name: c.author.name, email: c.author.email },
        timestamp: new Date(c.created_at).getTime(),
        isConflicted: c.is_conflicted,
      }));
    } catch {
      return [];
    }
  }

  // ── Repository Tags ────────────────────────────────────────────────

  async getRepoTags(): Promise<RepoTags> {
    try {
      const res = await this.client.repos.get({ repo: REPO_NAME });
      return res.tags ?? {};
    } catch {
      return {};
    }
  }

  async setRepoTags(tags: Record<string, string | null>): Promise<RepoTags> {
    const res = await this.client.repos.update({
      repo: REPO_NAME,
      tags,
    });
    return res.tags ?? {};
  }
}
