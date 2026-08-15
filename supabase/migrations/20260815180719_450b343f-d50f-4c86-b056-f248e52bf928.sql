CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.company_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  company_name text NOT NULL,
  owner_name text NOT NULL DEFAULT '',
  category_name text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  mission text NOT NULL DEFAULT '',
  positioning text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  ad_themes text[] NOT NULL DEFAULT '{}',
  content text NOT NULL,
  embedding extensions.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_knowledge TO authenticated;
GRANT ALL ON public.company_knowledge TO service_role;

ALTER TABLE public.company_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_read_signed_in ON public.company_knowledge
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_knowledge.company_id AND c.status = 'published'
    )
  );

CREATE POLICY knowledge_write_own ON public.company_knowledge
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER company_knowledge_set_updated_at
  BEFORE UPDATE ON public.company_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX company_knowledge_embedding_idx
  ON public.company_knowledge
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX company_knowledge_content_idx
  ON public.company_knowledge
  USING gin (to_tsvector('english', content));

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
SECURITY DEFINER
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