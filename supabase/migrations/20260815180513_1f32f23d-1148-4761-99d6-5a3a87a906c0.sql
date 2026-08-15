DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
CREATE POLICY profiles_read_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);