CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (true);

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  mission TEXT NOT NULL DEFAULT '',
  website TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT companies_status_check CHECK (status IN ('draft', 'published'))
);
CREATE UNIQUE INDEX companies_name_unique_idx ON public.companies (lower(btrim(name)));
CREATE INDEX companies_owner_idx ON public.companies (owner_id);
CREATE INDEX companies_category_idx ON public.companies (category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT ON public.companies TO anon;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_public_read_published" ON public.companies FOR SELECT USING (status = 'published');
CREATE POLICY "companies_read_own" ON public.companies FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "companies_insert_own" ON public.companies FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "companies_update_own" ON public.companies FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "companies_delete_own" ON public.companies FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE public.company_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  summary TEXT,
  positioning TEXT,
  tone TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  ad_themes TEXT[] NOT NULL DEFAULT '{}',
  brand_colors TEXT[] NOT NULL DEFAULT '{}',
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_insights_status_check CHECK (status IN ('queued', 'running', 'done', 'failed'))
);
CREATE INDEX company_insights_company_idx ON public.company_insights (company_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_insights TO authenticated;
GRANT SELECT ON public.company_insights TO anon;
GRANT ALL ON public.company_insights TO service_role;
ALTER TABLE public.company_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insights_public_read_published" ON public.company_insights FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.status = 'published')
);
CREATE POLICY "insights_owner_all" ON public.company_insights FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER company_insights_set_updated_at BEFORE UPDATE ON public.company_insights FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.categories (name, slug, description) VALUES
  ('Beauty & Personal Care', 'beauty-personal-care', 'Skincare, cosmetics, grooming and personal care brands.'),
  ('Food & Beverage', 'food-beverage', 'Snacks, drinks, pantry staples and specialty food brands.'),
  ('Apparel & Accessories', 'apparel-accessories', 'Clothing, footwear, bags and wearable accessories.'),
  ('Home & Living', 'home-living', 'Furniture, decor, kitchen and household essentials.'),
  ('Fitness & Wellness', 'fitness-wellness', 'Supplements, equipment and wellness products.'),
  ('Pets', 'pets', 'Pet food, toys, care and accessories.'),
  ('Baby & Kids', 'baby-kids', 'Products for babies, toddlers and children.'),
  ('Electronics & Gadgets', 'electronics-gadgets', 'Consumer electronics, smart devices and gadgets.');

CREATE POLICY "logos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "logos_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "logos_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "logos_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);