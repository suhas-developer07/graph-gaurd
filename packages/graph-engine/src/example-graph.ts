import type { GraphVersion, Node, Edge } from "@graphguard/domain";

/**
 * Example pharmaceutical knowledge base graph for testing.
 *
 * Flow:
 *   router → retrieval → specialist → safety → final_response
 *                             ↘ escalation (on safety redirect)
 *
 * This graph demonstrates:
 * - Rule-based routing (router decides based on input keywords)
 * - Retrieval (fetches relevant KB entries)
 * - Specialist (generates a response using evidence)
 * - Safety (checks for violations before returning)
 * - Final response (returns the answer)
 */
export function createExampleGraph(): GraphVersion {
  const graphVersionId = "gv-example-001";
  const graphId = "g-example-001";

  const nodes: Node[] = [
    {
      id: "entry-router",
      graphVersionId,
      type: "router",
      prompt: "Route the user's question to the appropriate handler.",
      activationConfig: {
        mode: "rule",
        rules: [
          {
            condition: "input contains price OR input contains cost OR input contains insurance",
            targetNodeId: "pricing-specialist",
          },
          {
            condition: "input contains emergency OR input contains 911 OR input contains help",
            targetNodeId: "escalation-node",
          },
        ],
        defaultTargetNodeId: "retrieval-node",
      },
    },
    {
      id: "retrieval-node",
      graphVersionId,
      type: "retrieval",
      prompt: "Search the knowledge base for relevant information.",
      activationConfig: {
        topK: 3,
        minScore: 0.1,
        useEmbeddings: false,
      },
    },
    {
      id: "pricing-specialist",
      graphVersionId,
      type: "specialist",
      prompt: "You are a pharmacy pricing specialist. Answer questions about medication costs and insurance.",
      activationConfig: {
        systemPrompt:
          "You are a helpful pharmacy assistant specializing in medication pricing and insurance coverage. " +
          "Use the provided evidence to answer the user's question. " +
          "Always remind patients to contact their insurance provider for specific coverage details. " +
          "Never provide specific medical advice.",
        model: "llama-3.3-70b-versatile",
        maxTokens: 512,
        temperature: 0.3,
      },
    },
    {
      id: "safety-check",
      graphVersionId,
      type: "safety",
      prompt: "Check the response for safety violations.",
      activationConfig: {
        rules: [
          {
            id: "no-emergency-advice",
            description: "Should not provide emergency medical advice",
            pattern: "take \\d+ pills|double dose|overdose is safe",
          },
          {
            id: "no-prescription-change",
            description: "Should not tell patients to change prescriptions",
            pattern: "stop taking|change your dose|skip your",
          },
        ],
        violationAction: "redirect",
        redirectNodeId: "escalation-node",
      },
    },
    {
      id: "escalation-node",
      graphVersionId,
      type: "escalation",
      prompt: "This conversation requires human assistance.",
      activationConfig: {
        reason: "Safety concern or emergency request detected",
        autoEscalate: false,
      },
    },
    {
      id: "final-response",
      graphVersionId,
      type: "final_response",
      prompt: "Thank you for your question. Here is the information we found:",
      activationConfig: {
        template: "{{response}}",
        includeHistory: false,
      },
    },
  ];

  const edges: Edge[] = [
    // Router → retrieval (default path)
    {
      id: "e-router-retrieval",
      graphVersionId,
      sourceNodeId: "entry-router",
      targetNodeId: "retrieval-node",
      condition: null,
    },
    // Router → pricing-specialist (if pricing keywords matched)
    // (handled by the router's rule logic, edge exists for structural completeness)
    {
      id: "e-router-pricing",
      graphVersionId,
      sourceNodeId: "entry-router",
      targetNodeId: "pricing-specialist",
      condition: null,
    },
    // Router → escalation (if emergency keywords matched)
    {
      id: "e-router-escalation",
      graphVersionId,
      sourceNodeId: "entry-router",
      targetNodeId: "escalation-node",
      condition: null,
    },
    // Retrieval → pricing-specialist (retrieval feeds into specialist)
    {
      id: "e-retrieval-specialist",
      graphVersionId,
      sourceNodeId: "retrieval-node",
      targetNodeId: "pricing-specialist",
      condition: null,
    },
    // Pricing specialist → safety check
    {
      id: "e-specialist-safety",
      graphVersionId,
      sourceNodeId: "pricing-specialist",
      targetNodeId: "safety-check",
      condition: null,
    },
    // Safety check → final response (if no violations)
    {
      id: "e-safety-final",
      graphVersionId,
      sourceNodeId: "safety-check",
      targetNodeId: "final-response",
      condition: null,
    },
    // Safety check → escalation (if violation detected, redirect)
    {
      id: "e-safety-escalation",
      graphVersionId,
      sourceNodeId: "safety-check",
      targetNodeId: "escalation-node",
      condition: null,
    },
  ];

  return {
    id: graphVersionId,
    graphId,
    version: 1,
    status: "draft",
    createdBy: "system",
    publishedAt: null,
    nodes,
    edges,
  };
}

/**
 * Create an intentionally invalid graph for testing validation.
 */
export function createInvalidGraph(): GraphVersion {
  return {
    id: "gv-invalid-001",
    graphId: "g-invalid-001",
    version: 1,
    status: "draft",
    createdBy: "system",
    publishedAt: null,
    nodes: [
      {
        id: "node-a",
        graphVersionId: "gv-invalid-001",
        type: "router",
        prompt: "Router",
        activationConfig: { mode: "rule", rules: [] },
      },
      {
        id: "node-a", // Duplicate ID!
        graphVersionId: "gv-invalid-001",
        type: "specialist",
        prompt: "Duplicate specialist",
        activationConfig: { systemPrompt: "test" },
      },
    ],
    edges: [
      {
        id: "edge-dangling",
        graphVersionId: "gv-invalid-001",
        sourceNodeId: "node-nonexistent", // Dangling edge
        targetNodeId: "node-a",
        condition: null,
      },
    ],
  };
}

/**
 * Create a graph with a cycle for testing cycle detection.
 */
export function createCyclicGraph(): GraphVersion {
  return {
    id: "gv-cyclic-001",
    graphId: "g-cyclic-001",
    version: 1,
    status: "draft",
    createdBy: "system",
    publishedAt: null,
    nodes: [
      {
        id: "cycle-a",
        graphVersionId: "gv-cyclic-001",
        type: "router",
        prompt: "A",
        activationConfig: { mode: "rule", rules: [] },
      },
      {
        id: "cycle-b",
        graphVersionId: "gv-cyclic-001",
        type: "specialist",
        prompt: "B",
        activationConfig: { systemPrompt: "test" },
      },
    ],
    edges: [
      {
        id: "e-a-b",
        graphVersionId: "gv-cyclic-001",
        sourceNodeId: "cycle-a",
        targetNodeId: "cycle-b",
        condition: null,
      },
      {
        id: "e-b-a",
        graphVersionId: "gv-cyclic-001",
        sourceNodeId: "cycle-b",
        targetNodeId: "cycle-a",
        condition: null,
      },
    ],
  };
}
