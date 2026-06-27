import mammoth from "mammoth";
import { SAMPLE_CONTRACT } from "../data/sample-contract.js";
import { SAMPLE_NDA } from "../data/sample-nda.js";
import type { Contract } from "../../shared/types.js";

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

export const SAMPLES: { id: string; title: string; contract: Contract }[] = [
  { id: "msa", title: SAMPLE_CONTRACT.meta.title, contract: SAMPLE_CONTRACT },
  { id: "nda", title: SAMPLE_NDA.meta.title, contract: SAMPLE_NDA },
];
export function getSample(id: string): { id: string; title: string; contract: Contract } {
  const s = SAMPLES.find((s) => s.id === id);
  if (!s) throw new Error(`Unknown sample ${id}`);
  return s;
}
