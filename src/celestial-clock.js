// One solar day for the surface battlefield and its orbital observer.
export const DAY_NIGHT_CYCLE_SECONDS = 120;
export const TAU = Math.PI * 2;
export const dayPhase = seconds => ((seconds / DAY_NIGHT_CYCLE_SECONDS) % 1 + 1) % 1;
export const siteLongitude = site => (site.x - .5) * TAU;
export const localSkyTime = (seconds, site) => seconds + siteLongitude(site) / TAU * DAY_NIGHT_CYCLE_SECONDS;
export function siteDaylight(seconds, site) {
  const phase = dayPhase(localSkyTime(seconds, site));
  return { phase, elevation: Math.sin(phase * TAU), label: phase < .08 || phase > .94 ? '黎明' : phase < .44 ? '昼间' : phase < .56 ? '黄昏' : '夜间' };
}
// The moon shares this clock. It orbits the same way the planet spins, so it
// rises later each day; the angle is measured from the sun's direction, so
// 0 is a new moon and π a full one, for the orbital view and every battlefield.
export const LUNAR_ORBIT_SECONDS = 480;
export const lunarOrbitAngle = seconds => 2.5 - seconds / LUNAR_ORBIT_SECONDS * TAU;
// Sky angle of the moon for a local sun angle, and the lit fraction of its disc.
export const lunarSkyAngle = (sunAngle, seconds) => sunAngle + lunarOrbitAngle(seconds);
export const lunarIllumination = seconds => (1 - Math.cos(lunarOrbitAngle(seconds))) / 2;
