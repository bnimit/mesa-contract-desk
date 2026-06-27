import type { Contract, RedlineEdit, Department } from "../../shared/types.js";
import { hasAnthropicKey, runRedlinePrompt } from "../services/claude.js";
import { getPersona } from "../data/personas.js";

/**
 * Structured clause edits for one department. Real Claude when a key is set,
 * scoped to the persona's domain; otherwise the `canned` redlines for the
 * current contract (the offline path) — undefined for an uploaded contract or
 * a persona with no canned set. Retries once on parse failure.
 */
export async function runRedlineAgent(
  contract: Contract,
  department: Department,
  canned?: RedlineEdit[]
): Promise<RedlineEdit[]> {
  const persona = getPersona(department);
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
