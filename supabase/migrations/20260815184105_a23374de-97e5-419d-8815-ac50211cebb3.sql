DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;

CREATE POLICY "logos_read_published"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.logo_url = storage.objects.name
      AND c.status = 'published'
  )
);

CREATE POLICY "logos_read_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);