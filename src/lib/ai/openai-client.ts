import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

/**
 * Default OpenAI model supporting Responses API + Structured Outputs (`json_schema` strict mode).
 */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini" as const;

/**
 * OpenAI models known to support Structured Outputs (`text.format` with strict JSON Schema)
 * in the Responses API.
 */
export const STRUCTURED_OUTPUT_CAPABLE_MODEL_PREFIXES = [
  "gpt-4o-mini",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-11-20",
  "gpt-4o",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-5",
  "o3-mini",
  "o3",
  "o4-mini",
] as const;

export class OpenAIConfigurationError extends Error {
  public readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "OpenAIConfigurationError";
  }
}

export class OpenAIAnalysisError extends Error {
  public readonly statusCode: number;
  public readonly code:
    "RATE_LIMIT" | "TIMEOUT" | "REFUSAL" | "MALFORMED_OUTPUT" | "API_ERROR";

  constructor(
    code:
      "RATE_LIMIT" | "TIMEOUT" | "REFUSAL" | "MALFORMED_OUTPUT" | "API_ERROR",
    message: string,
    statusCode = 502
  ) {
    super(message);
    this.name = "OpenAIAnalysisError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface OpenAIClientConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  client?: OpenAI;
}

/**
 * Checks whether a given OpenAI model ID supports Structured Outputs (`json_schema` strict mode).
 */
export function doesModelSupportStructuredOutputs(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "gpt-4o-2024-05-13") {
    // Initial 2024-05-13 snapshot did not support strict Structured Outputs
    return false;
  }
  return STRUCTURED_OUTPUT_CAPABLE_MODEL_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`)
  );
}

/**
 * Resolves and validates `OPENAI_API_KEY` and `OPENAI_MODEL` from environment variables or explicit config.
 */
export function resolveOpenAIConfig(config: OpenAIClientConfig = {}): {
  apiKey: string;
  model: string;
  timeoutMs: number;
} {
  const rawApiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const apiKey = rawApiKey.trim();

  if (
    !apiKey ||
    apiKey === "your_openai_api_key_here" ||
    apiKey === "sk-your-openai-api-key"
  ) {
    throw new OpenAIConfigurationError(
      "Missing valid OPENAI_API_KEY. Set OPENAI_API_KEY in .env.local on the server before running live AI analysis."
    );
  }

  const rawModel =
    config.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const model = rawModel.trim() || DEFAULT_OPENAI_MODEL;

  if (!doesModelSupportStructuredOutputs(model)) {
    throw new OpenAIConfigurationError(
      `Configured OPENAI_MODEL "${model}" does not support OpenAI Structured Outputs. Use "${DEFAULT_OPENAI_MODEL}", "gpt-4.1-mini", or "gpt-4o".`
    );
  }

  const timeoutMs = config.timeoutMs ?? 45000;
  return { apiKey, model, timeoutMs };
}

/**
 * Creates a server-side OpenAI SDK client instance.
 */
export function createServerOpenAIClient(config: OpenAIClientConfig = {}): {
  client: OpenAI;
  model: string;
} {
  const resolved = resolveOpenAIConfig(config);
  const client =
    config.client ??
    new OpenAI({
      apiKey: resolved.apiKey,
      timeout: resolved.timeoutMs,
      maxRetries: 1,
    });

  return { client, model: resolved.model };
}

/**
 * Verifies that the configured OpenAI model supports Structured Outputs and is accessible
 * under the configured `OPENAI_API_KEY` via the zero-token `models.retrieve` endpoint.
 */
export async function verifyOpenAiModelAvailability(
  config: OpenAIClientConfig = {}
): Promise<{
  available: boolean;
  model: string;
  supportsStructuredOutputs: boolean;
}> {
  const { client, model } = createServerOpenAIClient(config);
  const retrieved = await client.models.retrieve(model);

  return {
    available: Boolean(retrieved?.id),
    model: retrieved.id,
    supportsStructuredOutputs: doesModelSupportStructuredOutputs(retrieved.id),
  };
}

export interface StructuredResponseRequest<TSchema extends z.ZodType> {
  systemInstructions: string;
  userPrompt: string;
  schema: TSchema;
  schemaName: string;
  config?: OpenAIClientConfig;
}

/**
 * Invokes the OpenAI Responses API (`client.responses.parse`) with Structured Outputs
 * (`zodTextFormat`) and validates the result against the provided Zod schema.
 *
 * Never fabricates results on failure. Maps rate limits, timeouts, refusals, and malformed
 * outputs to explicit `OpenAIAnalysisError` instances.
 */
export async function generateStructuredOutputWithOpenAI<
  TSchema extends z.ZodType,
>(
  request: StructuredResponseRequest<TSchema>
): Promise<{ data: z.infer<TSchema>; modelUsed: string }> {
  const { client, model } = createServerOpenAIClient(request.config);

  try {
    const response = await client.responses.parse({
      model,
      instructions: request.systemInstructions,
      input: [
        {
          role: "user",
          content: request.userPrompt,
        },
      ],
      text: {
        format: zodTextFormat(request.schema, request.schemaName),
      },
    });

    // Check if the model issued a safety refusal inside output items
    for (const item of response.output ?? []) {
      if (item.type === "message") {
        for (const contentPart of item.content ?? []) {
          if (contentPart.type === "refusal") {
            throw new OpenAIAnalysisError(
              "REFUSAL",
              `OpenAI model refused to process the request: ${contentPart.refusal}`,
              422
            );
          }
        }
      }
    }

    const parsedCandidate =
      response.output_parsed ??
      (response.output_text ? JSON.parse(response.output_text) : null);

    if (!parsedCandidate) {
      throw new OpenAIAnalysisError(
        "MALFORMED_OUTPUT",
        "OpenAI returned an empty or unparseable structured output.",
        502
      );
    }

    const validated = request.schema.safeParse(parsedCandidate);
    if (!validated.success) {
      throw new OpenAIAnalysisError(
        "MALFORMED_OUTPUT",
        `OpenAI response failed Zod validation: ${validated.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        502
      );
    }

    return {
      data: validated.data,
      modelUsed: response.model || model,
    };
  } catch (err) {
    if (
      err instanceof OpenAIConfigurationError ||
      err instanceof OpenAIAnalysisError
    ) {
      throw err;
    }

    if (err instanceof RateLimitError) {
      throw new OpenAIAnalysisError(
        "RATE_LIMIT",
        "OpenAI API rate limit or quota exceeded (HTTP 429). Please wait or check your OpenAI billing quota.",
        429
      );
    }

    if (
      err instanceof APIConnectionTimeoutError ||
      (err instanceof Error && /timed?\s*out/i.test(err.message))
    ) {
      throw new OpenAIAnalysisError(
        "TIMEOUT",
        "OpenAI API request timed out before completion.",
        504
      );
    }

    if (err instanceof APIConnectionError) {
      throw new OpenAIAnalysisError(
        "API_ERROR",
        "Could not connect to OpenAI API. Check network connectivity.",
        502
      );
    }

    if (err instanceof APIError) {
      const status =
        typeof err.status === "number" && err.status >= 400 ? err.status : 502;
      throw new OpenAIAnalysisError(
        status === 429 ? "RATE_LIMIT" : "API_ERROR",
        `OpenAI API error (HTTP ${status}): ${err.message}`,
        status
      );
    }

    if (err instanceof SyntaxError) {
      throw new OpenAIAnalysisError(
        "MALFORMED_OUTPUT",
        "OpenAI returned malformed JSON that could not be parsed.",
        502
      );
    }

    throw new OpenAIAnalysisError(
      "API_ERROR",
      err instanceof Error ? err.message : "Unexpected OpenAI analysis error",
      502
    );
  }
}
