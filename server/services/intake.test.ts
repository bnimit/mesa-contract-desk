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
  it("lists samples including the MSA and NDA", () => {
    expect(SAMPLES.map((s) => s.id).sort()).toEqual(["msa", "nda"]);
    expect(getSample("msa").contract.meta.title).toContain("Master Services Agreement");
  });
});
