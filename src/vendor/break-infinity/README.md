# break_infinity.js 2.2.0

MIT-licensed upstream: https://github.com/Patashu/break_infinity.js

Source: https://registry.npmjs.org/break_infinity.js/-/break_infinity.js-2.2.0.tgz

Verified archive SHA-512 (base64):
`Li+150FfqGDj4gcJrgEJatFAR0OmfZyZLBGFKSHgjWKqKgWRm7GA+OmSSHwDFqkdOOjoY+R8X/jyDX/9MQEjmA==`

The distributed ESM file is vendored locally. Its single `pad-end` import is
replaced with native `String.padEnd`; the numerical implementation is unchanged.
This targets the same modern browsers and Node versions as the game, with no
CDN request, runtime package resolution, or build step. Keep LICENSE with copies.

Only `src/quantity.js` should import this library. Small values use native
arithmetic; large values are immutable and reject implicit numeric coercion.
