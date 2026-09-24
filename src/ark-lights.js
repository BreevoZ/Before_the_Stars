import { ORBITAL_RULES } from './orbital-config.js';
export const ARK_COUNT = ORBITAL_RULES.arkCount;
// Small, separated sites on the near side; no building silhouettes at this scale.
export const ARK_SITES = Object.freeze([
  [-.58,.34],[-.28,.41],[-.04,.25],[-.50,.06],[-.21,-.03],[.07,0],[-.40,-.25],
].map(([longitude,latitude])=>Object.freeze({longitude,latitude})));
export function arkSite(index) {
  const {longitude,latitude}=ARK_SITES[index],c=Math.cos(latitude);
  return {x:Math.sin(longitude)*c,y:-Math.sin(latitude),z:Math.cos(longitude)*c};
}
export function drawArkLight(ctx,x,y,{radius=1,glow=7,brightness=1}={}) {
  ctx.save();ctx.globalAlpha*=brightness;
  const halo=ctx.createRadialGradient(x,y,0,x,y,glow);
  halo.addColorStop(0,'#ffefbdb3');halo.addColorStop(.2,'#e8d5a35c');halo.addColorStop(1,'#d4cfa100');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,glow,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff7d5';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.restore();
}
