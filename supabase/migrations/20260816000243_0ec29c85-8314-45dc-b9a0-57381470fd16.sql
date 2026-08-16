create table if not exists public.image_ocr (
  image_key text primary key references public.image_assets(image_key) on delete cascade,
  provider text not null default 'google-vision',
  status text not null default 'pending' check (status in ('pending', 'done', 'empty', 'failed')),
  ocr_text text not null default '',
  word_count integer not null default 0,
  languages text[] not null default '{}',
  confidence numeric not null default 0,
  blocks jsonb not null default '[]'::jsonb,
  error text,
  attempts integer not null default 0,
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.image_ocr to anon;
grant select on public.image_ocr to authenticated;
grant all on public.image_ocr to service_role;

alter table public.image_ocr enable row level security;

drop policy if exists "OCR text is publicly readable" on public.image_ocr;
create policy "OCR text is publicly readable"
on public.image_ocr
for select
to anon, authenticated
using (true);

create index if not exists image_ocr_status_idx on public.image_ocr (status);
create index if not exists image_ocr_text_search_idx
  on public.image_ocr using gin (to_tsvector('english', ocr_text));

create or replace function public.images_needing_ocr(_limit integer default 50, _max_attempts integer default 3)
returns table (image_key text, image_url text)
language sql
stable
security definer
set search_path = public
as $$
  select a.image_key, a.image_url
  from public.image_assets a
  left join public.image_ocr o on o.image_key = a.image_key
  where a.image_url <> ''
    and (o.image_key is null or (o.status = 'failed' and o.attempts < _max_attempts))
  order by a.buzz_score desc
  limit greatest(1, least(_limit, 200));
$$;

revoke all on function public.images_needing_ocr(integer, integer) from public;
grant execute on function public.images_needing_ocr(integer, integer) to service_role;

create or replace function public.image_ocr_coverage()
returns table (total_images bigint, scanned bigint, with_text bigint, failed bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.image_assets),
    (select count(*) from public.image_ocr where status in ('done', 'empty')),
    (select count(*) from public.image_ocr where status = 'done'),
    (select count(*) from public.image_ocr where status = 'failed');
$$;

grant execute on function public.image_ocr_coverage() to anon, authenticated, service_role;