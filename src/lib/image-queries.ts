/**
 * Instagram hashtag search terms per consumer category. Each category pulls a
 * mix of product, lifestyle and ad-style imagery so the ImageBase has usable
 * still assets for every brand we serve.
 */
export const IMAGE_QUERIES: Record<string, string[]> = {
  "apparel-accessories": [
    "outfitinspo",
    "streetwearstyle",
    "fashionflatlay",
    "sneakerphotography",
    "accessorieslover",
    "capsulewardrobe",
  ],
  "baby-kids": [
    "babyproducts",
    "nurserydecor",
    "toddlerstyle",
    "babyessentials",
    "kidsfashion",
    "montessoritoys",
  ],
  "beauty-personal-care": [
    "skincareroutine",
    "makeupflatlay",
    "cleanbeauty",
    "hairtok",
    "perfumecollection",
    "skincareshelfie",
  ],
  "electronics-gadgets": [
    "techflatlay",
    "gadgetlover",
    "desksetup",
    "everydaycarry",
    "audiophilelife",
    "smarthometech",
  ],
  "fitness-wellness": [
    "fitnessmotivation",
    "wellnessroutine",
    "proteinshake",
    "gymgear",
    "pilatesgirlies",
    "supplementstack",
  ],
  "food-beverage": [
    "foodphotography",
    "foodstyling",
    "coffeelover",
    "snackattack",
    "matchalatte",
    "healthysnacks",
  ],
  "home-living": [
    "homedecorinspo",
    "kitchenware",
    "interiorstyling",
    "candlelover",
    "organizedhome",
    "tablescape",
  ],
  pets: [
    "dogsofinstagram",
    "petproducts",
    "catsofinstagram",
    "dogtreats",
    "petaccessories",
    "puppylife",
  ],
};

/** Hard cap on total ingested image payloads. */
export const IMAGE_MAX_ITEMS = 2000;
