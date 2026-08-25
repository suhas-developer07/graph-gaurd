import type { FastifyInstance } from "fastify";
import {
  runAnalysis,
  runReleaseGate,
  type AnalysisInput,
  type GraphVersionInput,
} from "@graphguard/regression";
import type { RunAggregate } from "@graphguard/evaluation";

/**
 * Register regression analysis and release gate routes.
 */
export async function registerRegressionRoutes(app: FastifyInstance) {
  /**
   * POST /regressions/analyze
   * Compare a current evaluation run against its baseline.
   * Returns graph diff, score diffs, regressions, and root causes.
   */
  app.post<{
    Body: {
      baselineRun: {
        id: string;
        graphVersionId: string;
        aggregates: RunAggregate;
        caseResults: Array<{
          testCaseId: string;
          evaluator: string;
          passed: boolean;
          score: number;
        }>;
      };
      currentRun: {
        id: string;
        graphVersionId: string;
        aggregates: RunAggregate;
        caseResults: Array<{
          testCaseId: string;
          evaluator: string;
          passed: boolean;
          score: number;
        }>;
      };
      baselineGraph: GraphVersionInput;
      currentGraph: GraphVersionInput;
    };
  }>("/regressions/analyze", async (request, reply) => {
    const input: AnalysisInput = request.body;

    // Validate required fields
    if (!input.baselineRun || !input.currentRun) {
      return reply.status(400).send({
        error: "Missing required fields: baselineRun, currentRun",
      });
    }

    if (!input.baselineGraph || !input.currentGraph) {
      return reply.status(400).send({
        error: "Missing required fields: baselineGraph, currentGraph",
      });
    }

    const result = runAnalysis(input);

    return reply.status(200).send({
      regressions: result.regressions,
      graphDiff: result.graphDiff,
      scoreDiffs: result.scoreDiffs,
      nodeScoreDiffs: result.nodeScoreDiffs,
      rootCauses: result.rootCauses,
    });
  });

  /**
   * POST /releases/:version/gate
   * Run the release gate for a specific graph version.
   * Returns PASS | WARN | BLOCK with full evidence.
   */
  app.post<{
    Params: { version: string };
    Body: {
      baselineRun: {
        id: string;
        graphVersionId: string;
        aggregates: RunAggregate;
        caseResults: Array<{
          testCaseId: string;
          evaluator: string;
          passed: boolean;
          score: number;
        }>;
      };
      currentRun: {
        id: string;
        graphVersionId: string;
        aggregates: RunAggregate;
        caseResults: Array<{
          testCaseId: string;
          evaluator: string;
          passed: boolean;
          score: number;
        }>;
      };
      baselineGraph: GraphVersionInput;
      currentGraph: GraphVersionInput;
    };
  }>("/releases/:version/gate", async (request, reply) => {
    const { version } = request.params;
    const input: AnalysisInput = request.body;

    // Validate required fields
    if (!input.baselineRun || !input.currentRun) {
      return reply.status(400).send({
        error: "Missing required fields: baselineRun, currentRun",
      });
    }

    if (!input.baselineGraph || !input.currentGraph) {
      return reply.status(400).send({
        error: "Missing required fields: baselineGraph, currentGraph",
      });
    }

    // Verify version matches
    if (input.currentRun.graphVersionId !== version) {
      return reply.status(400).send({
        error: `Version mismatch: expected ${version}, got ${input.currentRun.graphVersionId}`,
      });
    }

    const gateResult = runReleaseGate(input);

    // CI-friendly JSON response
    return reply.status(200).send({
      status: gateResult.status,
      graphVersionId: gateResult.graphVersionId,
      baselineRunId: gateResult.baselineRunId,
      currentRunId: gateResult.currentRunId,
      summary: gateResult.summary,
      regressions: gateResult.regressions.map((r: import("@graphguard/regression").Regression) => ({
        id: r.id,
        severity: r.severity,
        evaluator: r.evaluator,
        affectedNode: r.affectedNode,
        cause: r.cause,
        affectedCases: r.affectedCases,
      })),
      scoreDiffs: gateResult.scoreDiffs,
      nodeScoreDiffs: gateResult.nodeScoreDiffs,
      graphDiff: {
        nodesAdded: gateResult.graphDiff.nodesAdded.length,
        nodesRemoved: gateResult.graphDiff.nodesRemoved.length,
        nodesChanged: gateResult.graphDiff.nodesChanged.length,
        edgesAdded: gateResult.graphDiff.edgesAdded.length,
        edgesRemoved: gateResult.graphDiff.edgesRemoved.length,
        edgesChanged: gateResult.graphDiff.edgesChanged.length,
        semanticChanges: gateResult.graphDiff.semanticChanges.length,
      },
      timestamp: gateResult.timestamp.toISOString(),
    });
  });
}
