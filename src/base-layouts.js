// Coordinates face into the battlefield. Architecture, weapons and simulation
// share these sockets; a purchased extension stays in place after selling its gun.
export const BASE_MOUNTS = Object.freeze(Object.fromEntries(Object.entries({
  1: [[36, -78], [-34, -112], [24, -136], [-27, -170]],
  2: [[36, -100], [-34, -128], [28, -156], [-29, -184]],
  3: [[38, -88], [-35, -119], [27, -144], [-29, -176]],
  4: [[34, -74], [-33, -106], [25, -130], [-27, -159]],
  5: [[36, -94], [-34, -124], [25, -148], [-28, -179]],
}).map(([age, mounts]) => [age, Object.freeze(mounts.map(([x, y]) => Object.freeze({ x, y })))])));
