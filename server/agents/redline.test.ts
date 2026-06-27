import { describe, it, expect } from "vitest";
import { runRedlineAgent, POSTURES } from "./redline.js";
import { parseRedlineEdits } from "../services/claude.js";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "../data/sample-contract.js";

describe("parseRedlineEdits", () => {
  it("extracts a JSON array embedded in prose", () => {
    const out = parseRedlineEdits('Here you go: [{"id":"e1","type":"delete","targetClauseId":"law","justification":"x"}] done');
    expect(out).toHaveLength(1);
    expect(out[0].targetClauseId).toBe("law");
    expect(out[0].afterClauseId).toBeNull();
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
});
