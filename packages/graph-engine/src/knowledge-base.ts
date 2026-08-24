import type { KBEntry } from "@graphguard/domain";

/**
 * Fictional pharmaceutical product knowledge base.
 * This is a PORTFOLIO PROJECT — all products and data are fictional.
 * The real 100+ item dataset is built in Phase 3.
 */
export const PHARMA_KNOWLEDGE_BASE: KBEntry[] = [
  {
    id: "kb-001",
    content: "NeuroCalm is a prescription medication for the treatment of moderate anxiety disorders in adults. The recommended starting dose is 10mg once daily, taken in the morning.",
    source: "NeuroCalm Prescribing Information",
  },
  {
    id: "kb-002",
    content: "Common side effects of NeuroCalm include drowsiness, dry mouth, dizziness, and mild nausea. These typically resolve within the first two weeks of treatment.",
    source: "NeuroCalm Safety Data",
  },
  {
    id: "kb-003",
    content: "NeuroCalm should not be taken with MAO inhibitors. Patients should wait at least 14 days after stopping an MAO inhibitor before starting NeuroCalm.",
    source: "NeuroCalm Drug Interactions",
  },
  {
    id: "kb-004",
    content: "CardioShield Plus is a cholesterol management medication combining atorvastatin and ezetimibe. It is indicated for patients who have not achieved adequate LDL reduction with statin monotherapy.",
    source: "CardioShield Plus Prescribing Information",
  },
  {
    id: "kb-005",
    content: "The standard dose of CardioShield Plus is one tablet daily, taken in the evening. Patients should avoid grapefruit juice while taking this medication.",
    source: "CardioShield Plus Dosing Guide",
  },
  {
    id: "kb-006",
    content: "CardioShield Plus may cause muscle pain or weakness. Patients should report any unexplained muscle pain, tenderness, or weakness to their healthcare provider immediately.",
    source: "CardioShield Plus Safety Data",
  },
  {
    id: "kb-007",
    content: "ImmunoBoost is an over-the-counter immune support supplement containing Vitamin C (1000mg), Zinc (25mg), and Elderberry extract. It is not a prescription medication.",
    source: "ImmunoBoost Product Information",
  },
  {
    id: "kb-008",
    content: "RespiClear is a prescription inhaler for the maintenance treatment of asthma. It contains fluticasone propionate 250mcg per actuation. It is not a rescue inhaler.",
    source: "RespiClear Prescribing Information",
  },
  {
    id: "kb-009",
    content: "RespiClear should be used regularly (twice daily) for best results. Patients should rinse their mouth after each use to prevent oral thrush.",
    source: "RespiClear Patient Instructions",
  },
  {
    id: "kb-010",
    content: "All medication pricing information is available through the pharmacy. Insurance coverage varies by plan. Patients should contact their insurance provider for specific coverage details.",
    source: "General Pharmacy Information",
  },
  {
    id: "kb-011",
    content: "For medical emergencies, call 911 immediately. This product information service is not a substitute for emergency medical care.",
    source: "Emergency Information",
  },
  {
    id: "kb-012",
    content: "NeuroCalm is classified as a controlled substance in some jurisdictions. Patients should not drive or operate heavy machinery until they know how NeuroCalm affects them.",
    source: "NeuroCalm Regulatory Information",
  },
];

/**
 * Get the placeholder knowledge base.
 * In Phase 3, this will be replaced with a proper database-backed retrieval system.
 */
export function getKnowledgeBase(): KBEntry[] {
  return PHARMA_KNOWLEDGE_BASE;
}
