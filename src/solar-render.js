import { BODIES, SYSTEM, bodyPosition, orbitRadius, bodyById } from './solar-config.js';
import { drawArk, ARK_COUNT } from './shipyard-render.js';
import { FACILITIES, pioneerProgress, flightLeg, arksMoored, arrived, flightTo } from './solar-industry.js';
import { drawArkLight } from './ark-lights.js';
import { TAU } from './celestial-clock.js';
const noise=n=>{let v=Math.imul(n^(n>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);return((v^(v>>>15))>>>0)/4294967296;};
const disc=(c,x,y,r,fill)=>{c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle=fill;c.fill();};
export { bodyKindLabel, MOON, DESTINATIONS, destination } from './solar-bodies.js';
import { drawPlanetSphere } from './planet-render.js';
import { drawBeltScene } from './solar-world-render.js';
// Uniform scaling keeps circles round at every aspect ratio. All hit tests use
// this same transform; the catalogue remains usable even when planets overlap.
export function solarViewport(w,h){const scale=Math.min(w/1000,h/500);return{scale,x:(w-1000*scale)/2,y:(h-500*scale)/2};}
export function drawSolarBody(c,b,x,y,r,{time=0,sunAngle=-.4,ring=0}={}){
  drawPlanetSphere(c,b,x,y,r,{time,sunAngle});
  if(ring){c.save();c.translate(x,y);c.rotate(-.25);c.strokeStyle='#b8c2a79c';c.lineWidth=Math.max(.7,r*.035);c.beginPath();c.ellipse(0,0,r*1.4,r*.35,0,0,Math.PI*2);c.stroke();c.restore();}
}
function stars(c,w,h,time){c.fillStyle='#0b141e';c.fillRect(0,0,w,h);const g=c.createRadialGradient(w*.45,h*.47,0,w*.45,h*.47,w*.75);g.addColorStop(0,'#3148532e');g.addColorStop(.5,'#20313a18');g.addColorStop(1,'#101a2600');c.fillStyle=g;c.fillRect(0,0,w,h);
  for(let i=0;i<190;i++){c.globalAlpha=.1+(.5+.5*Math.sin(time*.4+noise(i)*TAU))*.26;disc(c,noise(i+500)*w,noise(i+900)*h,i%13===0?1.1:.55,'#c1d0cb');}c.globalAlpha=1;}
export function drawSolarSystem(c,w,h,o,{ambientTime=o.elapsed,reducedMotion=false,hover=null,selected='earth'}={}){
  const clock=reducedMotion?0:o.elapsed;stars(c,w,h,reducedMotion?0:ambientTime);const v=solarViewport(w,h);c.save();c.translate(v.x,v.y);c.scale(v.scale,v.scale);
  const {cx,cy,tilt}=SYSTEM;
  // Continuous orbit lines and a sparse survey grid leave the space between
  // planets quiet. The selected orbit carries the only strong highlight.
  for(const b of BODIES){if(b.belt)continue;const chosen=b.id===selected||b.id===hover,home=b.id==='earth'||arrived(o,b.id);c.strokeStyle=chosen?'#cbb7897a':home?'#bcb78648':'#8fa9ad20';c.lineWidth=chosen?1.15:home?.85:.6;c.beginPath();c.ellipse(cx,cy,orbitRadius(b.au),orbitRadius(b.au)*tilt,0,0,TAU);c.stroke();}
  for(let i=0;i<220;i++){const a=noise(i+17)*TAU+clock*.0002,r=orbitRadius(2.2+noise(i+8)*1.1);disc(c,cx+Math.cos(a)*r,cy+Math.sin(a)*r*tilt,.5+noise(i+70),i%4?'#7989824b':'#a4a49367');}
  const glow=c.createRadialGradient(cx,cy,0,cx,cy,100);glow.addColorStop(0,'#ecd2a49a');glow.addColorStop(.25,'#d0ab6c25');glow.addColorStop(1,'#c5ab7100');disc(c,cx,cy,100,glow);disc(c,cx,cy,17,'#e2cd9d');disc(c,cx-3,cy-3,12,'#f1e5c2');
  c.fillStyle='#adbcab';c.font='9px ui-monospace,monospace';c.textAlign='center';c.fillText('SOL',cx,cy+34);
  for(const b of BODIES.filter(b=>!b.belt).sort((a,b)=>bodyPosition(a,clock).depth-bodyPosition(b,clock).depth)){
    const p=bodyPosition(b,clock),r=Math.max(5,b.size)*1.15,active=b.id===selected||b.id===hover;
    const settled=b.id==='earth'||arrived(o,b.id),flying=o.talents.voyage&&(b.id==='mars'&&!settled||flightTo(o,b.id));
    c.save();c.globalAlpha=settled||flying||active?1:.62;drawSolarBody(c,b,p.x,p.y,r,{time:clock,sunAngle:Math.atan2(cy-p.y,cx-p.x),ring:b.id==='earth'?o.talents.recovery:0});c.restore();
    if(active){c.strokeStyle='#d6c596';c.lineWidth=.8;c.beginPath();c.arc(p.x,p.y,r+7,-.3,1.2);c.stroke();c.beginPath();c.arc(p.x,p.y,r+7,Math.PI-.3,Math.PI+1.2);c.stroke();}
    c.textAlign=p.x<cx?'right':'left';const sign=p.x<cx?-1:1;c.fillStyle=active?'#e0d3af':'#a6b8b2';c.font=`${Math.max(active?12:10,(active?10:8)/v.scale)}px system-ui,sans-serif`;if(w>=600||active)c.fillText(b.name,p.x+sign*(r+13),p.y+4);
    if(b.id==='earth')disc(c,p.x+r*2,p.y-r,2.1,'#b6c4b3');
    if(w>=600){c.fillStyle=settled?'#b9ba91':flying?'#a5bca7':'#657f80';c.font='8px system-ui,sans-serif';c.fillText(b.id==='earth'?'母星 · 月面家园':settled?'驻地已建立':flying?'方舟航行中':'待抵达',p.x+sign*(r+13),p.y+18);}
  }
  if(o.talents.voyage){const home=bodyPosition(bodyById('earth'),clock),place=id=>id==='moon'?home:bodyPosition(bodyById(id),clock);
    // One eased arc between two moving bodies; returns the point and heading at t.
    const arc=(from,to,t,lift=.18)=>{const e=t*t*(3-2*t),mx=(from.x+to.x)/2,my=(from.y+to.y)/2-Math.hypot(to.x-from.x,to.y-from.y)*lift,u=1-e;
      return{x:u*u*from.x+2*u*e*mx+e*e*to.x,y:u*u*from.y+2*u*e*my+e*e*to.y,angle:Math.atan2(2*u*(mx-from.x)+2*e*(to.x-mx),-(2*u*(my-from.y)+2*e*(to.y-my))),mx,my};};
    const trail=(from,to,p,color='#a7b8b11f')=>{c.strokeStyle=color;c.setLineDash([2,8]);c.beginPath();c.moveTo(from.x,from.y);c.quadraticCurveTo(p.mx,p.my,to.x,to.y);c.stroke();c.setLineDash([]);};
    // Every light here is an ark. The pioneer fleet flies in a loose file to
    // Mars and moors there; a dispatched ark leaves the moored row, flies its
    // legs through the drydocks and stays at the world it founded.
    const mars=bodyPosition(bodyById('mars'),clock),marsR=Math.max(5,bodyById('mars').size)*1.15,t=pioneerProgress(o),light=(x,y,glow=4)=>drawArkLight(c,x,y,{radius:1,glow,brightness:.95});
    if(t<1){trail(home,mars,arc(home,mars,0));for(let i=0;i<ARK_COUNT;i++){const k=Math.max(0,Math.min(1,t*1.08-i*.012)),p=arc(home,mars,k),side=(i-3)*1.6;
      drawArk(c,p.x+Math.cos(p.angle)*side,p.y+Math.sin(p.angle)*side,.07,{angle:p.angle,thrust:reducedMotion?0:1});}}
    else for(let i=0;i<arksMoored(o);i++){const a=-2.3+i*.24;light(mars.x+Math.cos(a)*(marsR+5),mars.y+Math.sin(a)*(marsR+5));}
    for(const f of o.solar.flights){const stops=[f.from,...(f.via??[]),f.body].map(place),leg=flightLeg(o,f),a=place(leg.from),b=place(leg.to),p=arc(a,b,leg.t,.12);
      stops.slice(1).forEach((q,i)=>trail(stops[i],q,arc(stops[i],q,0,.12)));light(p.x,p.y,6);}
    // Stations: the ark that founded each foothold, beside its world (on the belt, in it).
    for(const [key,f] of Object.entries(FACILITIES)){if(!o.solar.facilities[key])continue;
      if(f.body==='belt'){const a=2.2+clock*.004,rr=orbitRadius(2.7);light(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr*tilt);continue;}
      const p=bodyPosition(bodyById(f.body),clock),r=Math.max(5,bodyById(f.body).size)*1.15+4,a=reducedMotion?0:clock*.05;light(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r*.6);}
    // Transfer arks: Earth to Mars, one light per civilization on board.
    for(const tr of o.solar.transfers){const p=arc(home,mars,Math.max(0,Math.min(1,(o.elapsed-tr.departAt)/(tr.arriveAt-tr.departAt))),.25);trail(home,mars,arc(home,mars,0,.25),'#e6d6a42b');light(p.x,p.y,5);}
    // Mars keeps its own winter: a grey veil and a clock, nothing more.
    const world=o.solar.colonies.mars;
    if(world.phase==='winter'){disc(c,mars.x,mars.y,marsR+.5,'#7f8a8ecc');c.fillStyle='#b8c3c4';c.font='8px ui-monospace,monospace';c.textAlign=mars.x<cx?'right':'left';
      if(w>=600)c.fillText(`WINTER ${Math.ceil(world.remaining)}s`,mars.x+(mars.x<cx?-1:1)*(marsR+13),mars.y+18);}
  }
  c.textAlign='left';c.fillStyle='#5e7a80';c.font='8px ui-monospace,monospace';c.fillText('HELIOCENTRIC SURVEY  /  ORBITS NOT TO SCALE',40,464);c.textAlign='right';c.fillText('30 AU  /  OUTER SYSTEM',960,464);c.restore();
}
export function bodyAt(o,x,y,{reducedMotion=false,tolerance=15}={}){
  let best=null,distance=Infinity;for(const b of BODIES){if(b.belt)continue;const p=bodyPosition(b,reducedMotion?0:o.elapsed),d=Math.hypot(x-p.x,y-p.y);if(d<Math.max(b.size,6)+tolerance&&d<distance){best=b;distance=d;}}
  if(!best){const r=Math.hypot(x-SYSTEM.cx,(y-SYSTEM.cy)/SYSTEM.tilt);if(r>orbitRadius(2.2)&&r<orbitRadius(3.3))best=bodyById('belt');}return best;
}
export function drawBodyPortrait(c,w,h,b,o){c.clearRect(0,0,w,h);if(b.belt){drawBeltScene(c,w,h,o,0);return;}const r=Math.min(w,h)*(b.rings?.25:.38);drawSolarBody(c,b,w/2,h/2,r,{time:0,ring:b.id==='earth'?o.talents.recovery:0});
  if(o.solar?.colonies?.[b.id]?.phase==='winter')disc(c,w/2,h/2,r,'#8a9496b8');}
