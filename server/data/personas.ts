import type { Persona, Department } from "../../shared/types.js";

export const PERSONAS: Persona[] = [
  { id: "legal", label: "Legal Counsel", color: "#047857", cannedAvailable: true, icon: "⚖️",
    domain: "liability, indemnification, governing law, warranties, and termination",
    pitch: "Cap our liability and make indemnity mutual." },
  { id: "finance", label: "Finance", color: "#b45309", cannedAvailable: true, icon: "💰",
    domain: "fees, payment terms, term & renewal, late fees, and spend caps",
    pitch: "Extend payment terms and kill auto-renewal." },
  { id: "security", label: "Security & Data", color: "#4f46e5", cannedAvailable: true, icon: "🛡️",
    domain: "data ownership, security obligations, breach notification, and confidentiality",
    pitch: "Customer owns the data; 72-hour breach notice." },
  { id: "commercial", label: "Commercial", color: "#0891b2", cannedAvailable: false, icon: "🤝",
    domain: "scope of services, SLAs, deliverables, and support",
    pitch: "Tighten the SLAs and scope of services." },
  { id: "privacy", label: "Privacy", color: "#7c3aed", cannedAvailable: false, icon: "🔒",
    domain: "personal data, processing, subprocessors, and retention (GDPR/CCPA)",
    pitch: "Limit processing and add retention limits." },
];

export const CORE_DEPARTMENTS: Department[] = ["legal", "finance", "security"];

export function getPersona(id: Department): Persona {
  const p = PERSONAS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown persona ${id}`);
  return p;
}
