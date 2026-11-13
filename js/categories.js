// What counts as a "spot", and how each kind is named, colored and drawn.

// A name reduced to its letters and digits, for spotting the same business listed twice.
export function nameKey(name) {
  const raw = String(name || "").trim().toLowerCase();
  const key = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9À-￿]+/g, "");
  return key || raw;
}

/* ---- Visual groups: one awning color and one glyph each ---- */

const dot = (cx, cy, r) =>
  `M${cx + r} ${cy}a${r} ${r} 0 1 1-${2 * r} 0 ${r} ${r} 0 0 1 ${2 * r} 0z`;

export const GROUPS = {
  eat: {
    color: "#E5482D",
    icon: "M6 3v5a3 3 0 0 0 6 0V3M9 3v5M9 11v10M17 3c-1.7 1.5-2.5 4-2.5 7.5V13H17M17 3v18",
  },
  coffee: {
    color: "#A5622E",
    icon: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12.5 3v3",
  },
  sweets: {
    color: "#E64E91",
    icon: "M7.5 10.5a4.5 4.5 0 1 1 9 0M6.5 10.5h11M8.5 10.5L12 21l3.5-10.5",
  },
  bakery: {
    color: "#E64E91",
    icon: "M4.5 10.5A3.5 3.5 0 0 1 8 7h8a3.5 3.5 0 0 1 2 6.4V18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4.6a3.5 3.5 0 0 1-1.5-2.9zM10 7v3M14 7v3",
  },
  drinks: {
    color: "#7A4DDB",
    icon: "M5 4h14l-7 8zM12 12v8M8 20h8",
  },
  market: {
    color: "#1E9E62",
    icon: "M3.5 10h17l-1.8 9.2a1 1 0 0 1-1 .8H6.3a1 1 0 0 1-1-.8zM8 10a4 4 0 0 1 8 0M9.5 13.5v3M14.5 13.5v3",
  },
  style: {
    color: "#0D98A6",
    icon: "M12 8.5V7.4a2.2 2.2 0 1 0-2.2-2.2M12 8.5l8.6 6.6a1.6 1.6 0 0 1-1 2.9H4.4a1.6 1.6 0 0 1-1-2.9z",
  },
  books: {
    color: "#2C6FE3",
    icon: "M12 6.5c-2.2-1.6-5-2-8-1.5v13c3-.5 5.8-.1 8 1.5 2.2-1.6 5-2 8-1.5V5c-3-.5-5.8-.1-8 1.5zM12 6.5v13",
  },
  art: {
    color: "#2C6FE3",
    icon: `M12 3a9 9 0 1 0 0 18c1.4 0 2.2-1 1.7-2.2-.6-1.4.3-2.8 1.8-2.8H17a4 4 0 0 0 4-4c0-5-4-9-9-9z${dot(7.6, 11.5, 0.6)}${dot(10.2, 7.6, 0.6)}${dot(15, 7.8, 0.6)}`,
  },
  music: {
    color: "#2C6FE3",
    icon: `M9 18V5.5l10-2V16${dot(6.5, 18, 2.5)}${dot(16.5, 16, 2.5)}`,
  },
  play: {
    color: "#F08A1D",
    icon: `M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z${dot(8.5, 8.5, 0.6)}${dot(15.5, 8.5, 0.6)}${dot(12, 12, 0.6)}${dot(8.5, 15.5, 0.6)}${dot(15.5, 15.5, 0.6)}`,
  },
  active: {
    color: "#F08A1D",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3v18M5.7 5.7c3 3.2 3 9.4 0 12.6M18.3 5.7c-3 3.2-3 9.4 0 12.6",
  },
  plant: {
    color: "#5E9F2F",
    icon: "M8 15h8l-1 6H9zM12 15v-5M12 10c0-3-2.2-5-5.5-5 0 3 2.2 5 5.5 5zM12 12c0-2.6 2-4.5 5-4.5 0 2.6-2 4.5-5 4.5z",
  },
  home: {
    color: "#5E9F2F",
    icon: "M9 3h6l3 8H6zM12 11v10M8 21h8",
  },
  pet: {
    color: "#5E9F2F",
    icon: `M12 12.5c-2.4 0-4.5 2-4.5 4.2 0 1.4 1.1 2.3 2.5 2.3.8 0 1.3-.4 2-.4s1.2.4 2 .4c1.4 0 2.5-.9 2.5-2.3 0-2.2-2.1-4.2-4.5-4.2z${dot(6.5, 10.5, 1.3)}${dot(9.8, 6.8, 1.3)}${dot(14.2, 6.8, 1.3)}${dot(17.5, 10.5, 1.3)}`,
  },
  finds: {
    color: "#D99A00",
    icon: `M12.6 3H4.5A1.5 1.5 0 0 0 3 4.5v8.1a1.5 1.5 0 0 0 .4 1l7.7 7.8a1.5 1.5 0 0 0 2.2 0l8-8a1.5 1.5 0 0 0 0-2.2l-7.7-7.8a1.5 1.5 0 0 0-1-.4z${dot(7.5, 7.5, 0.6)}`,
  },
};

