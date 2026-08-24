import { pgEnum } from "drizzle-orm/pg-core";

export const datasetKindEnum = pgEnum("dataset_kind", ["seed", "evaluation", "canary"]);

export const nodeTypeEnum = pgEnum("node_type", [
  "router",
  "retrieval",
  "specialist",
  "safety",
  "escalation",
  "final_response",
]);

export const graphVersionStatusEnum = pgEnum("graph_version_status", ["draft", "published"]);

export const evaluationRunStatusEnum = pgEnum("evaluation_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const regressionSeverityEnum = pgEnum("regression_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "evaluating",
  "canary",
  "approved",
  "rejected",
]);

export const gateStatusEnum = pgEnum("gate_status", ["pass", "warn", "block"]);
