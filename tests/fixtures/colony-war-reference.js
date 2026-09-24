// Real orbital wars run headless in the full battle engine (64 wars per row,
// dt 1/30 s, 1200 s cap, power 0, random profile and tendency). The abstract
// colony-war model is calibrated against these numbers; regenerate them if the
// battle engine changes. Durations are medians in seconds.
export const REAL_COLONY_WARS = Object.freeze({
  // Even wars: 1v1 818, 2v2 939, 3v3 772, 4v4 399, 5v5 840 (a quarter hit the cap).
  evenMedian: 800,
  // One age apart: 1v2 428, 2v3 511, 3v4 316, 4v5 104; the underdog won 3 of 64.
  oneAgeMedian: 380, oneAgeFavourite: .95,
  // Two ages apart: 1v3 238, 2v4 68, 3v5 51; the favourite won every one.
  twoAgeMedian: 68, twoAgeFavourite: 1,
  // From age I to age V while at war.
  toFinalAge: 140,
});