// Inline SVG markup for a group glyph. Built only from the constants above.
export function iconSvg(group) {
  const g = GROUPS[group] || GROUPS.finds;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${g.icon}"/></svg>`;
}

/* ---- Food and drink ---- */

export const FOOD_AMENITIES = ["restaurant", "cafe", "fast_food", "bar", "pub", "ice_cream", "biergarten"];

// Cuisines that read better as a noun ("Pizza place") than as "X restaurant".
const DISH = {
  pizza: "Pizza place",
  burger: "Burger spot",
  sushi: "Sushi bar",
  ramen: "Ramen shop",
  noodle: "Noodle house",
  noodles: "Noodle house",
  pho: "Pho restaurant",
  sandwich: "Sandwich shop",
  chicken: "Chicken spot",
  fried_chicken: "Fried chicken spot",
  wings: "Wing spot",
  seafood: "Seafood restaurant",
  steak_house: "Steakhouse",
  barbecue: "BBQ joint",
  bbq: "BBQ joint",
  tacos: "Taco spot",
  taco: "Taco spot",
  burrito: "Burrito spot",
  donut: "Donut shop",
  doughnut: "Donut shop",
  bagel: "Bagel shop",
  coffee_shop: "Coffee shop",
  bubble_tea: "Boba shop",
  juice: "Juice bar",
  smoothie: "Smoothie bar",
  ice_cream: "Ice cream shop",
  frozen_yogurt: "Frozen yogurt shop",
  dessert: "Dessert shop",
  cake: "Cake shop",
  breakfast: "Breakfast spot",
  brunch: "Brunch spot",
  poke: "Poke shop",
  hot_dog: "Hot dog stand",
  salad: "Salad spot",
  pasta: "Pasta restaurant",
  dumpling: "Dumpling house",
  dumplings: "Dumpling house",
  kebab: "Kebab shop",
  falafel: "Falafel shop",
  crepe: "Crêperie",
  diner: "Diner",
  deli: "Deli",
  fish_and_chips: "Fish and chips shop",
  pancake: "Pancake house",
  tapas: "Tapas bar",
  soup: "Soup spot",
  empanada: "Empanada shop",
};

// Cuisines that read as "X restaurant".
const STYLE = {
  mexican: "Mexican",
  chinese: "Chinese",
  japanese: "Japanese",
  korean: "Korean",
  thai: "Thai",
  vietnamese: "Vietnamese",
  indian: "Indian",
  italian: "Italian",
  american: "American",
  mediterranean: "Mediterranean",
  middle_eastern: "Middle Eastern",
  persian: "Persian",
  lebanese: "Lebanese",
  greek: "Greek",
  french: "French",
  spanish: "Spanish",
  peruvian: "Peruvian",
  salvadoran: "Salvadoran",
  guatemalan: "Guatemalan",
  cuban: "Cuban",
  brazilian: "Brazilian",
  argentinian: "Argentinian",
  colombian: "Colombian",
  caribbean: "Caribbean",
  jamaican: "Jamaican",
  ethiopian: "Ethiopian",
  filipino: "Filipino",
  indonesian: "Indonesian",
  malaysian: "Malaysian",
  hawaiian: "Hawaiian",
  armenian: "Armenian",
  turkish: "Turkish",
  german: "German",
  russian: "Russian",
  asian: "Asian",
  latin_american: "Latin American",
  "tex-mex": "Tex-Mex",
  cajun: "Cajun",
  southern: "Southern",
  soul: "Soul food",
  california: "Californian",
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  fusion: "Fusion",
};

