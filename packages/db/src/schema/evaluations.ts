import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { evaluationRunStatusEnum } from "./enums";
import { graphVersions } from "./projects";
import { testCases } from "./datasets";

export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphVersionId: uuid("graph_version_id")
      .notNull()
      .references(() => graphVersions.id),
    baselineRunId: uuid("baseline_run_id"),
    status: evaluationRunStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    graphVersionIdIdx: index("evaluation_runs_graph_version_id_idx").on(table.graphVersionId),
    statusIdx: index("evaluation_runs_status_idx").on(table.status),
    graphVersionIdFk: foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.id],
    }).onDelete("cascade"),
  }),
);

// Self-referencing FK for baselineRunId handled in migration

export const evaluationResults = pgTable(
  "evaluation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => evaluationRuns.id),
    testCaseId: uuid("test_case_id")
      .notNull()
      .references(() => testCases.id),
    evaluator: text("evaluator").notNull(),
    score: numeric("score").notNull(),
    passed: boolean("passed").notNull(),
    explanation: text("explanation"),
  },
  (table) => ({
    runIdIdx: index("evaluation_results_run_id_idx").on(table.runId),
    testCaseIdIdx: index("evaluation_results_test_case_id_idx").on(table.testCaseId),
    runIdFk: foreignKey({
      columns: [table.runId],
      foreignColumns: [evaluationRuns.id],
    }).onDelete("cascade"),
    testCaseIdFk: foreignKey({
      columns: [table.testCaseId],
      foreignColumns: [testCases.id],
    }).onDelete("cascade"),
  }),
);
