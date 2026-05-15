import { mesa } from "./mesa.js";

const PLAYBOOK_FILE = "playbook.md";

export interface PlaybookEntry {
  agent: string;
  round: number;
  timestamp: number;
  body: string;
  raw: string;
}

const HEADER_RE = /^## \[Round (\d+) · ([^·]+) · ([^\]]+)\]\s*$/m;

export async function readPlaybook(branch: string): Promise<string> {
  try {
    return await mesa.readFile(branch, PLAYBOOK_FILE);
  } catch {
    return "# Playbook\n\n_No entries yet. Agents will add observations and rules as they run._\n";
  }
}

export async function writePlaybook(branch: string, content: string): Promise<void> {
  await mesa.writeFile(branch, PLAYBOOK_FILE, content);
}

export async function appendEntry(branch: string, entry: string): Promise<void> {
  const current = await readPlaybook(branch);
  const trimmed = current.replace(/\s+$/, "");
  const next = `${trimmed}\n\n${entry.trim()}\n`;
  await writePlaybook(branch, next);
}

export function parseEntries(content: string): PlaybookEntry[] {
  const entries: PlaybookEntry[] = [];
  const sections = content.split(/(?=^## \[Round )/m);

  for (const section of sections) {
    const match = section.match(HEADER_RE);
    if (!match) continue;

    const round = parseInt(match[1], 10);
    const agent = match[2].trim();
    const dateStr = match[3].trim();
    const ts = Date.parse(dateStr) || 0;

    entries.push({
      round,
      agent,
      timestamp: ts,
      raw: section.trim(),
      body: section.replace(HEADER_RE, "").trim(),
    });
  }

  return entries;
}

export function nextRoundNumber(content: string): number {
  const entries = parseEntries(content);
  if (entries.length === 0) return 1;
  return Math.max(...entries.map((e) => e.round)) + 1;
}

export function formatHeader(round: number, agent: string, timestamp: number): string {
  const d = new Date(timestamp);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `## [Round ${String(round).padStart(3, "0")} · ${agent} · ${date}]`;
}

/**
 * Given two playbook versions, return the trailing content that exists in
 * `newer` but not in `older`. Used to extract what an agent appended on its branch.
 */
export function diffAppended(older: string, newer: string): string {
  if (!newer.startsWith(older.replace(/\s+$/, ""))) {
    // If the older content has been mutated rather than just appended, return
    // everything in `newer` as the delta — this should rarely happen since
    // agents only append.
    return newer.slice(older.length).trim();
  }
  return newer.slice(older.replace(/\s+$/, "").length).trim();
}