function cuisines(raw) {
  return String(raw || "")
    .toLowerCase()
    .split(";")
    .map((s) => s.trim().replace(/\s+/g, "_"))
    .filter(Boolean);
}

function foodInfo(amenity, cuisineRaw) {
  const list = cuisines(cuisineRaw);
  const has = (c) => list.includes(c);
  const dish = list.find((c) => DISH[c]);
  const style = list.find((c) => STYLE[c]);

  if (amenity === "cafe") {
    if (has("bubble_tea")) return ["Boba shop", "coffee"];
    if (has("ice_cream")) return ["Ice cream shop", "sweets"];
    if (has("frozen_yogurt")) return ["Frozen yogurt shop", "sweets"];
    if (has("donut") || has("doughnut")) return ["Donut shop", "sweets"];
    if (has("dessert") || has("cake")) return ["Dessert shop", "sweets"];
    if (has("juice") || has("smoothie")) return ["Juice bar", "coffee"];
    if (has("bagel")) return ["Bagel shop", "coffee"];
    if (has("tea")) return ["Tea house", "coffee"];
    if (has("coffee_shop")) return ["Coffee shop", "coffee"];
    return ["Café", "coffee"];
  }
  if (amenity === "ice_cream") return [has("frozen_yogurt") ? "Frozen yogurt shop" : "Ice cream shop", "sweets"];
  if (amenity === "bar") return [has("wine") ? "Wine bar" : has("cocktail") ? "Cocktail bar" : "Bar", "drinks"];
  if (amenity === "pub") return ["Pub", "drinks"];
  if (amenity === "biergarten") return ["Beer garden", "drinks"];

  // restaurant and fast_food
  const sweet = ["donut", "doughnut", "ice_cream", "frozen_yogurt", "dessert", "cake"].includes(dish);
  const sip = ["coffee_shop", "bubble_tea", "juice", "smoothie"].includes(dish);
  if (dish) return [DISH[dish], sweet ? "sweets" : sip ? "coffee" : "eat"];
  if (style) {
    const word = STYLE[style];
    if (word === "Soul food") return ["Soul food restaurant", "eat"];
    return [`${word} ${amenity === "fast_food" ? "food" : "restaurant"}`, "eat"];
  }
  return [amenity === "fast_food" ? "Quick eats" : "Restaurant", "eat"];
}

/* ---- Shops: OpenStreetMap shop value -> [label, group, kind] ---- */

