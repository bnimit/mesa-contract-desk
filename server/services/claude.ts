import Anthropic from "@anthropic-ai/sdk";
import type { Contract, RedlineEdit } from "../../shared/types.js";

let client: Anthropic | null = null;

export function reinitializeAnthropic(apiKey: string): void {
  client = new Anthropic({ apiKey });
}

export function clearAnthropic(): void {
  client = null;
}

export function hasAnthropicKey(): boolean {
  return client !== null;
}

export function getClient(): Anthropic {
  if (!client) {
    throw new Error("Anthropic API key not configured — add it in Settings");
  }
  return client;
}

const REDLINE_SCHEMA_HINT = `Respond with ONLY a valid JSON array. Each element is one redline edit:
[
  {
    "id": "e1",
    "type": "replace" | "delete" | "insert",
    "targetClauseId": "<clause id to replace or delete>",   // omit for insert
    "afterClauseId": "<clause id to insert after, or null for top>", // insert only
    "heading": "<new clause heading>",                         // replace/insert
    "proposedText": "<new clause text in plain contract English>", // replace/insert
    "justification": "<one sentence, why this protects your client>"
  }
]
Only use clause ids that appear in the contract. Propose 2-5 edits. No prose outside the JSON.`;

function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  if (start === -1) throw new Error("Agent did not return a JSON array");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error("Agent did not return a complete JSON array");
}

export function parseRedlineEdits(text: string): RedlineEdit[] {
  const json = extractJsonArray(text);
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Redline output was not an array");
  return parsed.map((e, i) => ({
    id: typeof e.id === "string" ? e.id : `e${i + 1}`,
    type: e.type,
    targetClauseId: e.targetClauseId,
    afterClauseId: e.afterClauseId ?? null,
    heading: e.heading,
    proposedText: e.proposedText,
    justification: e.justification ?? "",
  })) as RedlineEdit[];
}

export async function runRedlinePrompt(contract: Contract, domain: string): Promise<RedlineEdit[]> {
  const clauseList = contract.clauses
    .map((c) => `[id: ${c.id}] ${c.heading}\n${c.text}`)
    .join("\n\n");
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a contract reviewer for the Customer, responsible for: ${domain}.

Read the whole ${contract.meta.title}, but propose redlines ONLY to clauses that fall within your responsibility (${domain}). Leave all other clauses untouched. The clauses, each with a stable [id], are:

${clauseList}

${REDLINE_SCHEMA_HINT}`,
      },
    ],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseRedlineEdits(text);
}
