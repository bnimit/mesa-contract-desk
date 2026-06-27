import { describe, it, expect } from "vitest";
import { extractText, SAMPLES, getSample } from "./intake.js";

describe("intake", () => {
  it("extracts text from a .txt buffer", async () => {
    const t = await extractText(Buffer.from("Hello clause text", "utf-8"), "a.txt");
    expect(t).toContain("Hello clause");
  });
  it("rejects an unsupported extension", async () => {
    await expect(extractText(Buffer.from("x"), "a.png")).rejects.toThrow(/Unsupported/);
  });
  it("lists the IT services + AI infra samples, both with canned redlines", () => {
    expect(SAMPLES.map((s) => s.id).sort()).toEqual(["ai-infra", "it-services"]);
    expect(getSample("it-services").contract.meta.title).toContain("IT Services Agreement");
    expect(getSample("ai-infra").contract.meta.title).toContain("AI Infrastructure");
    expect(getSample("it-services").canned).not.toBeNull();
    expect(getSample("ai-infra").canned).not.toBeNull();
  });
});
