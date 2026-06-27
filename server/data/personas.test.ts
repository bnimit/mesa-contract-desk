import { describe, it, expect } from "vitest";
import { PERSONAS, CORE_DEPARTMENTS, getPersona } from "./personas.js";

describe("personas", () => {
  it("has 5 personas; the 3 core are cannedAvailable", () => {
    expect(PERSONAS).toHaveLength(5);
    expect(PERSONAS.filter((p) => p.cannedAvailable).map((p) => p.id).sort()).toEqual(["finance", "legal", "security"]);
    expect(CORE_DEPARTMENTS.sort()).toEqual(["finance", "legal", "security"]);
  });
  it("getPersona returns label/color/domain", () => {
    expect(getPersona("legal").label).toBe("Legal Counsel");
    expect(getPersona("legal").color).toMatch(/^#/);
  });
  it("every persona has a non-empty icon and pitch", () => {
    for (const p of PERSONAS) {
      expect(p.icon.length, p.id).toBeGreaterThan(0);
      expect(p.pitch.length, p.id).toBeGreaterThan(0);
    }
  });
});
