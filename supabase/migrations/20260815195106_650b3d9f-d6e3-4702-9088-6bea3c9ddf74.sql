-- Remix chat: persisted conversation threads where the assistant suggests recommended
-- trends as chips and remixes are generated in-thread.

CREATE TABLE public.remix_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remix_chats TO authenticated;
GRANT ALL ON public.remix_chats TO service_role;
ALTER TABLE public.remix_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY remix_chats_owner_all ON public.remix_chats
FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE INDEX remix_chats_owner_idx ON public.remix_chats (owner_id, updated_at DESC);

CREATE TRIGGER remix_chats_set_updated_at BEFORE UPDATE ON public.remix_chats
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.remix_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.remix_chats(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  trend_suggestions jsonb,
  remix_id uuid REFERENCES public.company_remixes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remix_chat_messages TO authenticated;
GRANT ALL ON public.remix_chat_messages TO service_role;
ALTER TABLE public.remix_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY remix_chat_messages_owner_all ON public.remix_chat_messages
FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE INDEX remix_chat_messages_chat_idx ON public.remix_chat_messages (chat_id, created_at);
