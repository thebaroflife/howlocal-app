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

  version: "1.1.0",
};
