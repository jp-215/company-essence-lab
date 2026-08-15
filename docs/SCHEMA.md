# Vira — Database Schema Reference

Vira maps a company to the categories it serves, and categories to a library of
viral ad **prescripts**, so any brand can be handed formats that already work in
its market and remix them into its own voice.

```text
auth.users ──1:1── profiles
     │
     └──1:N── companies ──N:1── categories ──N:M── prescripts
                 │                (category_prescripts)      │
                 ├──1:1── company_insights                   │
                 ├──1:1── company_knowledge (vector)         │
                 └──1:N── company_remixes ───────────────────┘
```

## Core rules

- One category has many companies.
- A company name/slug is globally unique — only one company per identity.
- An owner (auth user) can have many companies; a company has exactly one owner.
- Category ↔ prescript mapping is the join key `prescript_key` (`VIRA-PS-001` …).

---

## Tables

### `profiles`
Per-user display record, auto-created by the `handle_new_user` trigger on
`auth.users` insert.

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | FK → `auth.users.id` |
| `display_name` | text | defaults to email local-part |
| `avatar_url` | text | nullable |
| `created_at` / `updated_at` | timestamptz | |

RLS: private. Owner-only select/insert/update. No delete, no anon read.

---

### `categories`
Fixed, seeded list of consumer-product verticals. Read-only to the app.

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `name` | text | |
| `slug` | text | unique, used in `/categories/$slug` |
| `description` | text | |

RLS: public read. No writes from the app (seed via migration).

---

### `companies`
The brand identity record — the payload from the signup wizard.

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `owner_id` | uuid | FK → `auth.users.id` |
| `category_id` | uuid | FK → `categories.id` |
| `name` | text | unique |
| `slug` | text | unique, used in `/companies/$slug` |
| `owner_name` | text | who runs the company |
| `logo_url` | text | object path in the private `logos` bucket |
| `bio` | text | free-text "who we are" |
| `mission` | text | |
| `website` | text | enrichment source |
| `status` | text | `published` \| draft-ish values |
| `created_at` / `updated_at` | timestamptz | `updated_at` trigger |

RLS: anon read only when `status = 'published'`; owners get full CRUD on their
own rows.

Logos live in the private `logos` bucket under `<user_id>/…`; public pages get
short-lived signed URLs. Storage policies allow reads only for published
companies, plus owners reading their own folder.

---

### `company_insights`
Output of the scrape + AI enrichment pass. One row per company.

| column | type | notes |
| --- | --- | --- |
| `company_id` | uuid | FK → `companies.id` |
| `status` | text | `queued` \| `running` \| `ready` \| `error` |
| `error` | text | |
| `summary`, `positioning`, `tone` | text | AI-derived |
| `keywords`, `ad_themes`, `brand_colors` | text[] | |
| `sources` | jsonb | array of scraped URLs/metadata |
| `raw` | jsonb | unprocessed model/scrape payload |

RLS: owner full access; anon read when the parent company is published.

---

### `company_knowledge`
Flattened brand knowledge base + embedding for semantic "find similar brands".

| column | type | notes |
| --- | --- | --- |
| `company_id`, `owner_id` | uuid | |
| `company_name`, `owner_name`, `category_name` | text | denormalised for search |
| `bio`, `mission`, `positioning`, `tone`, `summary` | text | |
| `keywords`, `ad_themes` | text[] | |
| `content` | text | concatenated text that was embedded |
| `embedding` | vector(1536) | HNSW cosine index |

RLS: signed-in only — own rows, or rows of published companies.
Queried through `match_company_knowledge(query_embedding, match_count, exclude_company)`.

---

### `prescripts`
The trend library: general-purpose viral ad templates, one row per format.

| column | type | notes |
| --- | --- | --- |
| `prescript_key` | text | **primary identifier key**, unique (`VIRA-PS-001`) |
| `title` | text | |
| `platform` | text | TikTok / Instagram / YouTube / Facebook |
| `format` | text | e.g. UGC testimonial, unboxing, POV |
| `angle` | text | persuasion angle |
| `hook` | text | first 3 seconds |
| `rationale` | text | why it performs |
| `script` | text | timestamped beats |
| `cta` | text | |
| `trend_score` | numeric | ranking signal, higher = hotter |

RLS: public read, no app writes. Ingest happens through migrations or a
key-guarded server route — scraped trends land here.

---

### `category_prescripts`
The mapping protocol: which prescripts fit which vertical.

| column | type | notes |
| --- | --- | --- |
| `category_id` | uuid | FK → `categories.id` |
| `prescript_key` | text | FK → `prescripts.prescript_key` |
| `relevance_rank` | integer | 1 = best fit |

RLS: public read. Every category keeps a healthy set of mapped formats.

Resolve a company straight to its ranked formats with:

```sql
select * from public.company_prescripts('<company_uuid>', 24);
```

---

### `company_remixes`
A prescript rewritten in one brand's voice — the deliverable of Remix studio.

| column | type | notes |
| --- | --- | --- |
| `company_id` | uuid | FK → `companies.id` |
| `owner_id` | uuid | FK owner |
| `prescript_key` | text | FK → `prescripts.prescript_key` |
| `platform`, `hook`, `script`, `caption` | text | |
| `hashtags` | text[] | |
| `differentiator` | text | why this sets the brand apart |

RLS: owner-only, all operations. Never public.

---

## Functions

| function | purpose |
| --- | --- |
| `company_prescripts(_company_id, _limit)` | company → category → ranked prescripts |
| `match_company_knowledge(query_embedding, match_count, exclude_company)` | vector similarity over the knowledge base |
| `handle_new_user()` | trigger: create a profile on signup |
| `set_updated_at()` | trigger: maintain `updated_at` |

## Conventions

- Every public-schema table has explicit `GRANT`s plus RLS; no table relies on
  default privileges.
- `anon` reads are limited to `categories`, `prescripts`, `category_prescripts`,
  published `companies`, and their insights.
- Anything owner-scoped is keyed on `auth.uid()`.
