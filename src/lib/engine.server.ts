import type {
  EngineCompany,
  EngineEvent,
  EngineJob,
  EngineJobAccepted,
  EngineLane,
  EngineVideo,
} from "./engine-types";

const DEFAULT_BASE = "https://vira.ideaplaces.com";

function baseUrl(): string {
  return (process.env["VIRA_ENGINE_URL"] || DEFAULT_BASE).replace(/\/+$/, "");
}

async function engineFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const requestInit: RequestInit = { method: init?.method ?? "GET" };
  if (init?.body !== undefined) {
    requestInit.headers = { "Content-Type": "application/json" };
    requestInit.body = JSON.stringify(init.body);
  }
  const response = await fetch(`${baseUrl()}/v1${path}`, requestInit);

  const text = await response.text();
  if (!response.ok) {
    console.error(`vira-engine ${path} failed [${response.status}]: ${text}`);
    throw new Error(`Video engine request failed [${response.status}]: ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export function fetchLanes() {
  return engineFetch<EngineLane[]>("/lanes");
}

export function fetchEngineCompanies() {
  return engineFetch<EngineCompany[]>("/companies");
}

export function fetchCompanyVideos(slug: string) {
  return engineFetch<EngineVideo[]>(`/companies/${encodeURIComponent(slug)}/videos`);
}

export function requestVideo(input: {
  companySlug: string;
  product: string;
  lane: string;
  mode: "fast" | "agentic";
  /** Structured Creative Brief; ignored by engines that only read `product`. */
  brief?: unknown;
  briefId?: string | null;
}) {
  return engineFetch<EngineJobAccepted>("/videos", {
    method: "POST",
    body: {
      company_slug: input.companySlug,
      product: input.product,
      lane: input.lane,
      mode: input.mode,
      ...(input.brief === undefined ? {} : { brief: input.brief, brief_id: input.briefId ?? null }),
    },
  });
}

export function fetchJob(jobId: string) {
  return engineFetch<EngineJob>(`/jobs/${encodeURIComponent(jobId)}`);
}

export function fetchJobEvents(jobId: string) {
  return engineFetch<{ job_id: string; events: EngineEvent[] }>(
    `/jobs/${encodeURIComponent(jobId)}/events`,
  );
}

export function fetchVideo(videoId: string) {
  return engineFetch<EngineVideo>(`/videos/${encodeURIComponent(videoId)}`);
}

export function requestRegenerate(videoId: string, body: { notes: string[]; lane?: string | null }) {
  return engineFetch<EngineJobAccepted>(`/videos/${encodeURIComponent(videoId)}/regenerate`, {
    method: "POST",
    body: { notes: body.notes, lane: body.lane ?? null },
  });
}

/** Ensures the engine knows this brand before a render is requested. */
export async function ensureEngineCompany(company: {
  slug: string;
  name: string;
  category: string;
  bio: string;
  mission: string;
  website: string | null;
}) {
  const existing = await fetchEngineCompanies();
  if (existing.some((item) => item.slug === company.slug)) return;
  await engineFetch<EngineCompany>("/companies", {
    method: "POST",
    body: {
      slug: company.slug,
      name: company.name,
      category: company.category,
      bio: company.bio,
      mission: company.mission,
      website: company.website,
    },
  });
}