const SHOPS = {
  // counted as food & drink
  bakery: ["Bakery", "bakery", "food"],
  pastry: ["Pastry shop", "bakery", "food"],
  confectionery: ["Candy shop", "sweets", "food"],
  chocolate: ["Chocolate shop", "sweets", "food"],
  ice_cream: ["Ice cream shop", "sweets", "food"],
  coffee: ["Coffee roaster", "coffee", "food"],
  tea: ["Tea shop", "coffee", "food"],
  deli: ["Deli", "market", "food"],
  // markets
  cheese: ["Cheese shop", "market", "shop"],
  butcher: ["Butcher", "market", "shop"],
  seafood: ["Fish market", "market", "shop"],
  greengrocer: ["Produce market", "market", "shop"],
  farm: ["Farm stand", "market", "shop"],
  health_food: ["Health food store", "market", "shop"],
  spices: ["Spice shop", "market", "shop"],
  herbalist: ["Herb shop", "market", "shop"],
  wine: ["Wine shop", "drinks", "shop"],
  // style
  clothes: ["Clothing store", "style", "shop"],
  boutique: ["Boutique", "style", "shop"],
  shoes: ["Shoe store", "style", "shop"],
  fashion_accessories: ["Accessories shop", "style", "shop"],
  bag: ["Bag shop", "style", "shop"],
  jewelry: ["Jewelry shop", "style", "shop"],
  watches: ["Watch shop", "style", "shop"],
  leather: ["Leather goods shop", "style", "shop"],
  fabric: ["Fabric store", "style", "shop"],
  sewing: ["Sewing shop", "style", "shop"],
  wool: ["Yarn shop", "style", "shop"],
  cosmetics: ["Beauty shop", "style", "shop"],
  perfumery: ["Perfume shop", "style", "shop"],
  // books, art, music
  books: ["Bookstore", "books", "shop"],
  stationery: ["Stationery shop", "books", "shop"],
  art: ["Art shop", "art", "shop"],
  craft: ["Craft supply shop", "art", "shop"],
  frame: ["Frame shop", "art", "shop"],
  photo: ["Photo shop", "art", "shop"],
  camera: ["Camera shop", "art", "shop"],
  music: ["Record store", "music", "shop"],
  musical_instrument: ["Music shop", "music", "shop"],
  // play
  toys: ["Toy store", "play", "shop"],
  games: ["Game store", "play", "shop"],
  video_games: ["Video game store", "play", "shop"],
  collector: ["Collectibles shop", "play", "shop"],
  anime: ["Anime shop", "play", "shop"],
  party: ["Party supply shop", "play", "shop"],
  model: ["Hobby shop", "play", "shop"],
  // active
  bicycle: ["Bike shop", "active", "shop"],
  sports: ["Sporting goods shop", "active", "shop"],
  outdoor: ["Outdoor gear shop", "active", "shop"],
  surf: ["Surf shop", "active", "shop"],
  fishing: ["Tackle shop", "active", "shop"],
  golf: ["Golf shop", "active", "shop"],
  // home and garden
  florist: ["Florist", "plant", "shop"],
  garden_centre: ["Garden center", "plant", "shop"],
  furniture: ["Furniture store", "home", "shop"],
  interior_decoration: ["Home decor shop", "home", "shop"],
  houseware: ["Housewares shop", "home", "shop"],
  kitchen: ["Kitchen shop", "home", "shop"],
  lighting: ["Lighting shop", "home", "shop"],
  carpet: ["Rug shop", "home", "shop"],
  pet: ["Pet shop", "pet", "shop"],
  // finds
  gift: ["Gift shop", "finds", "shop"],
  antiques: ["Antique shop", "finds", "shop"],
  second_hand: ["Secondhand shop", "finds", "shop"],
  charity: ["Thrift store", "finds", "shop"],
  variety_store: ["Variety store", "finds", "shop"],
};

export const FOOD_SHOPS = Object.keys(SHOPS).filter((k) => SHOPS[k][2] === "food");
export const RETAIL_SHOPS = Object.keys(SHOPS).filter((k) => SHOPS[k][2] === "shop");

export const KIND_LABELS = { food: "Food & drink", shop: "Shops" };

// Reads OpenStreetMap tags. Returns { kind, cat, group, label } or null if it isn't a spot we show.
export function classify(tags) {
  if (!tags) return null;
  if (FOOD_AMENITIES.includes(tags.amenity)) {
    const [label, group] = foodInfo(tags.amenity, tags.cuisine);
    return { kind: "food", cat: tags.amenity, group, label };
  }
  const shop = SHOPS[tags.shop];
  if (shop) return { kind: shop[2], cat: tags.shop, group: shop[1], label: shop[0] };
  return null;
}

/* ---- Chains ----
   Most chains carry a "brand" tag in the map data and are dropped by that.
   This list is a backstop for big chains that were mapped without one. */

