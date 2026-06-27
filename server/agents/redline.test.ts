import { describe, it, expect, vi } from "vitest";
import { runRedlineAgent, POSTURES } from "./redline.js";
import { parseRedlineEdits } from "../services/claude.js";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "../data/sample-contract.js";

vi.mock("../services/claude.js", async (orig) => {
  const actual = await orig<typeof import("../services/claude.js")>();
  return { ...actual, hasAnthropicKey: () => true, runRedlinePrompt: async () => { throw new Error("boom"); } };
});

describe("parseRedlineEdits", () => {
  it("extracts a JSON array embedded in prose", () => {
    const out = parseRedlineEdits('Here you go: [{"id":"e1","type":"delete","targetClauseId":"law","justification":"x"}] done');
    expect(out).toHaveLength(1);
    expect(out[0].targetClauseId).toBe("law");
    expect(out[0].afterClauseId).toBeNull();
  });

  it("ignores trailing bracketed prose after the array", () => {
    const out = parseRedlineEdits('result: [{"id":"e1","type":"delete","targetClauseId":"law","justification":"y"}] see clause [4] for context.');
    expect(out).toHaveLength(1);
    expect(out[0].targetClauseId).toBe("law");
  });

  it("throws on missing array", () => {
    expect(() => parseRedlineEdits("no json here")).toThrow();
  });
});

describe("runRedlineAgent (no key → canned)", () => {
  it("returns the canned redlines for each posture when no Anthropic key is set", async () => {
    for (const p of POSTURES) {
      const edits = await runRedlineAgent(SAMPLE_CONTRACT, p.posture);
      expect(edits).toEqual(CANNED_REDLINES[p.posture]);
    }
  });

  it("exposes exactly three postures", () => {
    expect(POSTURES.map((p) => p.posture).sort()).toEqual(["aggressive", "balanced", "minimal"]);
  });

  it("falls back to canned when the key is set but the prompt always throws", async () => {
    const edits = await runRedlineAgent(SAMPLE_CONTRACT, "balanced");
    expect(edits).toEqual(CANNED_REDLINES.balanced);
  });
});
