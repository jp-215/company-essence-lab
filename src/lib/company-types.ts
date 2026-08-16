export type CategoryDTO = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

export type CompanyCardDTO = {
  id: string;
  name: string;
  slug: string;
  bio: string;
  mission: string;
  ownerName: string;
  categoryName: string;
  categorySlug: string;
  logoUrl: string | null;
  website: string | null;
};

export type CompanyDetailDTO = CompanyCardDTO & {
  createdAt: string;
};

export type InsightDTO = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  summary: string | null;
  positioning: string | null;
  tone: string | null;
  keywords: string[];
  adThemes: string[];
  brandColors: string[];
  sources: { title: string; url: string }[];
  updatedAt: string;
};

export type OwnerCompanyDTO = {
  id: string;
  name: string;
  slug: string;
  bio: string;
  mission: string;
  website: string | null;
  ownerName: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  logoPath: string | null;
  logoUrl: string | null;
  status: "draft" | "published";
  insightStatus: InsightDTO["status"] | null;
};

export const LOGO_BUCKET = "logos";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
