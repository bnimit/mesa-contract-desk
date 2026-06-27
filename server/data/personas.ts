import type { Persona, Department } from "../../shared/types.js";

export const PERSONAS: Persona[] = [
  { id: "legal", label: "Legal Counsel", color: "#047857", cannedAvailable: true,
    domain: "liability, indemnification, governing law, warranties, and termination" },
  { id: "finance", label: "Finance", color: "#b45309", cannedAvailable: true,
    domain: "fees, payment terms, term & renewal, late fees, and spend caps" },
  { id: "security", label: "Security & Data", color: "#4f46e5", cannedAvailable: true,
    domain: "data ownership, security obligations, breach notification, and confidentiality" },
  { id: "commercial", label: "Commercial", color: "#0891b2", cannedAvailable: false,
    domain: "scope of services, SLAs, deliverables, and support" },
  { id: "privacy", label: "Privacy", color: "#7c3aed", cannedAvailable: false,
    domain: "personal data, processing, subprocessors, and retention (GDPR/CCPA)" },
];

export const CORE_DEPARTMENTS: Department[] = ["legal", "finance", "security"];

export function getPersona(id: Department): Persona {
  const p = PERSONAS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown persona ${id}`);
  return p;
}
