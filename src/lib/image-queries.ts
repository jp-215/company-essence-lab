/**
 * Instagram hashtag search terms per consumer category. Each category pulls a
 * mix of product, lifestyle and ad-style imagery so the ImageBase has usable
 * still assets for every brand we serve.
 */
export const IMAGE_QUERIES: Record<string, string[]> = {
  "apparel-accessories": ["outfitinspo", "streetwearstyle", "fashionflatlay"],
  "baby-kids": ["babyproducts", "nurserydecor", "toddlerstyle"],
  "beauty-personal-care": ["skincareroutine", "makeupflatlay", "cleanbeauty"],
  "electronics-gadgets": ["techflatlay", "gadgetlover", "desksetup"],
  "fitness-wellness": ["fitnessmotivation", "wellnessroutine", "proteinshake"],
  "food-beverage": ["foodphotography", "foodstyling", "coffeelover"],
  "home-living": ["homedecorinspo", "kitchenware", "interiorstyling"],
  pets: ["dogsofinstagram", "petproducts", "catsofinstagram"],
};

/** Hard cap on total ingested image payloads. */
export const IMAGE_MAX_ITEMS = 2000;
