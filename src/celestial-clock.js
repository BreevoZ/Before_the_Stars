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
