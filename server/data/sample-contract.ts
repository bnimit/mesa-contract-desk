import type { Contract, RedlineEdit, Department } from "../../shared/types.js";

export const SAMPLE_CONTRACT: Contract = {
  meta: {
    title: "Master Services Agreement",
    parties: ["Northwind Software, Inc. (\"Provider\")", "Acme Corp. (\"Customer\")"],
    version: 1,
    lastApproved: null,
  },
  clauses: [
    { id: "services", heading: "1. Services", text: "Provider will make its cloud software platform available to Customer as a subscription service during the Term." },
    { id: "fees", heading: "2. Fees & Payment", text: "Customer will pay all fees within thirty (30) days of the invoice date. Late amounts accrue interest at 1.5% per month." },
    { id: "term", heading: "3. Term & Renewal", text: "This Agreement begins on the Effective Date and continues for twelve (12) months. It automatically renews for successive twelve (12) month terms unless either party gives notice of non-renewal at least ninety (90) days before the end of the then-current term." },
    { id: "liability", heading: "4. Limitation of Liability", text: "Neither party's aggregate liability under this Agreement is limited. Each party is fully responsible for all damages of any kind arising from its performance." },
    { id: "indemnity", heading: "5. Indemnification", text: "Customer will indemnify and defend Provider against any and all claims arising from Customer's use of the services, including claims of intellectual property infringement." },
    { id: "data", heading: "6. Data & IP Ownership", text: "All data submitted to the platform, and any derivatives or analytics generated from it, are owned by Provider and may be used for any purpose." },
    { id: "confidentiality", heading: "7. Confidentiality", text: "Each party will protect the other's Confidential Information for a period of two (2) years following disclosure." },
    { id: "law", heading: "8. Governing Law", text: "This Agreement is governed by the laws of the State of New York, without regard to its conflict-of-laws principles." },
  ],
};

// Canned redlines used when no Anthropic key is configured, so the full
// workflow is clickable offline. Keyed by department, with each department's
// edits scoped to their domain. Legal and Finance both propose different edits
// for the contested "liability" clause.
export const CANNED_REDLINES: Record<"legal" | "finance" | "security", RedlineEdit[]> = {
  legal: [
    { id: "le1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the fees paid in the prior twelve (12) months, except for breaches of confidentiality or indemnification obligations.", justification: "Mutual cap with standard carve-outs for confidentiality and indemnity." },
    { id: "le2", type: "replace", targetClauseId: "indemnity", heading: "5. Indemnification", proposedText: "Each party will indemnify the other for third-party claims arising from its breach. Provider will indemnify Customer against IP-infringement claims relating to the platform.", justification: "Make indemnity mutual and shift platform IP risk to Provider." },
    { id: "le3", type: "replace", targetClauseId: "law", heading: "8. Governing Law", proposedText: "This Agreement is governed by the laws of the State of Delaware, without regard to conflict-of-laws principles.", justification: "Neutral, well-trodden governing law." },
  ],
  finance: [
    { id: "fi1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Neither party's aggregate liability will exceed the total fees paid by Customer in the three (3) months preceding the claim; neither party is liable for indirect or consequential damages.", justification: "Tie the cap to recent spend and exclude consequential damages." },
    { id: "fi2", type: "replace", targetClauseId: "fees", heading: "2. Fees & Payment", proposedText: "Customer will pay undisputed fees within forty-five (45) days of invoice. Late amounts accrue interest at 0.5% per month.", justification: "Extend the payment window and reduce penalty interest." },
    { id: "fi3", type: "replace", targetClauseId: "term", heading: "3. Term & Renewal", proposedText: "This Agreement runs for twelve (12) months and does not auto-renew; renewal requires written agreement of both parties.", justification: "Remove auto-renewal to control spend." },
  ],
  security: [
    { id: "se1", type: "replace", targetClauseId: "data", heading: "6. Data & IP Ownership", proposedText: "Customer retains ownership of its data. Provider may use aggregated, de-identified data solely to improve the services.", justification: "Customer owns data; Provider keeps narrow de-identified rights." },
    { id: "se2", type: "replace", targetClauseId: "confidentiality", heading: "7. Confidentiality", proposedText: "Each party will protect the other's Confidential Information for five (5) years following disclosure, and for trade secrets, for as long as they remain trade secrets.", justification: "Extend confidentiality term and protect trade secrets." },
    { id: "se3", type: "insert", afterClauseId: "confidentiality", heading: "7a. Data Security", proposedText: "Provider will maintain SOC 2 Type II-aligned safeguards and notify Customer of any data breach within seventy-two (72) hours.", justification: "Add a baseline security and breach-notice obligation." },
  ],
};
