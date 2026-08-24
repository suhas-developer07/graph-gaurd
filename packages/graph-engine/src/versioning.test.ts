import { describe, it, expect } from "vitest";
import {
  isPublished,
  assertMutable,
  publishVersion,
  addNode,
  removeNode,
  updateNode,
  addEdge,
  removeEdge,
  PublishedVersionError,
  InvalidGraphError,
} from "./versioning";
import type { GraphVersion, Node, Edge } from "@graphguard/domain";

function createDraftVersion(): GraphVersion {
  return {
    id: "gv-test-001",
    graphId: "g-test-001",
    version: 1,
    status: "draft",
    createdBy: "test",
    publishedAt: null,
    nodes: [
      { id: "n1", graphVersionId: "gv-test-001", type: "router", prompt: "", activationConfig: { mode: "rule", rules: [] } },
      { id: "n2", graphVersionId: "gv-test-001", type: "final_response", prompt: "Hello", activationConfig: {} },
    ],
    edges: [
      { id: "e1", graphVersionId: "gv-test-001", sourceNodeId: "n1", targetNodeId: "n2", condition: null },
    ],
  };
}

describe("versioning", () => {
  describe("isPublished", () => {
    it("should return false for draft", () => {
      expect(isPublished(createDraftVersion())).toBe(false);
    });

    it("should return true for published", () => {
      const version = createDraftVersion();
      version.status = "published";
      expect(isPublished(version)).toBe(true);
    });
  });

  describe("assertMutable", () => {
    it("should not throw for draft", () => {
      expect(() => assertMutable(createDraftVersion())).not.toThrow();
    });

    it("should throw for published", () => {
      const version = createDraftVersion();
      version.status = "published";
      expect(() => assertMutable(version)).toThrow(PublishedVersionError);
    });
  });

  describe("publishVersion", () => {
    it("should publish a valid graph", () => {
      const version = createDraftVersion();
      const published = publishVersion(version);
      expect(published.status).toBe("published");
      expect(published.publishedAt).toBeInstanceOf(Date);
    });

    it("should reject an invalid graph", () => {
      const version: GraphVersion = {
        ...createDraftVersion(),
        nodes: [
          { id: "n1", graphVersionId: "gv-test-001", type: "router", prompt: "", activationConfig: {} },
          { id: "n1", graphVersionId: "gv-test-001", type: "specialist", prompt: "", activationConfig: {} }, // duplicate
        ],
        edges: [],
      };
      expect(() => publishVersion(version)).toThrow(InvalidGraphError);
    });
  });

  describe("addNode", () => {
    it("should add a node to a draft version", () => {
      const version = createDraftVersion();
      const newNode: Node = {
        id: "n3",
        graphVersionId: "gv-test-001",
        type: "retrieval",
        prompt: "Search",
        activationConfig: {},
      };
      const updated = addNode(version, newNode);
      expect(updated.nodes).toHaveLength(3);
      expect(updated.nodes[2].id).toBe("n3");
    });

    it("should throw when adding to published version", () => {
      const version = createDraftVersion();
      version.status = "published";
      const newNode: Node = {
        id: "n3",
        graphVersionId: "gv-test-001",
        type: "retrieval",
        prompt: "Search",
        activationConfig: {},
      };
      expect(() => addNode(version, newNode)).toThrow(PublishedVersionError);
    });
  });

  describe("removeNode", () => {
    it("should remove a node and its edges", () => {
      const version = createDraftVersion();
      const updated = removeNode(version, "n1");
      expect(updated.nodes).toHaveLength(1);
      expect(updated.nodes[0].id).toBe("n2");
      // Edge referencing n1 should be removed
      expect(updated.edges).toHaveLength(0);
    });

    it("should throw when removing from published version", () => {
      const version = createDraftVersion();
      version.status = "published";
      expect(() => removeNode(version, "n1")).toThrow(PublishedVersionError);
    });
  });

  describe("updateNode", () => {
    it("should update a node's properties", () => {
      const version = createDraftVersion();
      const updated = updateNode(version, "n2", { prompt: "Updated prompt" });
      expect(updated.nodes[1].prompt).toBe("Updated prompt");
    });

    it("should throw when updating published version", () => {
      const version = createDraftVersion();
      version.status = "published";
      expect(() => updateNode(version, "n2", { prompt: "test" })).toThrow(PublishedVersionError);
    });
  });

  describe("addEdge / removeEdge", () => {
    it("should add and remove edges", () => {
      let version = createDraftVersion();
      const newEdge: Edge = {
        id: "e2",
        graphVersionId: "gv-test-001",
        sourceNodeId: "n1",
        targetNodeId: "n2",
        condition: null,
      };
      version = addEdge(version, newEdge);
      expect(version.edges).toHaveLength(2);

      version = removeEdge(version, "e2");
      expect(version.edges).toHaveLength(1);
    });

    it("should throw when modifying edges on published version", () => {
      const version = createDraftVersion();
      version.status = "published";
      const newEdge: Edge = {
        id: "e2",
        graphVersionId: "gv-test-001",
        sourceNodeId: "n1",
        targetNodeId: "n2",
        condition: null,
      };
      expect(() => addEdge(version, newEdge)).toThrow(PublishedVersionError);
      expect(() => removeEdge(version, "e1")).toThrow(PublishedVersionError);
    });
  });
});
