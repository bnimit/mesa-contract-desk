import fs from "fs/promises";
import path from "path";

const REPO_DIR = path.resolve("mesa-repo");

export interface MesaService {
  init(): Promise<void>;
  readFile(branch: string, filePath: string): Promise<string>;
  writeFile(branch: string, filePath: string, content: string): Promise<void>;
  listFiles(branch: string, dir: string): Promise<string[]>;
  createBranch(branchName: string, fromBranch: string): Promise<void>;
  mergeBranch(branchName: string, intoBranch: string): Promise<void>;
  deleteBranch(branchName: string): Promise<void>;
  listCommits(branch: string, limit: number): Promise<{ hash: string; message: string; timestamp: number }[]>;
  backendName(): string;
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
}

export const mesa: MesaService = new LocalFsMesa();
