# Community — swipe-up discovery feed

A new full-screen, TikTok-style feed where you flick up to move to the next card. Cards alternate between real TikTok video trends (auto-playing) and Reddit word-of-mouth posts, drawn from the datasets already ingested (~4.6k trends, ~1.2k chatter rows).

## Where it lives

- New page at `/community`.
- Sidebar link labeled **Community**, placed directly under Trending and Dashboard.

## The experience

```text
+-----------------------------------+
|  [category pill]   Vira Community |
|                                   |
|      auto-playing TikTok          |
|      (9:16, full height)          |
|                                   |
|  @author · 1.2M views · 8% eng    |
|  caption / hashtags               |
|  [ Remix this ]  [ Open original ]|
|                                   |
|         swipe up for next         |
+-----------------------------------+
```

- One card per screen, vertical scroll-snap; swipe up on mobile, scroll or arrow keys / space on desktop.
- Video cards: the TikTok embed mounts and plays only for the card in view, and unmounts when it leaves so nothing plays in the background. Cards not yet reached show the cached cover thumbnail.
- Reddit cards: subreddit, author, title, body excerpt, sentiment/topic tags, upvote and reply counts, link out to the thread.
- Every card has a **Remix this** action that carries the trend into Remix Studio.
- Feed mix alternates video and chatter so both datasets show up; a category chip row at the top switches the slice, defaulting to the signed-in brand's primary category (falls back to all categories when signed out).
- Progress dots on the right edge, plus a "you've reached the end" card with buttons back to Trending and Remix Studio.

## Data

Reuses the existing feeds — no new scraping, no schema changes:
- video trends via the existing trending feed, scoped by category
- word-of-mouth via the existing chatter feed, scoped by category
- for signed-in users, brand-matched semantic recommendations are pulled in first so the top of the feed is personalized

Pages in batches of ~30 and fetches the next batch as you approach the end of the current one.

## Technical notes

- `src/routes/community.tsx` — public route with `validateSearch` for `category`, loader priming a query that fetches trends + word of mouth in parallel (each with a `.catch` fallback so one flaky call can't blank the page), `head()` metadata, `errorComponent`, `notFoundComponent`.
- `src/components/SwipeFeed.tsx` — scroll-snap container plus `IntersectionObserver` to track the active index and gate embed mounting; keyboard handlers for ArrowUp/ArrowDown/Space.
- `src/components/feed/VideoCard.tsx` and `ChatterCard.tsx` — the two card types; the video card reuses the existing TikTok thumbnail proxy and embed URL logic from `TrendPreview`.
- Feed order built with the existing `interleave` helper, seeded with brand recommendations when a session exists.
- Sidebar entry added to `src/components/SiteSidebar.tsx` after Trending/Dashboard.
