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

  version: "1.2.1",
};
