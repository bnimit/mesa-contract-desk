import type { Contract, RedlineEdit, Department } from "../../shared/types.js";
import { hasAnthropicKey, runRedlinePrompt } from "../services/claude.js";
import { CANNED_REDLINES } from "../data/sample-contract.js";
import { getPersona } from "../data/personas.js";

/**
 * Structured clause edits for one department. Real Claude when a key is set,
 * scoped to the persona's domain; otherwise canned (only the three core
 * personas have canned redlines). Retries once on parse failure.
 */
export async function runRedlineAgent(contract: Contract, department: Department): Promise<RedlineEdit[]> {
  const persona = getPersona(department);
  const canned = (CANNED_REDLINES as Record<string, RedlineEdit[]>)[department];
  if (!hasAnthropicKey()) {
    return canned ?? [];
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const edits = await runRedlinePrompt(contract, persona.domain);
      if (edits.length > 0) return edits;
    } catch {
      // retry once, then fall through
    }
  }
  return canned ?? [];
}
