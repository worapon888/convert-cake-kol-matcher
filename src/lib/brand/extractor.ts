import type { SourceExtractionStatus } from "./schemas";
import {
  assertHostnameResolvesToPublicIp,
  type DnsLookupFn,
  UnsafeUrlError,
  validateAndNormalizePublicUrl,
} from "./ssrf";

export interface ExtractedPageContent {
  url: string;
  title: string | null;
  metaDescription: string | null;
  ogSiteName: string | null;
  headings: string[];
  aboutSectionSnippets: string[];
  productSectionSnippets: string[];
  mainText: string;
  discoveredSameOriginLinks: string[];
}

export interface WebsiteExtractionResult {
  status: SourceExtractionStatus;
  pages: ExtractedPageContent[];
  combinedSummaryText: string | null;
}

export interface FacebookExtractionResult {
  status: SourceExtractionStatus;
  pageTitle: string | null;
  pageDescription: string | null;
  combinedSummaryText: string | null;
}

export interface ExtractorOptions {
  fetchFn?: typeof fetch;
  dnsLookupFn?: DnsLookupFn;
  skipDnsLookup?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxSameOriginSubpages?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 512 * 1024; // 512 KB
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_SUBPAGES = 2;

const RELEVANT_SUBPAGE_PATH_REGEX =
  /\/(about|about-us|our-story|brand|story|who-we-are|products|services|collections|shop|skincare)(\/|$)/i;

const GENERIC_FB_WALL_PATTERNS = [
  /^facebook\s*[-–|]\s*log\s*in/i,
  /^log\s*in\s*to\s*facebook/i,
  /^เข้าสู่ระบบ\s*facebook/i,
  /^facebook$/i,
  /security\s*check/i,
  /คุณต้องเข้าสู่ระบบเพื่อดำเนินการต่อ/i,
];

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number.parseInt(code, 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const num = Number.parseInt(hex, 16);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _;
    });
}

function stripTagsAndNormalizeWhitespace(htmlFragment: string): string {
  const withoutScripts = htmlFragment
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|iframe|canvas|template)\b[^>]*>[\s\S]*?<\/\1>/gi,
      " "
    );
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function extractMetaContent(
  html: string,
  attrValuePattern: RegExp
): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    if (attrValuePattern.test(tag)) {
      const contentMatch = tag.match(
        /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i
      );
      const raw = contentMatch?.[1] ?? contentMatch?.[2] ?? "";
      const cleaned = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  }
  return null;
}

/**
 * Pure helper: Parses raw HTML string into structured brand signals (`title`, `metaDescription`,
 * `headings`, `aboutSectionSnippets`, `productSectionSnippets`, `mainText`, and relevant internal links).
 */
