import type { GraphVersion, Node, Edge, ValidationResult } from "@graphguard/domain";
import { validateGraph } from "./validation";

/**
 * Error thrown when attempting to modify a published (immutable) graph version.
 */
export class PublishedVersionError extends Error {
  constructor(versionId: string) {
    super(
      `Cannot modify graph version "${versionId}": published versions are immutable. ` +
        `Create a new draft version instead.`,
    );
    this.name = "PublishedVersionError";
  }
}

/**
 * Error thrown when attempting to publish an invalid graph.
 */
export class InvalidGraphError extends Error {
  constructor(validationResult: ValidationResult) {
    const errorSummary = validationResult.errors.map((e) => `  - ${e.message}`).join("\n");
    super(`Cannot publish graph: validation failed.\n${errorSummary}`);
    this.name = "InvalidGraphError";
    this.validationResult = validationResult;
  }
  validationResult: ValidationResult;
}

/**
 * Check if a graph version is immutable (published).
 */
export function isPublished(version: GraphVersion): boolean {
  return version.status === "published";
}

/**
 * Ensure a graph version is mutable (draft status).
 * Throws PublishedVersionError if the version is published.
 */
export function assertMutable(version: GraphVersion): void {
  if (isPublished(version)) {
    throw new PublishedVersionError(version.id);
  }
}

/**
 * Validate and publish a graph version.
 * - Runs full validation (Section 5, step 2)
 * - If valid, sets status to "published" and published_at to now
 * - If invalid, throws InvalidGraphError with the validation details
 *
 * Returns the updated GraphVersion with published status.
 */
export function publishVersion(version: GraphVersion): GraphVersion {
  // Validate the graph first
  const validation = validateGraph(version.nodes, version.edges);
  if (!validation.valid) {
    throw new InvalidGraphError(validation);
  }

  // Publish
  return {
    ...version,
    status: "published",
    publishedAt: new Date(),
  };
}

/**
 * Add a node to a draft graph version.
 * Throws PublishedVersionError if the version is published.
 */
export function addNode(version: GraphVersion, node: Node): GraphVersion {
  assertMutable(version);
  return {
    ...version,
    nodes: [...version.nodes, node],
  };
}

/**
 * Remove a node from a draft graph version.
 * Also removes all edges that reference the node.
 * Throws PublishedVersionError if the version is published.
 */
export function removeNode(version: GraphVersion, nodeId: string): GraphVersion {
  assertMutable(version);
  return {
    ...version,
    nodes: version.nodes.filter((n) => n.id !== nodeId),
    edges: version.edges.filter(
      (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId,
    ),
  };
}

/**
 * Update a node in a draft graph version.
 * Throws PublishedVersionError if the version is published.
 */
export function updateNode(
  version: GraphVersion,
  nodeId: string,
  updates: Partial<Omit<Node, "id" | "graphVersionId">>,
): GraphVersion {
  assertMutable(version);
  return {
    ...version,
    nodes: version.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
  };
}

/**
 * Add an edge to a draft graph version.
 * Throws PublishedVersionError if the version is published.
 */
export function addEdge(version: GraphVersion, edge: Edge): GraphVersion {
  assertMutable(version);
  return {
    ...version,
    edges: [...version.edges, edge],
  };
}

/**
 * Remove an edge from a draft graph version.
 * Throws PublishedVersionError if the version is published.
 */
export function removeEdge(version: GraphVersion, edgeId: string): GraphVersion {
  assertMutable(version);
  return {
    ...version,
    edges: version.edges.filter((e) => e.id !== edgeId),
  };
}
