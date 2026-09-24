import { BODIES, SYSTEM, bodyPosition, orbitRadius, bodyById } from './solar-config.js';
import { drawArk, ARK_COUNT } from './shipyard-render.js';
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
  if(o.talents.voyage){const home=bodyPosition(bodyById('earth'),clock);
    for(let i=0;i<ARK_COUNT;i++){const end=bodyPosition(BODIES.filter(b=>!b.belt&&b.id!=='earth')[i+1],clock),fraction=.17+i*.055,x=home.x+(end.x-home.x)*fraction,y=home.y+(end.y-home.y)*fraction;
      c.strokeStyle='#a7b8b11f';c.setLineDash([2,8]);c.beginPath();c.moveTo(home.x,home.y);c.lineTo(end.x,end.y);c.stroke();c.setLineDash([]);drawArk(c,x,y,.105,{angle:Math.atan2(end.x-home.x,home.y-end.y),thrust:0});}
  }
  c.textAlign='left';c.fillStyle='#5e7a80';c.font='8px ui-monospace,monospace';c.fillText('HELIOCENTRIC SURVEY  /  ORBITS NOT TO SCALE',40,464);c.textAlign='right';c.fillText('30 AU  /  OUTER SYSTEM',960,464);c.restore();
}
export function bodyAt(o,x,y,{reducedMotion=false,tolerance=15}={}){
  let best=null,distance=Infinity;for(const b of BODIES){if(b.belt)continue;const p=bodyPosition(b,reducedMotion?0:o.elapsed),d=Math.hypot(x-p.x,y-p.y);if(d<Math.max(b.size,6)+tolerance&&d<distance){best=b;distance=d;}}
  if(!best){const r=Math.hypot(x-SYSTEM.cx,(y-SYSTEM.cy)/SYSTEM.tilt);if(r>orbitRadius(2.2)&&r<orbitRadius(3.3))best=bodyById('belt');}return best;
}
export function drawBodyPortrait(c,w,h,b,o){c.clearRect(0,0,w,h);if(b.belt){for(let i=0;i<32;i++)disc(c,w*.2+noise(i+1)*w*.6,h*.2+noise(i+41)*h*.6,2+noise(i+100)*7,'#85938d');return;}drawSolarBody(c,b,w/2,h/2,Math.min(w,h)*(b.rings?.25:.38),{time:0,ring:b.id==='earth'?o.talents.recovery:0});}
