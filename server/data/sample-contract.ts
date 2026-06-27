import type { Contract, RedlineEdit, Posture } from "../../shared/types.js";

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
// workflow is clickable offline. Each posture takes a distinct stance.
export const CANNED_REDLINES: Record<Posture, RedlineEdit[]> = {
  aggressive: [
    { id: "e1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the fees paid by Customer in the three (3) months preceding the claim. Neither party is liable for indirect, incidental, or consequential damages.", justification: "Unlimited liability is unacceptable; cap at 3 months' fees and exclude consequential damages." },
    { id: "e2", type: "replace", targetClauseId: "indemnity", heading: "5. Indemnification", proposedText: "Each party will indemnify the other for third-party claims arising from its own breach or negligence. Provider will indemnify Customer against IP infringement claims relating to the platform.", justification: "One-sided indemnity flipped to mutual; IP infringement risk shifted to Provider." },
    { id: "e3", type: "replace", targetClauseId: "data", heading: "6. Data & IP Ownership", proposedText: "Customer owns all data it submits and all derivatives. Provider may process the data solely to provide the services and may not use it for any other purpose.", justification: "Customer must own its data; strike Provider's broad reuse rights." },
    { id: "e4", type: "replace", targetClauseId: "term", heading: "3. Term & Renewal", proposedText: "This Agreement runs for twelve (12) months and does not auto-renew. Renewal requires written agreement of both parties.", justification: "Remove auto-renewal entirely." },
    { id: "e5", type: "replace", targetClauseId: "fees", heading: "2. Fees & Payment", proposedText: "Customer will pay undisputed fees within forty-five (45) days of invoice. Late amounts accrue interest at 0.5% per month.", justification: "Extend payment window and reduce penalty interest." },
  ],
  balanced: [
    { id: "e1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the total fees paid in the twelve (12) months preceding the claim, except for breaches of confidentiality or indemnification obligations.", justification: "Mutual 12-month cap with standard carve-outs — market standard." },
    { id: "e2", type: "replace", targetClauseId: "indemnity", heading: "5. Indemnification", proposedText: "Each party will indemnify the other for third-party claims caused by its breach of this Agreement. Provider will indemnify Customer for IP infringement by the platform.", justification: "Make indemnity mutual and tie it to breach." },
    { id: "e3", type: "replace", targetClauseId: "data", heading: "6. Data & IP Ownership", proposedText: "Customer retains ownership of its data. Provider may use aggregated, de-identified data to improve the services.", justification: "Customer owns data; Provider keeps narrow de-identified improvement rights." },
    { id: "e4", type: "insert", afterClauseId: "confidentiality", heading: "7a. Data Security", proposedText: "Provider will maintain administrative, technical, and physical safeguards aligned with SOC 2 Type II and will notify Customer of any data breach within seventy-two (72) hours.", justification: "Add a baseline security and breach-notice obligation." },
  ],
  minimal: [
    { id: "e1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the total fees paid in the twelve (12) months preceding the claim.", justification: "Add a simple mutual liability cap; leave the rest as-is." },
    { id: "e2", type: "replace", targetClauseId: "term", heading: "3. Term & Renewal", proposedText: "This Agreement begins on the Effective Date and continues for twelve (12) months. It automatically renews for successive twelve (12) month terms unless either party gives notice of non-renewal at least thirty (30) days before the end of the then-current term.", justification: "Shorten the non-renewal notice from 90 to 30 days." },
  ],
};
