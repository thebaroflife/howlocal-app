// App settings for the hosted app.
// The single-file preview that runs inside Claude swaps this file for preview/config.js.
export const CONFIG = {
  // "tiles"  = real listings from the files in data/places (built from OpenStreetMap by scripts/)
  // "sample" = made-up cards for previews; never used on the hosted app
  dataSource: "tiles",
  placesPath: "data/places",

  defaultRadiusMi: 5,
  maxRadiusMi: 50,

  allowGeolocation: true,
  preview: false,
  exampleZip: "",

  // Free swipes when the app is opened with ?try=1 (how oyom.ai shows it), before "Get the app".
  tryLimit: 10,
  // Store pages, once the apps are published. Empty means "add to home screen" instructions.
  stores: { ios: "", android: "" },
  // Lets the installed app open without a connection.
  offline: true,

  // Real street maps on cards and in details. Empty mapStyle turns them off.
  mapStyle: "https://tiles.openfreemap.org/styles/liberty",
  mapLib: "vendor/maplibre",
  // Street view photos in the details sheet (Mapillary), built by the "Street photos" job. "" turns them off.
  streetPath: "data/street",
  // "Own this spot?" form (Google Forms, in the howlocal.la Gmail). The app fills in the business name
  // and listing ID. url "" hides the link.
  // Optional tip for users (a Stripe Payment Link or Ko-fi page made in the HowLocal account).
  // url "" hides it. Swiping, saving and directions never cost anything.
  support: { url: "", label: "Leave a tip" },
  ownerForm: {
    url: "https://docs.google.com/forms/d/e/1FAIpQLScft6aBxhhDcx0-AW-bQgwrrsEBNvSeRTxTIo9BFlD--TkhmQ/viewform",
    name: "entry.2013697468",
    id: "entry.1624766788",
  },

  version: "1.5.0",
};
