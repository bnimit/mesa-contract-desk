import type { Contract } from "../../shared/types.js";
export const SAMPLE_NDA: Contract = {
  meta: { title: "Mutual Non-Disclosure Agreement", parties: ["Discloser", "Recipient"], version: 1, lastApproved: null },
  clauses: [
    { id: "purpose", heading: "1. Purpose", text: "The parties wish to explore a business relationship and may share confidential information." },
    { id: "definition", heading: "2. Definition of Confidential Information", text: "Confidential Information means any non-public information disclosed by one party to the other, in any form." },
    { id: "obligations", heading: "3. Obligations", text: "The Recipient will use Confidential Information solely for the Purpose and protect it with reasonable care." },
    { id: "term", heading: "4. Term", text: "This Agreement remains in effect for two (2) years from the Effective Date." },
    { id: "return", heading: "5. Return of Materials", text: "Upon request, the Recipient will return or destroy all Confidential Information." },
    { id: "law", heading: "6. Governing Law", text: "This Agreement is governed by the laws of the State of New York." },
  ],
};
