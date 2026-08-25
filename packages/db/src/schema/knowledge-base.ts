import { pgTable, uuid, text, timestamp, index, vector } from "drizzle-orm/pg-core";

/**
 * Knowledge base entries with pgvector embeddings.
 * Used for semantic retrieval in the graph engine.
 * All data is FICTIONAL (see datasets/seed/DISCLAIMER.md).
 */
export const knowledgeBase = pgTable(
  "knowledge_base",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    embeddingModel: text("embedding_model").default("text-embedding-004"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("knowledge_base_category_idx").on(table.category),
    embeddingIdx: index("knowledge_base_embedding_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);

/**
 * Test case tags and expected behavior details.
 * Extended from the base test_cases table in datasets.ts.
 */
export const testCaseTags = pgTable(
  "test_case_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testCaseId: uuid("test_case_id").notNull(),
    intent: text("intent").notNull(),
    safetyClass: text("safety_class").notNull(), // benign | sensitive | must_escalate
    difficulty: text("difficulty").notNull(), // easy | medium | hard
    expectedRoute: text("expected_route").notNull(),
    expectedEvidence: text("expected_evidence").array(), // KB entry IDs that should be cited
  },
  (table) => ({
    testCaseIdIdx: index("test_case_tags_test_case_id_idx").on(table.testCaseId),
    intentIdx: index("test_case_tags_intent_idx").on(table.intent),
    safetyClassIdx: index("test_case_tags_safety_class_idx").on(table.safetyClass),
  }),
);
