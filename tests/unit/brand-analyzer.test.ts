import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { POST as analyzeBrandRoutePost } from "@/app/api/brands/analyze/route";
import {
  DEFAULT_OPENAI_MODEL,
  doesModelSupportStructuredOutputs,
  generateStructuredOutputWithOpenAI,
  OpenAIAnalysisError,
  OpenAIConfigurationError,
  resolveOpenAIConfig,
} from "@/lib/ai/openai-client";
import {
  analyzeBrandSources,
  assertHostnameResolvesToPublicIp,
  BrandAnalysisRequestSchema,
  BrandProfileSchema,
  buildControlledBrandAnalysisResult,
  extractFacebookPageContent,
  extractWebsiteContent,
  fetchSafeHtmlPage,
  InsufficientBrandSourcesError,
  loadBrandAnalyzerFixture,
  parseHtmlBrandSignals,
  UnsafeUrlError,
  validateAndNormalizePublicUrl,
} from "@/lib/brand";

describe("Step 3 — AI Brand Analyzer (OpenAI Responses API + Structured Outputs)", () => {
  describe("1. Brand Input Validation", () => {
    it("accepts valid website, optional Facebook URL, and defaults targetMarket to Thailand", () => {
      const parsed = BrandAnalysisRequestSchema.parse({
        websiteUrl: "https://lumina-skincare-th.example.com",
      });

      expect(parsed.websiteUrl).toBe("https://lumina-skincare-th.example.com");
      expect(parsed.targetMarket).toBe("Thailand");
    });

    it("accepts manualDescription alone when websiteUrl is omitted", () => {
      const parsed = BrandAnalysisRequestSchema.parse({
        websiteUrl: "",
        manualDescription:
          "Thai herbal toothpaste brand for sensitive gums and fresh breath.",
      });

      expect(parsed.manualDescription).toContain("Thai herbal toothpaste");
      expect(parsed.targetMarket).toBe("Thailand");
    });

    it("rejects requests when websiteUrl, facebookPageUrl, and manualDescription are all empty", () => {
      const result = BrandAnalysisRequestSchema.safeParse({
        websiteUrl: "   ",
        facebookPageUrl: null,
        manualDescription: "",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("2. URL Normalization & SSRF Protection", () => {
    it("normalizes valid public URLs and prepends https:// when scheme is omitted", () => {
      const normalized = validateAndNormalizePublicUrl(
        "lumina-skincare-th.example.com/about#team"
      );
      expect(normalized.toString()).toBe(
        "https://lumina-skincare-th.example.com/about"
      );
    });

    it("rejects localhost, loopback, private IPv4/IPv6, metadata endpoints, and non-HTTP schemes", () => {
      const unsafeUrls = [
        "http://localhost:3000/admin",
        "http://127.0.0.1:8080/secret",
        "http://0.0.0.0/",
        "http://[::1]:3000/",
        "http://10.0.0.15/internal",
        "http://172.16.10.5/config",
        "http://192.168.1.1/router",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://internal.service.local/api",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://admin:secret@example.com/",
      ];

      for (const badUrl of unsafeUrls) {
        expect(() => validateAndNormalizePublicUrl(badUrl)).toThrow(
          UnsafeUrlError
        );
      }
    });

    it("rejects hostnames that resolve via DNS to private or loopback IP addresses", async () => {
      const fakePrivateDns = vi
        .fn()
        .mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

      await expect(
        assertHostnameResolvesToPublicIp(
          "rebinding.example.com",
          fakePrivateDns
        )
      ).rejects.toThrow(UnsafeUrlError);

      const fakePublicDns = vi
        .fn()
        .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

      await expect(
        assertHostnameResolvesToPublicIp("example.com", fakePublicDns)
      ).resolves.toBeUndefined();
    });

    it("blocks unsafe redirects targeting private IPs or metadata endpoints", async () => {
      const mockRedirectFetch = vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "http://169.254.169.254/latest/meta-data/",
          },
        })
      );

      await expect(
        fetchSafeHtmlPage("https://public-brand.example.com", {
          fetchFn: mockRedirectFetch as unknown as typeof fetch,
        })
      ).rejects.toThrow(UnsafeUrlError);
    });
  });

  describe("3. Website & Facebook Extraction Error Handling", () => {
    it("extracts title, meta description, headings, about snippets, and product descriptions from HTML", () => {
      const fixture = loadBrandAnalyzerFixture();
      const signals = parseHtmlBrandSignals(
        fixture.sampleWebsiteHtml,
        fixture.sampleWebsiteUrl
      );

      expect(signals.title).toContain("Lumina Skin Thailand");
      expect(signals.metaDescription).toContain("แบรนด์สกินแคร์เวชสำอางไทย");
      expect(signals.headings).toContain("เกี่ยวกับแบรนด์ Lumina Skin");
      expect(signals.aboutSectionSnippets.length).toBeGreaterThan(0);
      expect(signals.productSectionSnippets.length).toBeGreaterThanOrEqual(3);
    });

    it("handles inaccessible websites (HTTP 503 or empty page) gracefully with explicit warning", async () => {
      const failingFetch = vi.fn().mockResolvedValue(
        new Response("Service Unavailable", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "content-type": "text/html" },
        })
      );

      const result = await extractWebsiteContent(
        "https://down-website.example.com",
        {
          fetchFn: failingFetch as unknown as typeof fetch,
        }
      );

      expect(result.status.status).toBe("inaccessible");
      expect(result.status.warning).toContain("HTTP 503");
      expect(result.combinedSummaryText).toBeNull();
    });

    it("reports Facebook login/authentication restrictions gracefully without failing analysis", async () => {
      const fixture = loadBrandAnalyzerFixture();
      const fbFetch = vi.fn().mockResolvedValue(
        new Response(fixture.sampleFacebookBlockedHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );

      const fbResult = await extractFacebookPageContent(
        fixture.sampleFacebookPageUrl,
        {
          fetchFn: fbFetch as unknown as typeof fetch,
        }
      );

      expect(fbResult.status.status).toBe("restricted");
      expect(fbResult.status.warning).toContain("restricted");
      expect(fbResult.combinedSummaryText).toBeNull();
    });
  });

  describe("4. Brand Profile Schema & Missing Data Handling", () => {
    it("validates a complete BrandProfile and allows null / empty arrays for unsupported fields", () => {
      const fixture = loadBrandAnalyzerFixture();
      const parsed = BrandProfileSchema.parse(fixture.expectedBrandProfile);
      expect(parsed.brandName).toBe("Lumina Skin Thailand");
      expect(parsed.suggestedTikTokSearchKeywords.length).toBeGreaterThan(0);

      const sparseProfile = BrandProfileSchema.parse({
        brandName: null,
        brandDescription: "Handmade ceramic mugs in Chiang Mai.",
        industry: null,
        productCategories: [],
        keyProductsOrServices: [],
        targetAudienceDescription: null,
        targetMarket: "Thailand",
        brandTone: [],
        contentThemes: [],
        idealCreatorCharacteristics: [],
        excludedCreatorCharacteristics: [],
        suggestedTikTokSearchKeywords: ["แก้วเซรามิกทำมือ"],
        sourceReferences: [
          {
            url: "manual-input",
            sourceType: "manual",
            title: null,
            extractedFactsSummary: "Manual description provided by user.",
          },
        ],
        missingInformation: ["Brand name not provided."],
        confidenceNotes: {
          observedFacts: ["Brand sells handmade ceramic mugs in Chiang Mai."],
          inferredRecommendations: ["Suggested Thai TikTok search keyword."],
          overallConfidence: "low",
          rationale: "Only a one-sentence manual description was provided.",
        },
      });

      expect(sparseProfile.brandName).toBeNull();
      expect(sparseProfile.productCategories).toEqual([]);
    });

    it("throws InsufficientBrandSourcesError when website and Facebook are inaccessible and no manual description is provided", async () => {
      const failingFetch = vi.fn().mockResolvedValue(
        new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "text/html" },
        })
      );

      await expect(
        analyzeBrandSources(
          {
            websiteUrl: "https://missing-brand.example.com",
            facebookPageUrl: "https://www.facebook.com/missingbrand",
            manualDescription: null,
          },
          {
            extractor: { fetchFn: failingFetch as unknown as typeof fetch },
          }
        )
      ).rejects.toThrow(InsufficientBrandSourcesError);
    });
  });

  describe("5. OpenAI Responses API & Structured Outputs Parsing (Mocked)", () => {
    it("verifies Structured Outputs model capability and configuration validation", () => {
      expect(doesModelSupportStructuredOutputs(DEFAULT_OPENAI_MODEL)).toBe(
        true
      );
      expect(doesModelSupportStructuredOutputs("gpt-4.1-mini")).toBe(true);
      expect(doesModelSupportStructuredOutputs("gpt-4o")).toBe(true);
      expect(doesModelSupportStructuredOutputs("gpt-3.5-turbo")).toBe(false);

      expect(() => resolveOpenAIConfig({ apiKey: "" })).toThrow(
        OpenAIConfigurationError
      );

      expect(() =>
        resolveOpenAIConfig({
          apiKey: "sk-test-valid-key",
          model: "gpt-3.5-turbo",
        })
      ).toThrow(OpenAIConfigurationError);
    });

    it("parses valid OpenAI Responses API structured output via mocked client", async () => {
      const fixture = loadBrandAnalyzerFixture();
      const mockParse = vi.fn().mockResolvedValue({
        model: "gpt-4o-mini-2024-07-18",
        output: [],
        output_parsed: fixture.expectedBrandProfile,
        output_text: JSON.stringify(fixture.expectedBrandProfile),
      });

      const mockClient = {
        responses: {
          parse: mockParse,
        },
      } as unknown as OpenAI;

      const result = await generateStructuredOutputWithOpenAI({
        systemInstructions: "Analyze brand.",
        userPrompt: "Brand data.",
        schema: BrandProfileSchema,
        schemaName: "brand_profile",
        config: {
          apiKey: "sk-test-key-not-real",
          model: "gpt-4o-mini",
          client: mockClient,
        },
      });

      expect(mockParse).toHaveBeenCalledTimes(1);
      expect(result.data.brandName).toBe("Lumina Skin Thailand");
      expect(result.modelUsed).toBe("gpt-4o-mini-2024-07-18");
    });

    it("handles malformed AI responses and refusals without fabricating results", async () => {
      const mockRefusalClient = {
        responses: {
          parse: vi.fn().mockResolvedValue({
            model: "gpt-4o-mini",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "refusal",
                    refusal: "Cannot fulfill request.",
                  },
                ],
              },
            ],
            output_parsed: null,
          }),
        },
      } as unknown as OpenAI;

      await expect(
        generateStructuredOutputWithOpenAI({
          systemInstructions: "Analyze brand.",
          userPrompt: "Brand data.",
          schema: BrandProfileSchema,
          schemaName: "brand_profile",
          config: {
            apiKey: "sk-test-key-not-real",
            model: "gpt-4o-mini",
            client: mockRefusalClient,
          },
        })
      ).rejects.toThrow(OpenAIAnalysisError);
    });
  });

  describe("6. Controlled End-to-End Fixture Analysis & Route Handler", () => {
    it("completes full brand analysis using controlled local website HTML, restricted Facebook fallback, and mocked OpenAI output", async () => {
      const fixture = loadBrandAnalyzerFixture();

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("facebook.com")) {
          return new Response(fixture.sampleFacebookBlockedHtml, {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        return new Response(fixture.sampleWebsiteHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      });

      let capturedUserPrompt = "";
      const mockGenerateProfile = vi
        .fn()
        .mockImplementation(async ({ userPrompt }: { userPrompt: string }) => {
          capturedUserPrompt = userPrompt;
          return {
            data: fixture.expectedBrandProfile,
            modelUsed: "gpt-4o-mini",
          };
        });

      const result = await analyzeBrandSources(
        {
          websiteUrl: fixture.sampleWebsiteUrl,
          facebookPageUrl: fixture.sampleFacebookPageUrl,
          targetMarket: "Thailand",
        },
        {
          extractor: { fetchFn: mockFetch as unknown as typeof fetch },
          generateProfileFn: mockGenerateProfile,
        }
      );

      expect(capturedUserPrompt).toContain("<untrusted_website_data>");
      expect(capturedUserPrompt).toContain(
        "Lumina Cica-Ceramide Barrier Serum"
      );
      expect(result.extractionStatus.website.status).toBe("success");
      expect(result.extractionStatus.facebook.status).toBe("restricted");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.brandProfile.brandName).toBe("Lumina Skin Thailand");
      expect(result.brandProfile.suggestedTikTokSearchKeywords).toContain(
        "รีวิวสกินแคร์ผิวแพ้ง่าย"
      );

      const controlledDemo = buildControlledBrandAnalysisResult();
      expect(controlledDemo.brandProfile.brandName).toBe(
        "Lumina Skin Thailand"
      );
    });

    it("validates POST /api/brands/analyze requests and rejects unsafe SSRF URLs with HTTP 400", async () => {
      const ssrfRequest = new Request(
        "http://localhost:3000/api/brands/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            websiteUrl: "http://127.0.0.1:8080/internal",
          }),
        }
      );

      const ssrfResponse = await analyzeBrandRoutePost(ssrfRequest);
      expect(ssrfResponse.status).toBe(400);
      const ssrfBody = await ssrfResponse.json();
      expect(ssrfBody.ok).toBe(false);
      expect(ssrfBody.error.code).toBe("PRIVATE_IP");
    });
  });
});