export function parseHtmlBrandSignals(
  html: string,
  pageUrl: string
): ExtractedPageContent {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch
    ? stripTagsAndNormalizeWhitespace(titleMatch[1])
    : null;
  const ogTitle = extractMetaContent(
    html,
    /\b(?:property|name)\s*=\s*["']og:title["']/i
  );
  const title = rawTitle || ogTitle || null;

  const metaDesc = extractMetaContent(
    html,
    /\bname\s*=\s*["']description["']/i
  );
  const ogDesc = extractMetaContent(
    html,
    /\b(?:property|name)\s*=\s*["']og:description["']/i
  );
  const metaDescription = metaDesc || ogDesc || null;

  const ogSiteName = extractMetaContent(
    html,
    /\b(?:property|name)\s*=\s*["']og:site_name["']/i
  );

  // Clean HTML before extracting headings and text blocks
  const cleanedHtml = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|iframe|canvas|template)\b[^>]*>[\s\S]*?<\/\1>/gi,
      " "
    );

  const headings: string[] = [];
  const headingRegex = /<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingRegex.exec(cleanedHtml)) !== null) {
    const text = stripTagsAndNormalizeWhitespace(headingMatch[2]);
    if (text.length >= 2 && text.length <= 200 && !headings.includes(text)) {
      headings.push(text);
    }
    if (headings.length >= 20) break;
  }

  // Extract paragraph and list-item blocks to classify about/positioning vs products/services
  const blockRegex = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const aboutSectionSnippets: string[] = [];
  const productSectionSnippets: string[] = [];
  const generalBlocks: string[] = [];

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(cleanedHtml)) !== null) {
    const text = stripTagsAndNormalizeWhitespace(blockMatch[2]);
    if (text.length < 20 || text.length > 600) continue;

    if (
      /(about\s+us|our\s+story|our\s+brand|mission|vision|แบรนด์|เกี่ยวกับเรา|จุดเด่น|เพื่อผิว|สำหรับผิว|คิดค้น|พัฒนา)/i.test(
        text
      )
    ) {
      if (
        aboutSectionSnippets.length < 8 &&
        !aboutSectionSnippets.includes(text)
      ) {
        aboutSectionSnippets.push(text);
      }
    }

    if (
      /(product|serum|cream|cleanser|sunscreen|supplement|service|collection|เซรั่ม|ครีม|กันแดด|โฟมล้างหน้า|เจลล้างหน้า|สกินแคร์|สินค้า|บริการ|สูตร|ส่วนผสม)/i.test(
        text
      )
    ) {
      if (
        productSectionSnippets.length < 10 &&
        !productSectionSnippets.includes(text)
      ) {
        productSectionSnippets.push(text);
      }
    }

    if (generalBlocks.length < 25 && !generalBlocks.includes(text)) {
      generalBlocks.push(text);
    }
  }

  const fullBodyText = stripTagsAndNormalizeWhitespace(cleanedHtml).slice(
    0,
    3500
  );
  const mainText =
    generalBlocks.length > 0
      ? generalBlocks.join("\n").slice(0, 3500)
      : fullBodyText;

  // Discover relevant same-origin links (/about, /products, etc.)
  const discoveredSameOriginLinks: string[] = [];
  let baseOrigin = "";
  try {
    baseOrigin = new URL(pageUrl).origin;
  } catch {
    baseOrigin = "";
  }

  if (baseOrigin) {
    const linkRegex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(cleanedHtml)) !== null) {
      const href = (linkMatch[1] ?? linkMatch[2] ?? "").trim();
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        continue;
      }
      try {
        const resolved = new URL(href, pageUrl);
        resolved.hash = "";
        if (
          resolved.origin === baseOrigin &&
          resolved.href !== pageUrl &&
          RELEVANT_SUBPAGE_PATH_REGEX.test(resolved.pathname) &&
          !discoveredSameOriginLinks.includes(resolved.href)
        ) {
          discoveredSameOriginLinks.push(resolved.href);
        }
      } catch {
        // Ignore malformed relative hrefs
      }
      if (discoveredSameOriginLinks.length >= 4) break;
    }
  }

  return {
    url: pageUrl,
    title,
    metaDescription,
    ogSiteName,
    headings,
    aboutSectionSnippets,
    productSectionSnippets,
    mainText,
    discoveredSameOriginLinks,
  };
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes * 2) {
      throw new Error(
        `Response Content-Length (${contentLength} bytes) exceeds maximum allowed limit.`
      );
    }
  }

  if (!response.body) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let totalBytes = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          const allowedSlice = value.subarray(
            0,
            Math.max(0, value.byteLength - (totalBytes - maxBytes))
          );
          result += decoder.decode(allowedSlice, { stream: false });
          break;
        }
        result += decoder.decode(value, { stream: true });
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore stream cancel errors
    }
  }

  return result;
}

/**
 * Performs a safe HTTP GET with SSRF checks on initial and redirected URLs,
 * timeout enforcement, and response size capping.
 */
