# GTM Hackathons — Company Identity Marketplace

A marketplace where consumer-product companies sign up, build a brand identity profile, and get enriched with data scraped from the web to power recommendations.

## What gets built

### 1. Onboarding (auth)
- `/auth` — single page with Sign In / Sign Up tabs.
- Sign in: email + password for existing companies.
- Sign up: email + password with email validation, then the profile wizard.
- Signed-in users land on `/dashboard`; unauthenticated users hitting protected pages go to `/auth`.

### 2. Company sign-up wizard
Multi-step form collecting exactly:
- Logo (image upload)
- Company name (must be unique — one company per name)
- Owner (the signed-in user is the owner; display name captured)
- Category (pick from a seeded consumer-products list)
- Bio (free text — who they are)
- Mission (free text)

A company cannot be published until all fields are filled. One owner can create multiple companies; each company has exactly one owner.

### 3. Marketplace
- `/` — landing + browse: company cards with logo, name, category, short bio.
- `/companies/$slug` — public company profile: logo, name, category, bio, mission, and enrichment insights.
- `/categories/$slug` — companies filtered by category.

### 4. Dashboard
- `/dashboard` — the owner's companies, create-new, edit, and enrichment status per company.

### 5. Web enrichment (scraping)
On company creation (and via a "Refresh insights" button), a background job:
- Searches the web for the company's brand, ads, and press mentions.
- Scrapes the company site for branding signals (colors, fonts, logo, ad copy, positioning).
- Stores raw results plus a structured summary (keywords, tone, positioning, ad themes) used later by the recommendation engine.
- Shows status: queued / running / done / failed, with results rendered on the company profile.

## Data model

- `categories` — seeded consumer-product categories (Beauty & Personal Care, Food & Beverage, Apparel & Accessories, Home & Living, Fitness & Wellness, Pets, Baby & Kids, Electronics & Gadgets).
- `profiles` — one per auth user: display name, avatar. Owner identity.
- `companies` — owner_id (one owner, many companies), category_id, unique name + slug, logo_url, bio, mission, website, status.
- `company_insights` — one row per enrichment run: company_id, source type, status, raw payload, extracted summary/keywords/brand colors, timestamps.
- Storage bucket `logos` for logo uploads.

Access rules: anyone can read published companies, categories, and insights. Only the owner can create/edit/delete their own companies and trigger enrichment.

## Technical notes

- Lovable Cloud provides the database, auth, storage, and server runtime.
- Auth: email + password with confirmation; profile row auto-created on signup via trigger.
- Scraping: implemented with the Firecrawl connector (search + scrape with the `branding` and structured-JSON formats), called from server functions — never from the browser. Apify is not available as a built-in connector here; Firecrawl covers ad/brand/web scraping for this scope. If Apify specifically is required later, it can be added as a custom API key integration.
- Enrichment runs in a server function writing into `company_insights`; the UI polls status. Failures are stored and surfaced, never silent.
- Uniqueness enforced by a unique index on normalized company name and slug.
- Traditional, clean interface: neutral surface, one accent color, card grid, no heavy theming for now.

## Build order

1. Enable Lovable Cloud; create schema, policies, seeds, storage bucket.
2. Auth page + protected layout + profile trigger.
3. Company sign-up wizard with logo upload and uniqueness validation.
4. Dashboard (list / create / edit).
5. Marketplace landing, category pages, company profile.
6. Connect Firecrawl; enrichment server functions + insights UI.
