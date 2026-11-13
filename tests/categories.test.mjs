import test from "node:test";
import assert from "node:assert/strict";
import { classify, nameKey, isChainName, GROUPS, FOOD_SHOPS, RETAIL_SHOPS, FOOD_AMENITIES, iconSvg } from "../js/categories.js";

test("restaurants are labeled by cuisine", () => {
  assert.deepEqual(classify({ amenity: "restaurant", cuisine: "thai" }), { kind: "food", cat: "restaurant", group: "eat", label: "Thai restaurant" });
  assert.equal(classify({ amenity: "restaurant", cuisine: "pizza;italian" }).label, "Pizza place");
  assert.equal(classify({ amenity: "restaurant", cuisine: "Middle Eastern" }).label, "Middle Eastern restaurant");
  assert.equal(classify({ amenity: "restaurant" }).label, "Restaurant");
  assert.equal(classify({ amenity: "restaurant", cuisine: "something_unusual" }).label, "Restaurant");
  assert.equal(classify({ amenity: "fast_food", cuisine: "mexican" }).label, "Mexican food");
  assert.equal(classify({ amenity: "fast_food", cuisine: "tacos" }).label, "Taco spot");
  assert.equal(classify({ amenity: "fast_food" }).label, "Quick eats");
});

test("cafes, bars and treats get their own labels and colors", () => {
  assert.deepEqual(classify({ amenity: "cafe", cuisine: "bubble_tea" }), { kind: "food", cat: "cafe", group: "coffee", label: "Boba shop" });
  assert.equal(classify({ amenity: "cafe" }).label, "Café");
  assert.equal(classify({ amenity: "bar", cuisine: "wine" }).label, "Wine bar");
  assert.equal(classify({ amenity: "pub" }).group, "drinks");
  assert.equal(classify({ amenity: "ice_cream" }).group, "sweets");
  assert.equal(classify({ amenity: "fast_food", cuisine: "donut" }).group, "sweets");
});

test("shops are sorted into food and retail", () => {
  assert.deepEqual(classify({ shop: "books" }), { kind: "shop", cat: "books", group: "books", label: "Bookstore" });
  assert.equal(classify({ shop: "bakery" }).kind, "food");
  assert.equal(classify({ shop: "deli" }).kind, "food");
  assert.equal(classify({ shop: "wine" }).kind, "shop");
  assert.equal(classify({ shop: "charity" }).label, "Thrift store");
});

test("things that aren't spots are left out", () => {
  for (const tags of [{ shop: "car_repair" }, { shop: "cannabis" }, { shop: "tobacco" }, { shop: "supermarket" }, { amenity: "bank" }, { amenity: "fuel" }, {}, null]) {
    assert.equal(classify(tags), null, JSON.stringify(tags));
  }
});

test("every category has a color and a drawing", () => {
  const groups = new Set();
  for (const amenity of FOOD_AMENITIES) groups.add(classify({ amenity }).group);
  for (const shop of [...FOOD_SHOPS, ...RETAIL_SHOPS]) groups.add(classify({ shop }).group);
  for (const g of groups) {
    assert.ok(GROUPS[g], `missing group ${g}`);
    assert.match(GROUPS[g].color, /^#[0-9A-F]{6}$/i);
    assert.ok(iconSvg(g).includes("<path"));
  }
  assert.equal(FOOD_SHOPS.filter((s) => RETAIL_SHOPS.includes(s)).length, 0);
});

test("names are compared without punctuation, case or accents", () => {
  assert.equal(nameKey("Joe's Pizza"), nameKey("JOES  PIZZA"));
  assert.equal(nameKey("Café Lola"), nameKey("Cafe Lola"));
  assert.equal(nameKey("Salt & Straw"), nameKey("Salt and Straw"));
  assert.notEqual(nameKey("Joe's Pizza"), nameKey("Joe's Pizzeria"));
  assert.ok(nameKey("김밥천국").length > 0, "non-Latin names keep a key");
});

test("big chains are recognized by name", () => {
  for (const name of ["Starbucks", "starbucks coffee", "McDonald's", "7-Eleven", "Trader Joe's", "In-N-Out Burger"]) {
    assert.ok(isChainName(name), name);
  }
  for (const name of ["Starlight Coffee", "Joe's Tacos", "Target Practice Books", "The Daily Grind"]) {
    assert.ok(!isChainName(name), name);
  }
});
