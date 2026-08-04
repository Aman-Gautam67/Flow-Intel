import { NextRequest, NextResponse } from "next/server";

/**
 * Thin server-side proxy for fetching remote workflow JSONs
 * (GitHub raw, Gist raw, etc.) to avoid browser CORS restrictions.
 * Only allows https:// URLs from whitelisted hostnames.
 */

const ALLOWED_HOSTS = [
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
  "api.n8n.io",
  "cdn.n8n.io",
];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only https:// URLs allowed" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith("." + h))) {
    return NextResponse.json(
      { error: `Host not allowed. Permitted: ${ALLOWED_HOSTS.join(", ")}` },
      { status: 403 }
    );
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "FlowIntel-Analyzer/1.0" },
    // 10 s timeout
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
  }

  const text = await res.text();
  return new NextResponse(text, {
    headers: { "Content-Type": "application/json" },
  });
}
