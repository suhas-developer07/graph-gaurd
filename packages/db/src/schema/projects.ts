import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { graphVersionStatusEnum, nodeTypeEnum } from "./enums";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  environment: text("environment").notNull().default("development"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const graphs = pgTable(
  "graphs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    activeVersionId: uuid("active_version_id"),
  },
  (table) => ({
    projectIdIdx: index("graphs_project_id_idx").on(table.projectId),
    projectIdFk: foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("cascade"),
  }),
);

export const graphVersions = pgTable(
  "graph_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphId: uuid("graph_id")
      .notNull()
      .references(() => graphs.id),
    version: integer("version").notNull(),
    status: graphVersionStatusEnum("status").notNull().default("draft"),
    createdBy: text("created_by").notNull().default("system"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => ({
    graphIdIdx: index("graph_versions_graph_id_idx").on(table.graphId),
    statusIdx: index("graph_versions_status_idx").on(table.status),
    graphIdFk: foreignKey({
      columns: [table.graphId],
      foreignColumns: [graphs.id],
    }).onDelete("cascade"),
  }),
);

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphVersionId: uuid("graph_version_id")
      .notNull()
      .references(() => graphVersions.id),
    type: nodeTypeEnum("type").notNull(),
    prompt: text("prompt").notNull(),
    activationConfig: jsonb("activation_config").$type<Record<string, unknown>>().default({}),
  },
  (table) => ({
    graphVersionIdIdx: index("nodes_graph_version_id_idx").on(table.graphVersionId),
    graphVersionIdFk: foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.id],
    }).onDelete("cascade"),
  }),
);

export const edges = pgTable(
  "edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphVersionId: uuid("graph_version_id")
      .notNull()
      .references(() => graphVersions.id),
    sourceNodeId: uuid("source_node_id")
      .notNull()
      .references(() => nodes.id),
    targetNodeId: uuid("target_node_id")
      .notNull()
      .references(() => nodes.id),
    condition: jsonb("condition").$type<Record<string, unknown>>(),
  },
  (table) => ({
    graphVersionIdIdx: index("edges_graph_version_id_idx").on(table.graphVersionId),
    sourceNodeIdIdx: index("edges_source_node_id_idx").on(table.sourceNodeId),
    targetNodeIdIdx: index("edges_target_node_id_idx").on(table.targetNodeId),
    graphVersionIdFk: foreignKey({
      columns: [table.graphVersionId],
      foreignColumns: [graphVersions.id],
    }).onDelete("cascade"),
    sourceNodeIdFk: foreignKey({
      columns: [table.sourceNodeId],
      foreignColumns: [nodes.id],
    }).onDelete("cascade"),
    targetNodeIdFk: foreignKey({
      columns: [table.targetNodeId],
      foreignColumns: [nodes.id],
    }).onDelete("cascade"),
  }),
);
