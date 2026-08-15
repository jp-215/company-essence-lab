REVOKE ALL ON FUNCTION public.match_company_knowledge(extensions.vector, int, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.match_company_knowledge(
  query_embedding extensions.vector(1536),
  match_count int DEFAULT 5,
  exclude_company uuid DEFAULT NULL
)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  slug text,
  category_name text,
  summary text,
  positioning text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT k.company_id,
         k.company_name,
         c.slug,
         k.category_name,
         k.summary,
         k.positioning,
         1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.company_knowledge k
  JOIN public.companies c ON c.id = k.company_id
  WHERE k.embedding IS NOT NULL
    AND c.status = 'published'
    AND (exclude_company IS NULL OR k.company_id <> exclude_company)
  ORDER BY k.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20)
$$;

GRANT EXECUTE ON FUNCTION public.match_company_knowledge(extensions.vector, int, uuid) TO authenticated, service_role;