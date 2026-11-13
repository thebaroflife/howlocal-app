// Settings for the single-file preview that runs inside Claude.
// It carries made-up sample cards instead of the real listing files.
// scripts/build-preview.mjs swaps this in for js/config.js.
export const CONFIG = {
  dataSource: "sample",
  placesPath: "",
  defaultRadiusMi: 5,
  maxRadiusMi: 100,
  allowGeolocation: false,
  preview: true,
  exampleZip: "90012", // pre-filled on the start screen so the preview is one tap from a working deck
  tryLimit: 10,
  stores: { ios: "", android: "" },
  offline: false, // the preview is one file inside Claude: nothing to install or keep offline
  mapStyle: "", // pages inside Claude can't load outside map tiles
  mapLib: "",
  streetPath: "",
  ownerForm: { url: "" },
  version: "1.6.0 preview",
};
