import { z } from "zod";
import type { Node } from "@graphguard/domain";

const RouterConfigSchema = z.object({
  mode: z.enum(["llm", "rule"]).default("rule"),
  routingPrompt: z.string().optional(),
  rules: z
    .array(
      z.object({
        condition: z.string(),
        targetNodeId: z.string(),
      }),
    )
    .optional(),
});

const RetrievalConfigSchema = z.object({
  topK: z.number().int().positive().default(3),
  minScore: z.number().min(0).max(1).default(0.5),
  useEmbeddings: z.boolean().default(false),
});

const SpecialistConfigSchema = z.object({
  systemPrompt: z.string().min(1),
  model: z.string().default("llama-3.3-70b-versatile"),
  maxTokens: z.number().int().positive().default(1024),
  temperature: z.number().min(0).max(2).default(0.7),
});

const SafetyConfigSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      pattern: z.string().optional(),
    }),
  ),
  violationAction: z.enum(["halt", "redirect"]).default("redirect"),
  redirectNodeId: z.string().optional(),
});

const EscalationConfigSchema = z.object({
  reason: z.string().optional(),
  autoEscalate: z.boolean().default(false),
});

const FinalResponseConfigSchema = z.object({
  template: z.string().optional(),
  includeHistory: z.boolean().default(false),
});

const CONFIG_VALIDATORS: Record<string, z.ZodType> = {
  router: RouterConfigSchema,
  retrieval: RetrievalConfigSchema,
  specialist: SpecialistConfigSchema,
  safety: SafetyConfigSchema,
  escalation: EscalationConfigSchema,
  final_response: FinalResponseConfigSchema,
};

export interface NodeConfigValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a node's activation_config against its type's Zod schema.
 */
export function validateNodeConfig(node: Node): NodeConfigValidation {
  const validator = CONFIG_VALIDATORS[node.type];
  if (!validator) {
    return { valid: false, errors: [`Unknown node type: ${node.type}`] };
  }

  const result = validator.safeParse(node.activationConfig);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}