export async function fetchSafeHtmlPage(
  rawUrl: string,
  options: ExtractorOptions = {}
): Promise<{ finalUrl: string; html: string }> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const shouldCheckDns =
    options.skipDnsLookup !== true && options.fetchFn === undefined;

  let currentUrl = validateAndNormalizePublicUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (shouldCheckDns) {
      await assertHostnameResolvesToPublicIp(
        currentUrl.hostname,
        options.dnsLookupFn
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchFn(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "ConvertCakeKOLMatcherBot/1.0 (+https://convertcake.com; BrandAnalyzer)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // Handle HTTP redirects manually to enforce SSRF validation on every redirect target
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    ) {
      if (hop === maxRedirects) {
        throw new Error(`Exceeded maximum redirect limit (${maxRedirects}).`);
      }
      const locationHeader = response.headers.get("location")!;
      let redirectedUrl: URL;
      try {
        redirectedUrl = new URL(locationHeader, currentUrl);
      } catch {
        throw new UnsafeUrlError(
          "INVALID_URL",
          `Invalid redirect location "${locationHeader}".`
        );
      }
      currentUrl = validateAndNormalizePublicUrl(redirectedUrl.toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText || "error"} from ${currentUrl.hostname}`
      );
    }

    const contentType = (
      response.headers.get("content-type") ?? "text/html"
    ).toLowerCase();
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error(
        `Unsupported Content-Type "${contentType}" from ${currentUrl.hostname}`
      );
    }

    const html = await readResponseTextWithLimit(response, maxBytes);
    return {
      finalUrl: currentUrl.toString(),
      html,
    };
  }

  throw new Error("Failed to resolve page after redirects.");
}

/**
 * Extracts public brand information from a business website (homepage + up to 2 relevant same-origin pages).
 * Re-throws `UnsafeUrlError` immediately if the URL violates SSRF security rules.
 */
export async function extractWebsiteContent(
  rawWebsiteUrl: string | null | undefined,
  options: ExtractorOptions = {}
): Promise<WebsiteExtractionResult> {
  if (!rawWebsiteUrl || rawWebsiteUrl.trim().length === 0) {
    return {
      status: {
        sourceType: "website",
        requestedUrl: null,
        normalizedUrl: null,
        status: "skipped",
        extractedTitle: null,
        visitedUrls: [],
        warning: null,
      },
      pages: [],
      combinedSummaryText: null,
    };
  }

  // Validate SSRF upfront — throw UnsafeUrlError directly so the API rejects unsafe URLs
  const normalizedUrlObj = validateAndNormalizePublicUrl(rawWebsiteUrl);
  const normalizedUrl = normalizedUrlObj.toString();

  try {
    const homeFetch = await fetchSafeHtmlPage(normalizedUrl, options);
    const homeSignals = parseHtmlBrandSignals(
      homeFetch.html,
      homeFetch.finalUrl
    );

    const hasMeaningfulHomeContent =
      Boolean(homeSignals.title) ||
      Boolean(homeSignals.metaDescription) ||
      homeSignals.mainText.trim().length >= 30;

    if (!hasMeaningfulHomeContent) {
      return {
        status: {
          sourceType: "website",
          requestedUrl: rawWebsiteUrl,
          normalizedUrl: homeFetch.finalUrl,
          status: "inaccessible",
          extractedTitle: null,
          visitedUrls: [homeFetch.finalUrl],
          warning:
            "Website returned an empty page or client-only shell with no extractable public text.",
        },
        pages: [],
        combinedSummaryText: null,
      };
    }

    const pages: ExtractedPageContent[] = [homeSignals];
    const visitedUrls: string[] = [homeFetch.finalUrl];

    const maxSubpages = options.maxSameOriginSubpages ?? DEFAULT_MAX_SUBPAGES;
    const candidateSubpages = homeSignals.discoveredSameOriginLinks.slice(
      0,
      maxSubpages
    );

    for (const subpageUrl of candidateSubpages) {
      try {
        const subFetch = await fetchSafeHtmlPage(subpageUrl, {
          ...options,
          maxSameOriginSubpages: 0,
        });
        if (!visitedUrls.includes(subFetch.finalUrl)) {
          visitedUrls.push(subFetch.finalUrl);
          const subSignals = parseHtmlBrandSignals(
            subFetch.html,
            subFetch.finalUrl
          );
          if (
            subSignals.title ||
            subSignals.metaDescription ||
            subSignals.mainText.length > 40
          ) {
            pages.push(subSignals);
          }
        }
      } catch {
        // Best-effort for secondary subpages; continue with homepage content
      }
    }

    const summaryBlocks = pages.map((page, idx) => {
      const lines: string[] = [
        `[Page ${idx + 1}] URL: ${page.url}`,
        `Title: ${page.title ?? "(none)"}`,
        `Site Name: ${page.ogSiteName ?? "(none)"}`,
        `Meta Description: ${page.metaDescription ?? "(none)"}`,
      ];
      if (page.headings.length > 0) {
        lines.push(`Headings: ${page.headings.join(" | ")}`);
      }
      if (page.aboutSectionSnippets.length > 0) {
        lines.push(
          `About / Brand Positioning:\n- ${page.aboutSectionSnippets.join("\n- ")}`
        );
      }
      if (page.productSectionSnippets.length > 0) {
        lines.push(
          `Products / Services:\n- ${page.productSectionSnippets.join("\n- ")}`
        );
      }
      if (page.mainText) {
        lines.push(
          `Visible Page Text Excerpt:\n${page.mainText.slice(0, 2000)}`
        );
      }
      return lines.join("\n");
    });

    return {
      status: {
        sourceType: "website",
        requestedUrl: rawWebsiteUrl,
        normalizedUrl: homeFetch.finalUrl,
        status: "success",
        extractedTitle: homeSignals.title,
        visitedUrls,
        warning: null,
      },
      pages,
      combinedSummaryText: summaryBlocks.join("\n\n---\n\n"),
    };
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      throw err;
    }

    const reason =
      err instanceof Error
        ? err.message
        : "Unknown network or extraction error";

    return {
      status: {
        sourceType: "website",
        requestedUrl: rawWebsiteUrl,
        normalizedUrl,
        status: "inaccessible",
        extractedTitle: null,
        visitedUrls: [],
        warning: `Website could not be accessed (${reason}). Continuing with fallback sources if available.`,
      },
      pages: [],
      combinedSummaryText: null,
    };
  }
}

/**
 * Best-effort public extraction for a Facebook Page URL.
 * Does not assume arbitrary Facebook Page content can be scraped without authentication.
 * If Facebook blocks the request or returns a login wall, reports the limitation and continues gracefully.
 */
export async function extractFacebookPageContent(
  rawFacebookUrl: string | null | undefined,
  options: ExtractorOptions = {}
): Promise<FacebookExtractionResult> {
  if (!rawFacebookUrl || rawFacebookUrl.trim().length === 0) {
    return {
      status: {
        sourceType: "facebook",
        requestedUrl: null,
        normalizedUrl: null,
        status: "skipped",
        extractedTitle: null,
        visitedUrls: [],
        warning: null,
      },
      pageTitle: null,
      pageDescription: null,
      combinedSummaryText: null,
    };
  }

  // Validate SSRF first
  const normalizedUrlObj = validateAndNormalizePublicUrl(rawFacebookUrl);
  const host = normalizedUrlObj.hostname.toLowerCase();

  if (
    host !== "facebook.com" &&
    !host.endsWith(".facebook.com") &&
    host !== "fb.com" &&
    !host.endsWith(".fb.com")
  ) {
    throw new UnsafeUrlError(
      "INVALID_URL",
      `Facebook Page URL must belong to facebook.com or fb.com (received "${host}").`
    );
  }

  const normalizedUrl = normalizedUrlObj.toString();

  try {
    const fbFetch = await fetchSafeHtmlPage(normalizedUrl, {
      ...options,
      maxSameOriginSubpages: 0,
    });
    const signals = parseHtmlBrandSignals(fbFetch.html, fbFetch.finalUrl);

    const isLoginWallTitle =
      !signals.title ||
      GENERIC_FB_WALL_PATTERNS.some((pattern) =>
        pattern.test(signals.title ?? "")
      );

    const hasUsefulMetadata =
      !isLoginWallTitle &&
      Boolean(
        (signals.metaDescription && signals.metaDescription.length > 15) ||
        signals.mainText.length > 80
      );

    if (!hasUsefulMetadata) {
      return {
        status: {
          sourceType: "facebook",
          requestedUrl: rawFacebookUrl,
          normalizedUrl: fbFetch.finalUrl,
          status: "restricted",
          extractedTitle: isLoginWallTitle ? null : signals.title,
          visitedUrls: [fbFetch.finalUrl],
          warning:
            "Facebook Page public content is restricted by login/authentication walls. Continuing analysis using website or manual brand description.",
        },
        pageTitle: null,
        pageDescription: null,
        combinedSummaryText: null,
      };
    }

    const summary = [
      `[Facebook Public Metadata] URL: ${fbFetch.finalUrl}`,
      `Page Name / Title: ${signals.title ?? "(none)"}`,
      `Public Description: ${signals.metaDescription ?? "(none)"}`,
    ].join("\n");

    return {
      status: {
        sourceType: "facebook",
        requestedUrl: rawFacebookUrl,
        normalizedUrl: fbFetch.finalUrl,
        status: "success",
        extractedTitle: signals.title,
        visitedUrls: [fbFetch.finalUrl],
        warning:
          "Only public Facebook OpenGraph metadata was extracted; post feed and audience insights require authenticated Graph API access.",
      },
      pageTitle: signals.title,
      pageDescription: signals.metaDescription,
      combinedSummaryText: summary,
    };
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      throw err;
    }

    const reason =
      err instanceof Error ? err.message : "Facebook request blocked";

    return {
      status: {
        sourceType: "facebook",
        requestedUrl: rawFacebookUrl,
        normalizedUrl,
        status: "restricted",
        extractedTitle: null,
        visitedUrls: [],
        warning: `Facebook Page content could not be accessed (${reason}). Facebook restricts unauthenticated scraping; continuing with website or manual brand information.`,
      },
      pageTitle: null,
      pageDescription: null,
      combinedSummaryText: null,
    };
  }
}
