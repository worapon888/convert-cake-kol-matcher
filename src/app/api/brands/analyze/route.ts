import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  OpenAIAnalysisError,
  OpenAIConfigurationError,
} from "@/lib/ai/openai-client";
import {
  analyzeBrandSources,
  BrandAnalysisRequestSchema,
  InsufficientBrandSourcesError,
  UnsafeUrlError,
} from "@/lib/brand";

export interface BrandAnalyzeApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    warnings?: string[];
    issues?: Array<{ path: string; message: string }>;
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json<BrandAnalyzeApiErrorResponse>(
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

  const parsedInput = BrandAnalysisRequestSchema.safeParse(rawBody);
  if (!parsedInput.success) {
    return NextResponse.json<BrandAnalyzeApiErrorResponse>(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            parsedInput.error.issues[0]?.message ??
            "Invalid brand analysis request parameters.",
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
    const result = await analyzeBrandSources(parsedInput.data);
    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json<BrandAnalyzeApiErrorResponse>(
        {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: 400 }
      );
    }

    if (err instanceof InsufficientBrandSourcesError) {
      return NextResponse.json<BrandAnalyzeApiErrorResponse>(
        {
          ok: false,
          error: {
            code: "INSUFFICIENT_BRAND_SOURCES",
            message: err.message,
            warnings: err.warnings,
          },
        },
        { status: 422 }
      );
    }

    if (err instanceof OpenAIConfigurationError) {
      return NextResponse.json<BrandAnalyzeApiErrorResponse>(
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
      return NextResponse.json<BrandAnalyzeApiErrorResponse>(
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
      return NextResponse.json<BrandAnalyzeApiErrorResponse>(
        {
          ok: false,
          error: {
            code: "SCHEMA_VALIDATION_ERROR",
            message: "Generated Brand Profile did not pass schema validation.",
            issues: err.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json<BrandAnalyzeApiErrorResponse>(
      {
        ok: false,
        error: {
          code: "INTERNAL_ANALYSIS_ERROR",
          message:
            "An unexpected error occurred while analyzing the brand sources.",
        },
      },
      { status: 500 }
    );
  }
}
