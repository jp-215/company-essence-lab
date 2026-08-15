import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  fetchCategories,
  fetchCategoryBySlug,
  fetchCompanies,
  fetchCompanyBySlug,
} from "./companies.server";

export const listCategories = createServerFn({ method: "GET" }).handler(async () =>
  fetchCategories(),
);

export const listCompanies = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        categorySlug: z.string().max(80).optional(),
        search: z.string().max(80).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => fetchCompanies(data));

export const getCompany = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => fetchCompanyBySlug(data.slug));

export const getCategoryPage = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const category = await fetchCategoryBySlug(data.slug);
    if (!category) return null;
    const companies = await fetchCompanies({ categorySlug: data.slug });
    return { category, companies };
  });
