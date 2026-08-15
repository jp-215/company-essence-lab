/**
 * X/Twitter search terms used to pre-scrape word-of-mouth chatter per consumer
 * category. Each entry is tagged with the kind of signal it surfaces so the
 * ingest can label rows (`topic`) for downstream video generation.
 */
export type WomTopic = "advertising" | "trends" | "identity";

export const WOM_QUERIES: Record<string, Array<{ query: string; topic: WomTopic }>> = {
  "apparel-accessories": [
    { query: "clothing brand ad -filter:replies", topic: "advertising" },
    { query: "outfit trend everyone is wearing", topic: "trends" },
    { query: "why I love this clothing brand", topic: "identity" },
  ],
  "baby-kids": [
    { query: "baby brand commercial", topic: "advertising" },
    { query: "viral baby product", topic: "trends" },
    { query: "best baby brand recommendation", topic: "identity" },
  ],
  "beauty-personal-care": [
    { query: "skincare ad campaign", topic: "advertising" },
    { query: "viral skincare product everyone", topic: "trends" },
    { query: "favorite beauty brand because", topic: "identity" },
  ],
  "electronics-gadgets": [
    { query: "tech ad campaign", topic: "advertising" },
    { query: "gadget everyone is buying", topic: "trends" },
    { query: "why I trust this tech brand", topic: "identity" },
  ],
  "fitness-wellness": [
    { query: "supplement brand ad", topic: "advertising" },
    { query: "fitness product trending", topic: "trends" },
    { query: "wellness brand I recommend", topic: "identity" },
  ],
  "food-beverage": [
    { query: "snack brand ad", topic: "advertising" },
    { query: "drink everyone is talking about", topic: "trends" },
    { query: "favorite food brand because", topic: "identity" },
  ],
  "home-living": [
    { query: "home brand ad campaign", topic: "advertising" },
    { query: "kitchen gadget viral", topic: "trends" },
    { query: "home brand worth the money", topic: "identity" },
  ],
  pets: [
    { query: "pet brand ad", topic: "advertising" },
    { query: "dog product trending", topic: "trends" },
    { query: "pet brand I recommend", topic: "identity" },
  ],
};

/** Hard cap on total ingested payloads. */
export const WOM_MAX_ITEMS = 3000;
