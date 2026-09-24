import { BODIES, SYSTEM, bodyPosition, orbitRadius, bodyById } from './solar-config.js';
import { drawArk, ARK_COUNT } from './shipyard-render.js';
import { FACILITIES, docks, pioneerProgress, flightProgress } from './solar-industry.js';
import { TAU } from './celestial-clock.js';
const noise=n=>{let v=Math.imul(n^(n>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);return((v^(v>>>15))>>>0)/4294967296;};
const disc=(c,x,y,r,fill)=>{c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle=fill;c.fill();};
export const bodyKindLabel=b=>({home:'文明摇篮',moon:'月面家园',habitable:'殖民候选',industrial:'工业候选',relay:'深空前哨'}[b.kind]);
export const MOON=Object.freeze({id:'moon',name:'月球',au:1,size:4,kind:'moon',color:'#a6b6aa',description:'最初的地外家园。月面工场、质量投射器与深空船坞，为航向群星的人们守住后方。'});
export const DESTINATIONS=Object.freeze([...BODIES.slice(0,3),MOON,...BODIES.slice(3)]);
export const destination=id=>id==='moon'?MOON:bodyById(id);
// Uniform scaling keeps circles round at every aspect ratio. All hit tests use
// this same transform; the catalogue remains usable even when planets overlap.
export function solarViewport(w,h){const scale=Math.min(w/1000,h/500);return{scale,x:(w-1000*scale)/2,y:(h-500*scale)/2};}
export function drawSolarBody(c,b,x,y,r,{time=0,sunAngle=-.8,ring=0}={}){
  c.save();c.translate(x,y);
  if(b.rings){c.save();c.rotate(-.35);c.strokeStyle='#c7b89780';c.lineWidth=r*.27;c.beginPath();c.ellipse(0,0,r*1.9,r*.54,0,Math.PI,TAU);c.stroke();c.restore();}
  disc(c,0,0,r,b.color);c.save();c.beginPath();c.arc(0,0,r,0,TAU);c.clip();
  if(['jupiter','saturn','uranus','neptune'].includes(b.id)){
    c.rotate(b.id==='uranus'?1.25:-.18);for(let i=0;i<15;i++){c.fillStyle=i%3===0?'#e5dbbd2b':'#0b213928';c.fillRect(-r,-r+i*r*.14,r*2,r*(.04+noise(i)*.09));}
    if(b.id==='jupiter'){c.fillStyle='#936a5d90';c.beginPath();c.ellipse(r*.28,r*.27,r*.3,r*.13,-.1,0,TAU);c.fill();}
  }else if(b.id==='earth'){
    for(let i=0;i<9;i++){const a=i*2.399+time*.001,xx=Math.sin(a)*r*.73,yy=Math.cos(i*1.71)*r*.73;c.fillStyle=i%2?'#acb99490':'#465f5290';c.beginPath();for(let j=0;j<7;j++){const q=j*TAU/7;c.lineTo(xx+Math.cos(q)*r*(.13+noise(i+j)*.15),yy+Math.sin(q)*r*(.14+noise(i*j+40)*.15));}c.closePath();c.fill();}
    c.strokeStyle='#d5dbbc5e';c.lineWidth=r*.035;for(let i=0;i<3;i++){c.beginPath();c.ellipse(r*.15,-r*.55+i*r*.45,r*.8,r*.18,-.15,.1,2.8);c.stroke();}
  }else{
    for(let i=0;i<35;i++){const a=i*2.39996+time*.0006,rr=Math.sqrt(noise(i+180))*r;c.fillStyle=i%2?'#14283027':'#e1d9bc16';disc(c,Math.cos(a)*rr,Math.sin(a)*rr,r*(.025+noise(i+43)*.1),c.fillStyle);}
    if(b.id==='mars'){c.strokeStyle='#603d372a';c.lineWidth=r*.11;c.beginPath();c.moveTo(-r,r*.15);c.bezierCurveTo(-r*.3,-r*.2,r*.1,r*.4,r,r*.08);c.stroke();disc(c,0,-r*.98,r*.24,'#dedbd0b0');}
    if(b.id==='venus'){c.strokeStyle='#e6d4a42c';c.lineWidth=r*.11;for(let i=0;i<6;i++){c.beginPath();c.ellipse(-r*.3,-r+i*r*.4,r*1.3,r*.5,-.4,0,Math.PI);c.stroke();}}
  }
  const lx=Math.cos(sunAngle)*r,ly=Math.sin(sunAngle)*r,g=c.createLinearGradient(lx,ly,-lx,-ly);g.addColorStop(0,'#e4ddbd19');g.addColorStop(.45,'#09151e08');g.addColorStop(.8,'#07101e9c');g.addColorStop(1,'#060e17ed');disc(c,0,0,r,g);c.restore();
  c.strokeStyle='#c5d2c129';c.lineWidth=.7;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();
  if(b.rings||ring){c.save();c.rotate(b.rings?-.35:-.25);c.strokeStyle=b.rings?'#c7b897b0':'#b8c2a79c';c.lineWidth=b.rings?r*.27:Math.max(1,r*.035);c.beginPath();c.ellipse(0,0,r*(b.rings?1.9:1.4),r*.54,0,0,Math.PI);c.stroke();c.restore();}
  c.restore();
}
function stars(c,w,h,time){c.fillStyle='#0b141e';c.fillRect(0,0,w,h);const g=c.createRadialGradient(w*.45,h*.47,0,w*.45,h*.47,w*.75);g.addColorStop(0,'#3148532e');g.addColorStop(.5,'#20313a18');g.addColorStop(1,'#101a2600');c.fillStyle=g;c.fillRect(0,0,w,h);
  for(let i=0;i<190;i++){c.globalAlpha=.1+(.5+.5*Math.sin(time*.4+noise(i)*TAU))*.26;disc(c,noise(i+500)*w,noise(i+900)*h,i%13===0?1.1:.55,'#c1d0cb');}c.globalAlpha=1;}
export function drawSolarSystem(c,w,h,o,{ambientTime=o.elapsed,reducedMotion=false,hover=null,selected='earth'}={}){
  const clock=reducedMotion?0:o.elapsed;stars(c,w,h,reducedMotion?0:ambientTime);const v=solarViewport(w,h);c.save();c.translate(v.x,v.y);c.scale(v.scale,v.scale);
  const {cx,cy,tilt}=SYSTEM;
  // Continuous orbit lines and a sparse survey grid leave the space between
  // planets quiet. The selected orbit carries the only strong highlight.
  for(const b of BODIES){if(b.belt)continue;const chosen=b.id===selected||b.id===hover;c.strokeStyle=chosen?'#cbb7897a':'#8fa9ad25';c.lineWidth=chosen?1.15:.7;c.beginPath();c.ellipse(cx,cy,orbitRadius(b.au),orbitRadius(b.au)*tilt,0,0,TAU);c.stroke();}
  for(let i=0;i<220;i++){const a=noise(i+17)*TAU+clock*.0002,r=orbitRadius(2.2+noise(i+8)*1.1);disc(c,cx+Math.cos(a)*r,cy+Math.sin(a)*r*tilt,.5+noise(i+70),i%4?'#7989824b':'#a4a49367');}
  const glow=c.createRadialGradient(cx,cy,0,cx,cy,100);glow.addColorStop(0,'#ecd2a49a');glow.addColorStop(.25,'#d0ab6c25');glow.addColorStop(1,'#c5ab7100');disc(c,cx,cy,100,glow);disc(c,cx,cy,17,'#e2cd9d');disc(c,cx-3,cy-3,12,'#f1e5c2');
  c.fillStyle='#adbcab';c.font='9px ui-monospace,monospace';c.textAlign='center';c.fillText('SOL',cx,cy+34);
  for(const b of BODIES.filter(b=>!b.belt).sort((a,b)=>bodyPosition(a,clock).depth-bodyPosition(b,clock).depth)){
    const p=bodyPosition(b,clock),r=Math.max(5,b.size)*1.15,active=b.id===selected||b.id===hover;
    drawSolarBody(c,b,p.x,p.y,r,{time:clock,sunAngle:Math.atan2(cy-p.y,cx-p.x),ring:b.id==='earth'?o.talents.recovery:0});
    if(active){c.strokeStyle='#d6c596';c.lineWidth=.8;c.beginPath();c.arc(p.x,p.y,r+7,-.3,1.2);c.stroke();c.beginPath();c.arc(p.x,p.y,r+7,Math.PI-.3,Math.PI+1.2);c.stroke();}
    c.textAlign=p.x<cx?'right':'left';const sign=p.x<cx?-1:1;c.fillStyle=active?'#e0d3af':'#a6b8b2';c.font=`${Math.max(active?12:10,(active?10:8)/v.scale)}px system-ui,sans-serif`;if(w>=600||active)c.fillText(b.name,p.x+sign*(r+13),p.y+4);
    if(b.id==='earth'){disc(c,p.x+r*2,p.y-r,2.1,'#b6c4b3');c.fillStyle='#869f96';c.font='8px ui-monospace,monospace';if(w>=600)c.fillText(o.phase==='winter'?'WINTER':'HOME',p.x+sign*(r+13),p.y+18);}
  }
  if(o.talents.voyage){const home=bodyPosition(bodyById('earth'),clock),place=id=>id==='moon'?home:bodyPosition(bodyById(id),clock);
    // One eased arc between two moving bodies; returns the point and heading at t.
    const arc=(from,to,t,lift=.18)=>{const e=t*t*(3-2*t),mx=(from.x+to.x)/2,my=(from.y+to.y)/2-Math.hypot(to.x-from.x,to.y-from.y)*lift,u=1-e;
      return{x:u*u*from.x+2*u*e*mx+e*e*to.x,y:u*u*from.y+2*u*e*my+e*e*to.y,angle:Math.atan2(2*u*(mx-from.x)+2*e*(to.x-mx),-(2*u*(my-from.y)+2*e*(to.y-my))),mx,my};};
    const trail=(from,to,p,color='#a7b8b11f')=>{c.strokeStyle=color;c.setLineDash([2,8]);c.beginPath();c.moveTo(from.x,from.y);c.quadraticCurveTo(p.mx,p.my,to.x,to.y);c.stroke();c.setLineDash([]);};
    // The pioneer fleet: seven arks in a loose file to Mars, then moored there.
    const mars=bodyPosition(bodyById('mars'),clock),marsR=Math.max(5,bodyById('mars').size)*1.15,t=pioneerProgress(o);
    if(t<1){trail(home,mars,arc(home,mars,0));for(let i=0;i<ARK_COUNT;i++){const k=Math.max(0,Math.min(1,t*1.08-i*.012)),p=arc(home,mars,k),side=(i-3)*1.6;
      drawArk(c,p.x+Math.cos(p.angle)*side,p.y+Math.sin(p.angle)*side,.07,{angle:p.angle,thrust:reducedMotion?0:1});}}
    else for(let i=0;i<ARK_COUNT;i++){const a=-2.3+i*.24;disc(c,mars.x+Math.cos(a)*(marsR+5),mars.y+Math.sin(a)*(marsR+5),1,'#e6d6a4');}
    // Drydocks: a small bracket beside every body arks can leave from.
    for(const id of docks(o)){if(id==='moon')continue;const p=place(id),r=Math.max(5,bodyById(id).size)*1.15;c.strokeStyle='#e6d6a4b0';c.lineWidth=.8;c.beginPath();c.moveTo(p.x+r+4,p.y-4);c.lineTo(p.x+r+7,p.y-4);c.lineTo(p.x+r+7,p.y+4);c.lineTo(p.x+r+4,p.y+4);c.stroke();}
    // Dispatched arks: from their drydock to the foothold they will found.
    for(const f of o.solar.flights){const from=place(f.from),to=bodyPosition(bodyById(f.body),clock),p=arc(from,to,flightProgress(o,f));trail(from,to,arc(from,to,0));drawArk(c,p.x,p.y,.095,{angle:p.angle,thrust:reducedMotion?0:1});}
    // Transfers: a smaller ark per civilization in flight, Earth to Mars; the
    // dome's residents glow as a cluster on the planet.
    for(const t of o.solar.transfers){const e=Math.max(0,Math.min(1,(o.elapsed-t.departAt)/(t.arriveAt-t.departAt))),k=e*e*(3-2*e),mx=(home.x+mars.x)/2,my=(home.y+mars.y)/2-Math.hypot(mars.x-home.x,mars.y-home.y)*.25,u=1-k;
      c.strokeStyle='#e6d6a42b';c.setLineDash([1.5,5]);c.beginPath();c.moveTo(home.x,home.y);c.quadraticCurveTo(mx,my,mars.x,mars.y);c.stroke();c.setLineDash([]);
      const x=u*u*home.x+2*u*k*mx+k*k*mars.x,y=u*u*home.y+2*u*k*my+k*k*mars.y,dx=2*u*(mx-home.x)+2*k*(mars.x-mx),dy=2*u*(my-home.y)+2*k*(mars.y-my);drawArk(c,x,y,.085,{angle:Math.atan2(dx,-dy),thrust:reducedMotion?0:1});}
    // Mars: residents as warm lights, a red pulse between two at war, and a grey
    // veil with its own clock while the planet lies in nuclear winter.
    const world=o.solar.colonies.mars,residentAt=i=>{const a=i*2.4+.6,r=marsR*.55;return{x:mars.x+Math.cos(a)*r,y:mars.y+Math.sin(a)*r};};
    world.civs.forEach((civ,i)=>{const p=residentAt(i);disc(c,p.x,p.y,1.1+civ.age*.15,civ.warId?'#f0a47c':'#f3d99a');});
    for(const war of world.wars){const [a,b]=war.sides.map(id=>residentAt(world.civs.findIndex(x=>x.id===id))),pulse=reducedMotion?.6:.45+.35*Math.sin(clock*4);
      c.strokeStyle=`rgba(236,128,92,${pulse})`;c.lineWidth=.8;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    if(world.phase==='winter'){disc(c,mars.x,mars.y,marsR+.5,'#7f8a8ecc');c.fillStyle='#b8c3c4';c.font='8px ui-monospace,monospace';c.textAlign=mars.x<cx?'right':'left';
      if(w>=600)c.fillText(`WINTER ${Math.ceil(world.remaining)}s`,mars.x+(mars.x<cx?-1:1)*(marsR+13),mars.y+18);}
    // Footholds: one light per built rank, circling the body (the belt's fleet rides the belt).
    for(const [key,f] of Object.entries(FACILITIES)){const rank=o.solar.facilities[key];if(!rank)continue;
      if(f.body==='belt'){for(let k=0;k<rank*3;k++){const a=k*2.1+clock*.004,rr=orbitRadius(2.4+(k%3)*.3);disc(c,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr*tilt,1.3,'#efdca6');}continue;}
      const p=bodyPosition(bodyById(f.body),clock),r=Math.max(5,bodyById(f.body).size)*1.15+4;
      for(let k=0;k<rank;k++){const a=k/rank*TAU+(reducedMotion?0:clock*.05);disc(c,p.x+Math.cos(a)*r,p.y+Math.sin(a)*r*.6,1.2,'#f1e2b0');}}
  }
  c.textAlign='left';c.fillStyle='#5e7a80';c.font='8px ui-monospace,monospace';c.fillText('HELIOCENTRIC SURVEY  /  ORBITS NOT TO SCALE',40,464);c.textAlign='right';c.fillText('30 AU  /  OUTER SYSTEM',960,464);c.restore();
}
export function bodyAt(o,x,y,{reducedMotion=false,tolerance=15}={}){
  let best=null,distance=Infinity;for(const b of BODIES){if(b.belt)continue;const p=bodyPosition(b,reducedMotion?0:o.elapsed),d=Math.hypot(x-p.x,y-p.y);if(d<Math.max(b.size,6)+tolerance&&d<distance){best=b;distance=d;}}
  if(!best){const r=Math.hypot(x-SYSTEM.cx,(y-SYSTEM.cy)/SYSTEM.tilt);if(r>orbitRadius(2.2)&&r<orbitRadius(3.3))best=bodyById('belt');}return best;
}
export function drawBodyPortrait(c,w,h,b,o){c.clearRect(0,0,w,h);if(b.belt){for(let i=0;i<32;i++)disc(c,w*.2+noise(i+1)*w*.6,h*.2+noise(i+41)*h*.6,2+noise(i+100)*7,'#85938d');return;}const r=Math.min(w,h)*(b.rings?.25:.38);drawSolarBody(c,b,w/2,h/2,r,{time:0,ring:b.id==='earth'?o.talents.recovery:0});
  // A colony in nuclear winter: ash veils the whole disc.
  if(o.solar?.colonies?.[b.id]?.phase==='winter')disc(c,w/2,h/2,r,'#8a9496b8');}