const CHAIN_NAMES = [
  "Starbucks", "Starbucks Coffee", "Starbucks Reserve", "McDonald's", "Subway", "7-Eleven", "Taco Bell",
  "Burger King", "Wendy's", "Jack in the Box", "In-N-Out Burger", "In-N-Out", "Panda Express", "Domino's",
  "Domino's Pizza", "Pizza Hut", "KFC", "Popeyes", "Popeyes Louisiana Kitchen", "Chick-fil-A", "Dunkin'",
  "Dunkin' Donuts", "Jamba", "Jamba Juice", "Baskin-Robbins", "Panera Bread", "Five Guys", "Carl's Jr.",
  "Del Taco", "El Pollo Loco", "Wingstop", "Little Caesars", "Papa John's", "Denny's", "IHOP", "Applebee's",
  "Olive Garden", "The Cheesecake Factory", "Chipotle", "Chipotle Mexican Grill", "The Coffee Bean & Tea Leaf",
  "Coffee Bean & Tea Leaf", "The Coffee Bean", "Coffee Bean", "Peet's Coffee", "Trader Joe's", "Whole Foods Market", "Whole Foods", "Ralphs",
  "Vons", "Albertsons", "Costco", "Target", "Walmart", "Best Buy", "The Home Depot", "Home Depot", "Lowe's",
  "Ross", "Ross Dress for Less", "Marshalls", "T.J. Maxx", "TJ Maxx", "Nordstrom", "Nordstrom Rack", "Macy's",
  "Old Navy", "Gap", "H&M", "Zara", "Uniqlo", "Nike", "Foot Locker", "Sephora", "Ulta Beauty", "GameStop",
  "PetSmart", "Petco", "Barnes & Noble", "Staples", "Office Depot", "Dollar Tree", "Big Lots", "Michaels",
  "JOANN", "Hobby Lobby", "IKEA", "CVS", "CVS Pharmacy", "Walgreens", "Rite Aid", "Sprouts Farmers Market",
  "Smart & Final", "Food 4 Less", "Yoshinoya", "Shake Shack", "Sweetgreen", "Blaze Pizza", "Pieology",
  "Raising Cane's", "The Habit Burger Grill", "Jersey Mike's", "Jersey Mike's Subs", "Jimmy John's",
  "Firehouse Subs", "Sonic", "Sonic Drive-In", "Arby's", "Dairy Queen", "Krispy Kreme", "Cold Stone Creamery",
  "Yogurtland", "Pinkberry", "Menchie's", "Wienerschnitzel", "Fatburger", "Buffalo Wild Wings", "Chili's",
  "Red Lobster", "Outback Steakhouse", "Red Robin", "TGI Fridays", "P.F. Chang's", "California Pizza Kitchen",
  "BJ's Restaurant & Brewhouse", "Rubio's", "Baja Fresh", "Qdoba", "Noah's Bagels", "Einstein Bros. Bagels",
  "Auntie Anne's", "Cinnabon", "Pressed Juicery", "Robeks", "Nekter Juice Bar", "Smoothie King",
  "Tropical Smoothie Cafe", "Waba Grill", "Flame Broiler", "L&L Hawaiian Barbecue", "Ono Hawaiian BBQ",
  "Pollo Campero", "Church's Chicken", "Round Table Pizza", "Papa Murphy's", "Marco's Pizza", "Sbarro",
  "Hot Dog on a Stick", "Wetzel's Pretzels", "See's Candies", "Godiva", "Lush", "Bath & Body Works",
  "Victoria's Secret", "Forever 21", "Hot Topic", "Zumiez", "Vans", "Urban Outfitters", "Anthropologie",
  "Free People", "Lululemon", "Levi's", "Adidas", "Skechers", "Famous Footwear", "DSW", "Kay Jewelers",
  "Zales", "Pandora", "Claire's", "Sunglass Hut", "Guitar Center", "Dick's Sporting Goods",
  "Big 5 Sporting Goods", "REI", "Bass Pro Shops", "West Marine", "Pottery Barn", "West Elm", "Crate & Barrel",
  "Williams-Sonoma", "Sur La Table", "HomeGoods", "World Market", "Cost Plus World Market", "Party City",
  "Spirit Halloween", "Five Below", "Daiso", "Miniso", "Goodwill", "The Salvation Army", "Salvation Army",
];

const CHAIN_KEYS = new Set(CHAIN_NAMES.map(nameKey));

export function isChainName(name) {
  return CHAIN_KEYS.has(nameKey(name));
}
