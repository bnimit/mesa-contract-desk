import type { Contract, RedlineEdit, Posture } from "../../shared/types.js";
import { hasAnthropicKey, runRedlinePrompt } from "../services/claude.js";
import { CANNED_REDLINES } from "../data/sample-contract.js";

export const POSTURES: { posture: Posture; label: string; role: string }[] = [
  {
    posture: "aggressive",
    label: "Aggressive",
    role: "You take the most protective possible stance for the Customer. Push hard: cap liability tightly, flip one-sided terms, strip the vendor's data rights, and remove auto-renewal. You would rather over-ask and negotiate back.",
  },
  {
    posture: "balanced",
    label: "Balanced",
    role: "You aim for fair, market-standard terms a reasonable counterparty would accept with little friction. Mutual caps, standard carve-outs, sensible security obligations.",
  },
  {
    posture: "minimal",
    label: "Minimal",
    role: "You make only the few highest-impact changes needed to make the contract acceptable, leaving everything else untouched to speed signing.",
  },
];

/**
 * Returns structured clause edits for a posture. Uses real Claude when a key
 * is configured; otherwise falls back to canned redlines. On a parse failure,
 * retries once, then falls back to canned so the demo never dead-ends.
 */
export async function runRedlineAgent(contract: Contract, posture: Posture): Promise<RedlineEdit[]> {
  const cfg = POSTURES.find((p) => p.posture === posture)!;
  if (!hasAnthropicKey()) {
    return CANNED_REDLINES[posture];
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const edits = await runRedlinePrompt(contract, cfg.role);
      if (edits.length > 0) return edits;
    } catch {
      // retry once, then fall through to canned
    }
  }
  return CANNED_REDLINES[posture];
}
