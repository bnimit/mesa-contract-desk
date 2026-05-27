import fs from "fs/promises";
import path from "path";

const REPO_DIR = path.resolve("mesa-repo");

export interface MesaService {
  init(): Promise<void>;
  readFile(branch: string, filePath: string): Promise<string>;
  writeFile(branch: string, filePath: string, content: string): Promise<void>;
  deleteFile(branch: string, filePath: string): Promise<void>;
  listFiles(branch: string, dir: string): Promise<string[]>;
  createBranch(branchName: string, fromBranch: string): Promise<void>;
  mergeBranch(branchName: string, intoBranch: string): Promise<void>;
  deleteBranch(branchName: string): Promise<void>;
  listCommits(branch: string, limit: number): Promise<{ hash: string; message: string; timestamp: number }[]>;
  backendName(): string;
  getChangeId(branch: string): Promise<string | null>;
  getDiff(baseChangeId: string, headChangeId: string): Promise<import("../../shared/types.js").MesaDiffResponse | null>;
  getActivity(limit: number): Promise<import("../../shared/types.js").MesaActivityEvent[]>;
  // Webhook targets
  listWebhookTargets(): Promise<import("../../shared/types.js").WebhookTarget[]>;
  createWebhookTarget(url: string, name?: string, events?: string[]): Promise<import("../../shared/types.js").WebhookTarget>;
  deleteWebhookTarget(id: string): Promise<void>;
  // Rich change history
  listChanges(limit: number): Promise<import("../../shared/types.js").MesaChange[]>;
  // Repository tags
  getRepoTags(): Promise<import("../../shared/types.js").RepoTags>;
  setRepoTags(tags: Record<string, string | null>): Promise<import("../../shared/types.js").RepoTags>;
}

class LocalFsMesa implements MesaService {
  private branchDir(branch: string) {
    return path.join(REPO_DIR, "branches", branch);
  }

  async init() {
    await fs.mkdir(this.branchDir("main"), { recursive: true });
  }

  async readFile(branch: string, filePath: string) {
    return fs.readFile(path.join(this.branchDir(branch), filePath), "utf-8");
  }

  async writeFile(branch: string, filePath: string, content: string) {
    const fullPath = path.join(this.branchDir(branch), filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  async deleteFile(branch: string, filePath: string) {
    const fullPath = path.join(this.branchDir(branch), filePath);
    await fs.rm(fullPath, { force: true });
  }

  async listFiles(branch: string, dir: string) {
    const fullPath = path.join(this.branchDir(branch), dir);
    try {
      const entries = await fs.readdir(fullPath);
      return entries.sort();
    } catch {
      return [];
    }
  }

  backendName() {
    return "local-fs";
  }

  async createBranch(branchName: string, fromBranch: string) {
    const src = this.branchDir(fromBranch);
    const dest = this.branchDir(branchName);
    await fs.cp(src, dest, { recursive: true });
  }

  async mergeBranch(branchName: string, intoBranch: string) {
    const src = this.branchDir(branchName);
    const dest = this.branchDir(intoBranch);
    await fs.cp(src, dest, { recursive: true, force: true });
  }

  async deleteBranch(branchName: string) {
    await fs.rm(this.branchDir(branchName), { recursive: true, force: true });
  }

  async listCommits(_branch: string, _limit: number) {
    return [];
  }

  async getChangeId(_branch: string): Promise<string | null> {
    return null;
  }

  async getDiff(_baseChangeId: string, _headChangeId: string): Promise<import("../../shared/types.js").MesaDiffResponse | null> {
    return null;
  }

  async getActivity(_limit: number): Promise<import("../../shared/types.js").MesaActivityEvent[]> {
    return [];
  }

  async listWebhookTargets(): Promise<import("../../shared/types.js").WebhookTarget[]> {
    return [];
  }
  async createWebhookTarget(_url: string, _name?: string, _events?: string[]): Promise<import("../../shared/types.js").WebhookTarget> {
    throw new Error("Webhook targets require the Mesa SDK backend");
  }
  async deleteWebhookTarget(_id: string): Promise<void> {}

  async listChanges(_limit: number): Promise<import("../../shared/types.js").MesaChange[]> {
    return [];
  }

  async getRepoTags(): Promise<import("../../shared/types.js").RepoTags> {
    return {};
  }
  async setRepoTags(_tags: Record<string, string | null>): Promise<import("../../shared/types.js").RepoTags> {
    return {};
  }
}

import { SdkMesa } from "./mesa-sdk.js";
import { MountedMesa } from "./mesa-mount.js";

let currentBackend: MesaService = new LocalFsMesa();

export function getMesa(): MesaService {
  return currentBackend;
}

export type BackendChoice = "local-fs" | "mesa-sdk" | "mesa-mount";

export async function reinitializeMesa(apiKey?: string, backend?: BackendChoice): Promise<void> {
  if (apiKey && apiKey.length > 0) {
    if (backend === "mesa-mount") {
      console.log("Using Mesa fs.mount backend (native filesystem)");
      currentBackend = new MountedMesa(apiKey);
    } else {
      console.log("Using Mesa SDK backend (api.mesa.dev)");
      currentBackend = new SdkMesa(apiKey);
    }
  } else {
    console.log("Using local filesystem backend (mesa-repo/)");
    currentBackend = new LocalFsMesa();
  }
  await currentBackend.init();
}
