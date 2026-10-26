import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {
  public readonly code:
    | "INVALID_URL"
    | "UNSUPPORTED_PROTOCOL"
    | "EMBEDDED_CREDENTIALS"
    | "BLOCKED_HOST"
    | "PRIVATE_IP"
    | "DNS_RESOLUTION_BLOCKED";

  constructor(
    code:
      | "INVALID_URL"
      | "UNSUPPORTED_PROTOCOL"
      | "EMBEDDED_CREDENTIALS"
      | "BLOCKED_HOST"
      | "PRIVATE_IP"
      | "DNS_RESOLUTION_BLOCKED",
    message: string
  ) {
    super(message);
    this.name = "UnsafeUrlError";
    this.code = code;
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".corp",
  ".home",
  ".lan",
];

/**
 * Checks whether an IPv4 address string belongs to a private, loopback, link-local,
 * metadata, or reserved range.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return true;
  }

  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b, c] = octets;

  // 0.0.0.0/8 (Current network / unspecified)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared Address Space / Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private network)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved / Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address string belongs to loopback, link-local, unique-local,
 * unspecified, metadata, or IPv4-mapped private ranges.
 */
export function isPrivateOrReservedIPv6(rawIp: string): boolean {
  const normalized = rawIp
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .trim()
    .toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:0" ||
    normalized === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

  // Unique Local (fc00::/7 -> fc00..fdff) including AWS IPv6 metadata fd00:ec2::254
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // Link-local (fe80::/10 -> fe8, fe9, fea, feb)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith("ff")) {
    return true;
  }

  // IPv4-mapped IPv6 in dotted form (e.g., ::ffff:127.0.0.1)
  if (normalized.startsWith("::ffff:")) {
    const tail = normalized.slice("::ffff:".length);
    if (net.isIPv4(tail)) {
      return isPrivateOrReservedIPv4(tail);
    }
    // Hex form supplied by WHATWG URL parser (e.g., ::ffff:7f00:1 or ::ffff:a9fe:a9fe)
    const hexParts = tail.split(":");
    if (hexParts.length === 2) {
      const high = Number.parseInt(hexParts[0], 16);
      const low = Number.parseInt(hexParts[1], 16);
      if (Number.isFinite(high) && Number.isFinite(low)) {
        const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
        return isPrivateOrReservedIPv4(ipv4);
      }
    }
    return true;
  }

  return false;
}

/**
 * Checks whether any IP literal (v4 or v6) is private, loopback, link-local, or reserved.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, "").trim();
  const version = net.isIP(clean);
  if (version === 4) {
    return isPrivateOrReservedIPv4(clean);
  }
  if (version === 6) {
    return isPrivateOrReservedIPv6(clean);
  }
  return false;
}

/**
 * Validates and normalizes an external URL string against SSRF rules.
 *
 * Blocks:
 * - Non-HTTP(S) protocols (`file:`, `javascript:`, `ftp:`, `data:`, etc.)
 * - Embedded credentials (`user:pass@host`)
 * - Localhost, internal domain suffixes (`.local`, `.internal`, etc.), and cloud metadata hosts
 * - Private, loopback, link-local, and reserved IPv4/IPv6 addresses
 */
export function validateAndNormalizePublicUrl(rawInput: string): URL {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new UnsafeUrlError("INVALID_URL", "URL must not be empty.");
  }

  // Automatically prepend https:// only if user omitted scheme and did not specify another scheme
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new UnsafeUrlError(
      "INVALID_URL",
      `Invalid URL format: "${rawInput}"`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError(
      "UNSUPPORTED_PROTOCOL",
      `Unsupported URL protocol "${parsed.protocol}". Only http: and https: are allowed.`
    );
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError(
      "EMBEDDED_CREDENTIALS",
      "URLs containing embedded credentials are not allowed."
    );
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) {
    throw new UnsafeUrlError(
      "INVALID_URL",
      "URL must contain a valid hostname."
    );
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new UnsafeUrlError(
      "BLOCKED_HOST",
      `Access to internal or local hostname "${hostname}" is blocked for security (SSRF protection).`
    );
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new UnsafeUrlError(
        "PRIVATE_IP",
        `Access to private, loopback, or metadata IP address "${hostname}" is blocked for security (SSRF protection).`
      );
    }
  } else if (!hostname.includes(".")) {
    // Reject single-label hostnames (e.g., http://intranet or http://db)
    throw new UnsafeUrlError(
      "BLOCKED_HOST",
      `Single-label or internal hostname "${hostname}" is not permitted.`
    );
  }

  // Strip URL fragments
  parsed.hash = "";
  return parsed;
}

export type DnsLookupFn = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  return dns.lookup(hostname, { all: true, verbatim: true });
};

/**
 * Resolves DNS for a public hostname and ensures none of its resolved IP addresses
 * point to loopback, private, link-local, or cloud metadata networks.
 */
export async function assertHostnameResolvesToPublicIp(
  hostname: string,
  lookupFn: DnsLookupFn = defaultDnsLookup
): Promise<void> {
  const cleanHost = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(cleanHost) !== 0) {
    if (isPrivateOrReservedIp(cleanHost)) {
      throw new UnsafeUrlError(
        "PRIVATE_IP",
        `Resolved IP "${cleanHost}" is in a private or reserved range.`
      );
    }
    return;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookupFn(cleanHost);
  } catch (err) {
    throw new UnsafeUrlError(
      "DNS_RESOLUTION_BLOCKED",
      `Could not resolve hostname "${cleanHost}": ${err instanceof Error ? err.message : "DNS lookup failed"}`
    );
  }

  if (!records || records.length === 0) {
    throw new UnsafeUrlError(
      "DNS_RESOLUTION_BLOCKED",
      `Hostname "${cleanHost}" did not resolve to any IP address.`
    );
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new UnsafeUrlError(
        "PRIVATE_IP",
        `Hostname "${cleanHost}" resolved to a blocked private/internal IP address ("${record.address}").`
      );
    }
  }
}
