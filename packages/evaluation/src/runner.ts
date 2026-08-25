import type {
  TestCase,
  EvaluationResult,
  Evaluator,
  EvaluationContext,
  GraphExecutionSnapshot,
} from "./types";
import { aggregateRun, type TestCaseResults } from "./scoring";
import type { RunAggregate } from "./types";

// ─── Bounded-Concurrency Helper ──────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = fn(item).then(() => {
      executing.delete(promise);
    });
    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

// ─── Execution Function Type ─────────────────────────────────────────────────

export type ExecuteGraphFn = (
  input: string,
  conversationId: string,
) => Promise<GraphExecutionSnapshot>;

// ─── Evaluation Runner ───────────────────────────────────────────────────────

export interface EvaluationRunnerOptions {
  /** Maximum concurrent test case executions */
  concurrency?: number;
  /** Callback invoked after each test case completes (for incremental persistence) */
  onCaseComplete?: (
    testCaseId: string,
    results: EvaluationResult[],
  ) => void | Promise<void>;
  /** Callback invoked when the entire run completes */
  onRunComplete?: (aggregation: RunAggregate) => void | Promise<void>;
}

export interface RunResult {
  runId: string;
  aggregation: RunAggregate;
  caseResults: Array<{
    testCaseId: string;
    results: EvaluationResult[];
    execution: GraphExecutionSnapshot;
  }>;
}

export async function runEvaluation(
  runId: string,
  graphVersionId: string,
  testCases: TestCase[],
  evaluators: Evaluator[],
  executeGraph: ExecuteGraphFn,
  options: EvaluationRunnerOptions = {},
): Promise<RunResult> {
  const { concurrency = 5, onCaseComplete, onRunComplete } = options;

  const caseResults: Array<{
    testCaseId: string;
    results: EvaluationResult[];
    execution: GraphExecutionSnapshot;
  }> = [];

  // Execute test cases with bounded concurrency
  await runWithConcurrency(testCases, concurrency, async (testCase) => {
    // Execute the graph
    const execution = await executeGraph(testCase.input, testCase.id);

    // Build evaluation context
    const evalContext: EvaluationContext = {
      testCase,
      executionResult: execution,
    };

    // Run all evaluators against this test case
    const evaluationResults: EvaluationResult[] = [];

    for (const evaluator of evaluators) {
      const result = await evaluator.evaluate(evalContext);
      evaluationResults.push(result);
    }

    caseResults.push({
      testCaseId: testCase.id,
      results: evaluationResults,
      execution,
    });

    // Incremental persistence callback
    if (onCaseComplete) {
      await onCaseComplete(testCase.id, evaluationResults);
    }
  });

  // Build aggregation
  const testCaseResults: TestCaseResults[] = caseResults.map((cr) => ({
    testCaseId: cr.testCaseId,
    results: cr.results,
    nodeIds: cr.execution.nodePath.map((n) => n.nodeId),
    nodeTypes: cr.execution.nodePath.map((n) => n.nodeType),
  }));

  const aggregation = aggregateRun(runId, graphVersionId, testCaseResults);

  // Final callback
  if (onRunComplete) {
    await onRunComplete(aggregation);
  }

  return {
    runId,
    aggregation,
    caseResults,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createRunId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.getTime().toString(36);
  return `eval-${dateStr}-${timeStr}`;
}

/**
 * Filter test cases by category, splitting into evaluation and canary datasets.
 */
export function splitDataset(
  testCases: TestCase[],
  canaryIds: Set<string>,
): { evaluation: TestCase[]; canary: TestCase[] } {
  const evaluation: TestCase[] = [];
  const canary: TestCase[] = [];

  for (const tc of testCases) {
    if (canaryIds.has(tc.id)) {
      canary.push(tc);
    } else {
      evaluation.push(tc);
    }
  }

  return { evaluation, canary };
}
