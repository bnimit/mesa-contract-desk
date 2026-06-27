import mammoth from "mammoth";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "../data/sample-contract.js";
import { AI_INFRA, AI_INFRA_CANNED } from "../data/sample-ai-infra.js";
import type { Contract, RedlineEdit } from "../../shared/types.js";

export type CannedSet = Record<"legal" | "finance" | "security", RedlineEdit[]>;
export interface Sample {
  id: string;
  title: string;
  contract: Contract;
  canned: CannedSet | null; // canned redlines for the offline (no-key) path
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt")) return buffer.toString("utf-8");
  if (lower.endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (lower.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  throw new Error("Unsupported file type — use .pdf, .docx, or .txt");
}

export const SAMPLES: Sample[] = [
  { id: "it-services", title: SAMPLE_CONTRACT.meta.title, contract: SAMPLE_CONTRACT, canned: CANNED_REDLINES },
  { id: "ai-infra", title: AI_INFRA.meta.title, contract: AI_INFRA, canned: AI_INFRA_CANNED },
];
export function getSample(id: string): Sample {
  const s = SAMPLES.find((s) => s.id === id);
  if (!s) throw new Error(`Unknown sample ${id}`);
  return s;
}
