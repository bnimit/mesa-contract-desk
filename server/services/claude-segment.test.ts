import { describe, it, expect } from "vitest";
import { parseSegmentedContract } from "./claude.js";

describe("parseSegmentedContract", () => {
  it("parses prose-wrapped JSON and dedupes ids", () => {
    const c = parseSegmentedContract('ok: {"title":"X","parties":["A"],"clauses":[{"id":"a","heading":"1","text":"t1"},{"id":"a","heading":"2","text":"t2"}]} done');
    expect(c.clauses.map((x) => x.id)).toEqual(["a", "a-2"]);
    expect(c.meta.title).toBe("X");
  });
  it("rejects < 2 clauses", () => {
    expect(() => parseSegmentedContract('{"clauses":[{"id":"a","heading":"1","text":"t"}]}')).toThrow();
  });
});
