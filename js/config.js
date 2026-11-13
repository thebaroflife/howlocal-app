// App settings for the hosted app.
// The single-file preview that runs inside Claude swaps this file for preview/config.js.
export const CONFIG = {
  // "live"   = real listings from OpenStreetMap (free, no key)
  // "sample" = made-up cards for previews; never used on the hosted app
  dataSource: "live",

  // Public OpenStreetMap query servers, tried in order.
  endpoints: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ],
  requestTimeoutMs: 25000,

  // How long fetched listings are reused on the phone before asking again.
  cacheHours: 24,

  defaultRadiusMi: 5,
  maxRadiusMi: 50,

  allowGeolocation: true,
  preview: false,
  exampleZip: "",

  version: "1.0.1",
};
