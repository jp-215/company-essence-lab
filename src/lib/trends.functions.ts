import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchTrendingHashtags, fetchTrendingNow } from "./trends-feed.server";

export const listTrendingNow = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        categorySlug: z.string().max(80).optional(),
        hashtag: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(60).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => fetchTrendingNow(data));

export const listTrendingHashtags = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(30).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => fetchTrendingHashtags(data.limit ?? 18));
