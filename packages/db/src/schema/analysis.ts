import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { regressionSeverityEnum, proposalStatusEnum, gateStatusEnum } from "./enums";
import { graphVersions, nodes } from "./projects";
import { evaluationRuns } from "./evaluations";

export const regressions = pgTable(
  "regressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => evaluationRuns.id),
    severity: regressionSeverityEnum("severity").notNull(),
    affectedNodeId: uuid("affected_node").references(() => nodes.id),
    cause: text("cause").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}),
  },
  (table) => ({
    runIdIdx: index("regressions_run_id_idx").on(table.runId),
    severityIdx: index("regressions_severity_idx").on(table.severity),
    runIdFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [evaluationRuns.id],
    }).onDelete("cascade"),
  }),
);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphVersionId: uuid("graph_version_id")
      .notNull()
      .references(() => graphVersions.id),
    targetNodeId: uuid("target_node")
      .notNull()
      .references(() => nodes.id),
    change: jsonb("change").$type<Record<string, unknown>>().notNull(),
    rationale: text("rationale").notNull(),
    status: proposalStatusEnum("status").notNull().default("draft"),
  },
  (table) => ({
    graphVersionIdIdx: index("proposals_graph_version_id_idx").on(table.graphVersionId),
    statusIdx: index("proposals_status_idx").on(table.status),
    graphVersionIdFk: foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.id],
    }).onDelete("cascade"),
    targetNodeIdFk: foreignKey({
      columns: [table.targetNodeId],
      foreignColumns: [nodes.id],
    }).onDelete("cascade"),
  }),
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphVersionId: uuid("graph_version_id")
      .notNull()
      .references(() => graphVersions.id),
    gateStatus: gateStatusEnum("gate_status").notNull(),
    approvedBy: text("approved_by"),
  },
  (table) => ({
    graphVersionIdIdx: index("releases_graph_version_id_idx").on(table.graphVersionId),
    graphVersionIdFk: foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.id],
    }).onDelete("cascade"),
  }),
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: text("trace_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    tokens: integer("tokens").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    estimatedCost: numeric("estimated_cost").notNull().default("0"),
  },
  (table) => ({
    traceIdIdx: index("llm_calls_trace_id_idx").on(table.traceId),
    providerIdx: index("llm_calls_provider_idx").on(table.provider),
  }),
);
