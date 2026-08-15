import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchWordOfMouth } from "./wom-feed.server";

export const listWordOfMouth = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        categorySlug: z.string().max(80).optional(),
        hashtag: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(60).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => fetchWordOfMouth(data));
