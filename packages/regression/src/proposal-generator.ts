import type {
  ProposalGenerationContext,
  GeneratedProposal,
  ProposalChangeType,
} from "./proposal-types";

/**
 * Groq API response type.
 */
interface GroqResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

/**
 * Call the Groq API.
 */
async function callGroq(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string = "llama-3.3-70b-versatile",
): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GroqResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("No content in Groq response");
  return content;
}

/**
 * Generate a candidate fix for a prompt-based regression.
 */
async function generatePromptFix(
  context: ProposalGenerationContext,
  apiKey: string,
): Promise<GeneratedProposal> {
  const systemPrompt = `You are an expert at improving AI agent prompts for pharmaceutical Q&A systems.

You will be given:
1. A node's current prompt that is causing test failures
2. A cluster of failing test cases with their inputs
3. The evaluators that are failing

Your job is to generate an improved prompt that:
- Fixes the specific failure cluster without breaking other functionality
- Maintains all safety and compliance requirements
- Is specific enough to handle the failing test cases
- Does NOT remove any safety disclaimers or compliance checks

Return a JSON object with:
{
  "newPrompt": "the improved prompt text",
  "rationale": "brief explanation of what you changed and why",
  "confidence": 0.0-1.0
}`;

  const failingInputs = context.sampleFailingInputs
    .slice(0, 5)
    .map((input, i) => `  ${i + 1}. "${input}"`)
    .join("\n");

  const userPrompt = `Current prompt for node "${context.targetNode}":
---
${context.currentPrompt ?? "No prompt available"}
---

Failing test cases (${context.failureCluster.failureCount} total, showing ${Math.min(5, context.sampleFailingInputs.length)}):
${failingInputs}

Failing evaluators: ${context.failureCluster.evaluators.join(", ")}
Common intent: ${context.failureCluster.commonTags.intent ?? "mixed"}

Generate an improved prompt that fixes these failures.`;

  const response = await callGroq(apiKey, systemPrompt, userPrompt);

  let parsed: { newPrompt?: string; rationale?: string; confidence?: number };
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${response.slice(0, 200)}`);
  }

  if (!parsed.newPrompt) {
    throw new Error("LLM response missing 'newPrompt' field");
  }

  return {
    change: { prompt: parsed.newPrompt },
    rationale: parsed.rationale ?? "LLM-generated prompt fix",
    confidence: parsed.confidence ?? 0.5,
  };
}

/**
 * Generate a candidate fix for an activation-config regression.
 */
async function generateActivationConfigFix(
  context: ProposalGenerationContext,
  apiKey: string,
): Promise<GeneratedProposal> {
  const systemPrompt = `You are an expert at improving AI agent routing and activation configurations.

You will be given:
1. A node's current activation configuration that is causing test failures
2. A cluster of failing test cases
3. The evaluators that are failing

Your job is to generate an improved activation_config that:
- Fixes the specific failure cluster
- Maintains correct routing for non-failing cases
- Is minimal — change only what's necessary

Return a JSON object with:
{
  "newActivationConfig": { ... the improved config ... },
  "rationale": "brief explanation of what you changed and why",
  "confidence": 0.0-1.0
}`;

  const failingInputs = context.sampleFailingInputs
    .slice(0, 5)
    .map((input, i) => `  ${i + 1}. "${input}"`)
    .join("\n");

  const userPrompt = `Current activation_config for node "${context.targetNode}":
---
${JSON.stringify(context.currentActivationConfig ?? {}, null, 2)}
---

Failing test cases (${context.failureCluster.failureCount} total, showing ${Math.min(5, context.sampleFailingInputs.length)}):
${failingInputs}

Failing evaluators: ${context.failureCluster.evaluators.join(", ")}
Common intent: ${context.failureCluster.commonTags.intent ?? "mixed"}

Generate an improved activation configuration that fixes these failures.`;

  const response = await callGroq(apiKey, systemPrompt, userPrompt);

  let parsed: { newActivationConfig?: Record<string, unknown>; rationale?: string; confidence?: number };
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${response.slice(0, 200)}`);
  }

  if (!parsed.newActivationConfig) {
    throw new Error("LLM response missing 'newActivationConfig' field");
  }

  return {
    change: { activationConfig: parsed.newActivationConfig },
    rationale: parsed.rationale ?? "LLM-generated activation config fix",
    confidence: parsed.confidence ?? 0.5,
  };
}

/**
 * Generate a candidate fix for a regression.
 * This is the main entry point for proposal generation.
 */
export async function generateProposal(
  context: ProposalGenerationContext,
  apiKey: string,
): Promise<GeneratedProposal> {
  if (context.changeType === "prompt") {
    return generatePromptFix(context, apiKey);
  } else {
    return generateActivationConfigFix(context, apiKey);
  }
}

/**
 * Build a proposal generation context from a regression and graph info.
 */
export function buildGenerationContext(params: {
  regressionId: string;
  targetNode: string;
  currentPrompt?: string;
  currentActivationConfig?: Record<string, unknown>;
  failureCluster: ProposalGenerationContext["failureCluster"];
  sampleFailingInputs: string[];
  changeType: ProposalChangeType;
}): ProposalGenerationContext {
  return {
    regressionId: params.regressionId,
    targetNode: params.targetNode,
    currentPrompt: params.currentPrompt,
    currentActivationConfig: params.currentActivationConfig,
    failureCluster: params.failureCluster,
    sampleFailingInputs: params.sampleFailingInputs,
    changeType: params.changeType,
  };
}
