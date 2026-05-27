import { Mesa, MesaFileSystem } from "@mesadev/sdk";
import type { MesaFileSystemConfig } from "@mesadev/sdk";
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

const REPO_NAME = "portfolio-advisor";

export class MountedMesa implements MesaService {
  private fs!: MesaFileSystem;
  private readonly apiKey: string;
  private readonly client: Mesa;
  private org!: string;
  private basePath!: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new Mesa({ apiKey });
  }

  private filePath(filePath: string): string {
    return `${this.basePath}/${filePath}`;
  }

  private async switchTo(bookmark: string): Promise<void> {
    await this.fs.change.edit({ repo: REPO_NAME, bookmark });
  }

  async init(): Promise<void> {
    this.org = await this.client.resolveOrg();

    try {
      await this.client.repos.get({ repo: REPO_NAME });
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const inner = e.error as Record<string, unknown> | undefined;
      const code = (inner?.code ?? e.code) as string | undefined;
      if (code?.toUpperCase().includes("NOT_FOUND")) {
        await this.client.repos.create({
          name: REPO_NAME,
          default_bookmark: "main",
        });
      } else {
        throw err;
      }
    }

    const bms = await this.client.bookmarks.list({ repo: REPO_NAME });
    if (!bms.bookmarks.some((b) => b.name === "main")) {
      await this.client.repos.delete({ repo: REPO_NAME });
      await this.client.repos.create({
        name: REPO_NAME,
        default_bookmark: "main",
      });
    }

    const config: MesaFileSystemConfig = {
      org: this.org,
      apiKey: this.apiKey,
      repos: [{ name: REPO_NAME, bookmark: "main" }],
      mountedRepos: [REPO_NAME],
      mode: "rw",
    };
    this.fs = MesaFileSystem.create(config);
    this.basePath = `/${this.org}/${REPO_NAME}`;
  }

  async readFile(branch: string, filePath: string): Promise<string> {
    await this.switchTo(branch);
    return this.fs.readFile(this.filePath(filePath), "utf-8");
  }

  async writeFile(branch: string, filePath: string, content: string): Promise<void> {
    await this.switchTo(branch);
    const dir = filePath.includes("/")
      ? filePath.substring(0, filePath.lastIndexOf("/"))
      : null;
    if (dir) {
      const dirPath = this.filePath(dir);
      if (!(await this.fs.exists(dirPath))) {
        await this.fs.mkdir(dirPath, { recursive: true });
      }
    }
    await this.fs.writeFile(this.filePath(filePath), content, "utf-8");
  }

  async deleteFile(branch: string, filePath: string): Promise<void> {
    await this.switchTo(branch);
    try {
      await this.fs.rm(this.filePath(filePath));
    } catch {
      // File may not exist
    }
  }

  async listFiles(branch: string, dir: string): Promise<string[]> {
    await this.switchTo(branch);
    try {
      const entries = await this.fs.readdir(this.filePath(dir));
      return entries.sort();
    } catch {
      return [];
    }
  }

  async createBranch(branchName: string, fromBranch: string): Promise<void> {
    const changeId = await this.resolveBookmark(fromBranch);
    await this.client.bookmarks.create({
      repo: REPO_NAME,
      name: branchName,
      change_id: changeId,
    });
  }

  async mergeBranch(branchName: string, intoBranch: string): Promise<void> {
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
      // Already deleted
    }
  }

  async listCommits(branch: string, limit: number): Promise<{ hash: string; message: string; timestamp: number }[]> {
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
    return "mesa-mount";
  }

  async getChangeId(branch: string): Promise<string | null> {
    try {
      return await this.resolveBookmark(branch);
    } catch {
      return null;
    }
  }

  async getDiff(baseChangeId: string, headChangeId: string): Promise<MesaDiffResponse | null> {
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
          lines: h.lines.map((l) => ({ kind: l.kind, content: l.text })),
        }));
        return { path: e.path, status: e.status, hunks };
      });
      return {
        baseChangeId: res.base_change_id,
        headChangeId: res.head_change_id,
        stats: { additions: res.stats.additions, deletions: res.stats.deletions, entries: res.stats.entries },
        entries,
      };
    } catch {
      return null;
    }
  }

  async getActivity(limit: number): Promise<MesaActivityEvent[]> {
    try {
      const res = await this.client.changes.list({ repo: REPO_NAME, limit });
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
    return { id: res.id, name: res.name, url: res.url, events: res.events, createdAt: res.created_at };
  }

  async deleteWebhookTarget(id: string): Promise<void> {
    await this.client.webhookTargets.delete({ webhookTargetId: id });
  }

  async listChanges(limit: number): Promise<MesaChange[]> {
    try {
      const res = await this.client.changes.list({ repo: REPO_NAME, limit });
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

  async getRepoTags(): Promise<RepoTags> {
    try {
      const res = await this.client.repos.get({ repo: REPO_NAME });
      return res.tags ?? {};
    } catch {
      return {};
    }
  }

  async setRepoTags(tags: Record<string, string | null>): Promise<RepoTags> {
    const res = await this.client.repos.update({ repo: REPO_NAME, tags });
    return res.tags ?? {};
  }

  private async resolveBookmark(name: string): Promise<string> {
    const res = await this.client.bookmarks.list({ repo: REPO_NAME });
    const bm = res.bookmarks.find((b) => b.name === name);
    if (!bm) throw new Error(`Bookmark "${name}" not found in repo ${REPO_NAME}`);
    return bm.change_id;
  }
}
