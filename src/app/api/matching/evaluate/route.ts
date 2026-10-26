import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  OpenAIAnalysisError,
  OpenAIConfigurationError,
} from "@/lib/ai/openai-client";
import {
  MatchingEvaluateRequestSchema,
  runKOLMatchingPipeline,
} from "@/lib/matching";

export interface MatchingEvaluateApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: Array<{ path: string; message: string }>;
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json<MatchingEvaluateApiErrorResponse>(
      {
        ok: false,
        error: {
          code: "INVALID_JSON_BODY",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 }
    );
  }

  const parsedInput = MatchingEvaluateRequestSchema.safeParse(rawBody);
  if (!parsedInput.success) {
    return NextResponse.json<MatchingEvaluateApiErrorResponse>(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            parsedInput.error.issues[0]?.message ??
            "Invalid matching evaluation request parameters.",
          issues: parsedInput.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await runKOLMatchingPipeline(parsedInput.data);
    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof OpenAIConfigurationError) {
      return NextResponse.json<MatchingEvaluateApiErrorResponse>(
        {
          ok: false,
          error: {
            code: "OPENAI_CONFIGURATION_ERROR",
            message: err.message,
          },
        },
        { status: 503 }
      );
    }

    if (err instanceof OpenAIAnalysisError) {
      return NextResponse.json<MatchingEvaluateApiErrorResponse>(
        {
          ok: false,
          error: {
            code: `OPENAI_${err.code}`,
            message: err.message,
          },
        },
        { status: err.statusCode }
      );
    }

    if (err instanceof ZodError) {
      return NextResponse.json<MatchingEvaluateApiErrorResponse>(
        {
          ok: false,
          error: {
            code: "SCHEMA_VALIDATION_ERROR",
            message:
              "Matching evaluation input or output failed schema validation.",
            issues: err.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json<MatchingEvaluateApiErrorResponse>(
      {
        ok: false,
        error: {
          code: "INTERNAL_MATCHING_ERROR",
          message: "An unexpected error occurred while evaluating KOL matches.",
        },
      },
      { status: 500 }
    );
  }
}
