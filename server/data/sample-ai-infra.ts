import type { Contract, RedlineEdit } from "../../shared/types.js";

/** A second sample: an AI compute/inference usage agreement — on-theme for AI infra. */
export const AI_INFRA: Contract = {
  meta: {
    title: "AI Infrastructure Usage Agreement",
    parties: ["Tensor Cloud, Inc. (\"Provider\")", "Acme AI Labs (\"Customer\")"],
    version: 1,
    lastApproved: null,
  },
  clauses: [
    { id: "service", heading: "1. AI Infrastructure Services", text: "Provider will make available GPU compute, model hosting, and inference endpoints to Customer on a usage basis during the Term." },
    { id: "usage", heading: "2. Usage & Rate Limits", text: "Provider may impose rate limits and capacity quotas at its sole discretion and may throttle or suspend usage without notice to protect the platform." },
    { id: "fees", heading: "3. Fees & Consumption", text: "Customer will pay for all consumed compute and tokens monthly in arrears at Provider's then-current rates. Provider may change rates at any time on thirty (30) days' notice." },
    { id: "models", heading: "4. Model & Output Rights", text: "Provider owns all fine-tuned models, weights, and outputs generated on the platform and may reuse them to improve its services." },
    { id: "data", heading: "5. Customer Data & Training", text: "Provider may use Customer's prompts, inputs, and outputs to train and improve its own foundation models." },
    { id: "liability", heading: "6. Limitation of Liability", text: "Neither party's aggregate liability under this Agreement is limited, including for model errors, hallucinations, or downtime." },
    { id: "availability", heading: "7. Availability & SLA", text: "The services are provided on an \"as available\" basis. Provider makes no uptime commitment and offers no service credits for outages." },
    { id: "acceptableuse", heading: "8. Acceptable Use", text: "Provider may determine, in its sole discretion, that any use violates its Acceptable Use Policy and may terminate access immediately and without notice." },
    { id: "law", heading: "9. Governing Law", text: "This Agreement is governed by the laws of the State of California, without regard to its conflict-of-laws principles." },
  ],
};

// Canned redlines (no-key offline demo). Legal & Finance both edit "liability".
export const AI_INFRA_CANNED: Record<"legal" | "finance" | "security", RedlineEdit[]> = {
  legal: [
    { id: "le1", type: "replace", targetClauseId: "liability", heading: "6. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the fees paid in the prior twelve (12) months, except for breaches of confidentiality, data, or acceptable-use obligations. Provider is not liable for model outputs Customer chooses to rely on.", justification: "Mutual cap with carve-outs; clarify Provider isn't liable for how Customer uses outputs." },
    { id: "le2", type: "replace", targetClauseId: "models", heading: "4. Model & Output Rights", proposedText: "Customer owns the fine-tunes it creates from its own data and all outputs generated for it. Provider retains its base models and platform.", justification: "Customer must own its fine-tunes and outputs." },
    { id: "le3", type: "replace", targetClauseId: "acceptableuse", heading: "8. Acceptable Use", proposedText: "Provider may suspend access for a material violation of the Acceptable Use Policy, with notice and a reasonable opportunity to cure where the violation is not unlawful.", justification: "Replace unilateral immediate termination with notice-and-cure." },
  ],
  finance: [
    { id: "fi1", type: "replace", targetClauseId: "liability", heading: "6. Limitation of Liability", proposedText: "Neither party's aggregate liability will exceed the total fees paid by Customer in the three (3) months preceding the claim; neither party is liable for indirect or consequential damages.", justification: "Tie the cap to recent consumption and exclude consequential damages." },
    { id: "fi2", type: "replace", targetClauseId: "fees", heading: "3. Fees & Consumption", proposedText: "Customer will pay for consumed compute and tokens monthly in arrears. Provider may change rates no more than once per Term on sixty (60) days' notice, and Customer may set a monthly spend cap that suspends new usage when reached.", justification: "Add rate-change limits and a spend cap to control consumption costs." },
    { id: "fi3", type: "replace", targetClauseId: "availability", heading: "7. Availability & SLA", proposedText: "Provider will use commercially reasonable efforts to maintain 99.9% monthly availability and will credit Customer pro-rata for outages below that threshold.", justification: "Add a real uptime commitment with service credits." },
  ],
  security: [
    { id: "se1", type: "replace", targetClauseId: "data", heading: "5. Customer Data & Training", proposedText: "Provider will not use Customer's prompts, inputs, or outputs to train its own models without Customer's prior written opt-in. Customer data is processed solely to provide the services.", justification: "No training on customer data without opt-in." },
    { id: "se2", type: "replace", targetClauseId: "usage", heading: "2. Usage & Rate Limits", proposedText: "Rate limits and quotas will be set out in the order form. Provider will give reasonable advance notice before reducing capacity and will not suspend usage except for security or acceptable-use reasons.", justification: "Make limits transparent and constrain arbitrary suspension." },
    { id: "se3", type: "insert", afterClauseId: "data", heading: "5a. Security & Breach Notice", proposedText: "Provider will maintain SOC 2 Type II-aligned safeguards, isolate Customer workloads, and notify Customer of any security or data breach within seventy-two (72) hours.", justification: "Add baseline security and breach-notice obligations." },
  ],
};
