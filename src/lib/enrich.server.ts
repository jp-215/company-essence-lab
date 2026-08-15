export type SiteSnapshot = {
  url: string;
  title: string;
  description: string;
  text: string;
  colors: string[];
  links: { title: string; url: string }[];
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function topColors(html: string): string[] {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = `#${match[1]!.toLowerCase()}`;
    if (["#ffffff", "#000000", "#fefefe", "#010101"].includes(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hex]) => hex);
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function scrapeSite(rawUrl: string): Promise<SiteSnapshot> {
  const url = normalizeUrl(rawUrl);
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; ViraBot/1.0; +https://vira.app)",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`The website responded with status ${response.status}.`);
  }

  const html = await response.text();
  const text = stripTags(html).slice(0, 12000);

  const links: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a[^>]+href="([^"#?]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = match[1]!;
    if (!/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const label = stripTags(match[2] ?? "").slice(0, 80);
    if (!label) continue;
    links.push({ title: label, url: href });
    if (links.length >= 8) break;
  }

  return {
    url,
    title:
      metaContent(html, /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
      metaContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description:
      metaContent(html, /<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
      metaContent(html, /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i),
    text,
    colors: topColors(html),
    links,
  };
}

export type Analysis = {
  summary: string;
  positioning: string;
  tone: string;
  keywords: string[];
  adThemes: string[];
};

const SYSTEM_PROMPT = `You analyse consumer-product brands for a go-to-market marketplace.
Given scraped website content plus the brand's own bio and mission, return ONLY JSON:
{"summary": string (2-3 sentences), "positioning": string (1 sentence), "tone": string (3-6 words),
"keywords": string[] (6-10 short phrases), "adThemes": string[] (3-6 advertising angles the brand leans on)}
Be concrete and grounded in the provided text. Never invent facts you cannot support.`;

export async function analyzeBrand(payload: {
  name: string;
  bio: string;
  mission: string;
  category: string;
  site: SiteSnapshot | null;
}): Promise<Analysis> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const userContent = [
    `Company: ${payload.name}`,
    `Category: ${payload.category}`,
    `Bio: ${payload.bio}`,
    `Mission: ${payload.mission}`,
    payload.site ? `Website: ${payload.site.url}` : "Website: (none provided)",
    payload.site ? `Page title: ${payload.site.title}` : "",
    payload.site ? `Meta description: ${payload.site.description}` : "",
    payload.site ? `Scraped copy: ${payload.site.text}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`AI gateway failed [${response.status}]: ${body}`);
    throw new Error(`Brand analysis failed [${response.status}].`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const jsonText = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Brand analysis returned an unreadable result.");

  const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Partial<Analysis>;
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    positioning: typeof parsed.positioning === "string" ? parsed.positioning : "",
    tone: typeof parsed.tone === "string" ? parsed.tone : "",
    keywords: list(parsed.keywords).slice(0, 12),
    adThemes: list(parsed.adThemes).slice(0, 8),
  };
}
