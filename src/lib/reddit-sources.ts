/**
 * Balanced Reddit source map for Vira word-of-mouth ingestion.
 *
 * Every consumer category gets its own set of communities so the corpus is
 * evenly spread across the platform's categories instead of skewing to one
 * vertical (e.g. skincare). Listing URLs are far higher-yield than search.
 */
export type WomTopic = "advertising" | "trends" | "identity";

export const REDDIT_SUBREDDITS: Record<string, string[]> = {
  "apparel-accessories": [
    "femalefashionadvice",
    "malefashionadvice",
    "streetwear",
    "findfashion",
    "sneakers",
    "ThriftStoreHauls",
  ],
  "baby-kids": [
    "beyondthebump",
    "NewParents",
    "toddlers",
    "Mommit",
    "daddit",
    "BabyBumps",
  ],
  "beauty-personal-care": [
    "SkincareAddiction",
    "MakeupAddiction",
    "AsianBeauty",
    "HaircareScience",
    "Indiemakeupandmore",
    "fragrance",
  ],
  "electronics-gadgets": [
    "gadgets",
    "BuyItForLife",
    "headphones",
    "smarthome",
    "techsupportgore",
    "apple",
  ],
  "fitness-wellness": [
    "Supplements",
    "fitness",
    "running",
    "HomeGym",
    "nutrition",
    "yoga",
  ],
  "food-beverage": [
    "snackexchange",
    "Coffee",
    "energydrinks",
    "food",
    "tea",
    "MealPrepSunday",
  ],
  "home-living": [
    "HomeDecorating",
    "malelivingspace",
    "CleaningTips",
    "Cooking",
    "furniture",
    "InteriorDesign",
  ],
  "pets-pet-care": [
    "dogs",
    "cats",
    "puppy101",
    "DogAdvice",
    "petfree",
    "AskVet",
  ],
};

/** Communities where the conversation is explicitly about ads and marketing. */
export const REDDIT_AD_SUBREDDITS = [
  "advertising",
  "marketing",
  "DigitalMarketing",
  "FacebookAds",
  "PPC",
  "branding",
];

export const REDDIT_TIMEFRAMES = ["month", "year"] as const;

export function listingUrl(subreddit: string, timeframe: string): string {
  return `https://www.reddit.com/r/${subreddit}/top/?t=${timeframe}`;
}

/** Rough topic label from the community it came from. */
export function topicForSubreddit(subreddit: string): WomTopic {
  if (REDDIT_AD_SUBREDDITS.includes(subreddit)) return "advertising";
  if (/fashionadvice|streetwear|BuyItForLife|branding|fragrance/i.test(subreddit)) return "identity";
  return "trends";
}
