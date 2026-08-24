import { pgTable, uuid, text, timestamp, jsonb, index, foreignKey } from "drizzle-orm/pg-core";
import { datasetKindEnum } from "./enums";

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: datasetKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    kindIdx: index("datasets_kind_idx").on(table.kind),
  }),
);

export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id),
    input: text("input").notNull(),
    expectedRoute: text("expected_route").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]),
    expectedBehavior: jsonb("expected_behavior").$type<Record<string, unknown>>().default({}),
  },
  (table) => ({
    datasetIdIdx: index("test_cases_dataset_id_idx").on(table.datasetId),
    datasetIdFk: foreignKey({
      columns: [table.datasetId],
      foreignColumns: [datasets.id],
    }).onDelete("cascade"),
  }),
);
