export const GRAPH_ENGINE_VERSION = "0.1.0";

export { validateGraph } from "./validation";
export {
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
export {
  createExecutionContext,
  recordNodeExecution,
  addEvidence,
  setVariable,
  recordLLMCall,
  completeContext,
  errorContext,
  haltContext,
  getExecutionTrace,
} from "./context";
export { executeGraph } from "./runtime";
export { validateNodeConfig } from "./node-configs";
export { getKnowledgeBase, PHARMA_KNOWLEDGE_BASE } from "./knowledge-base";
export {
  createExampleGraph,
  createInvalidGraph,
  createCyclicGraph,
} from "./example-graph";
