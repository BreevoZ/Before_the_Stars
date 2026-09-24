import { drawPlanetSphere, surfacePoint, spinOf } from './planet-render.js';
import { satellitesOf, destination, surfaceOf, satellitePeriodSeconds } from './solar-bodies.js';
import { drawOrbitStars } from './orbital-render.js';
import { drawArkLight, ARK_COUNT } from './ark-lights.js';
import { facilityAt, arrived } from './solar-industry.js';
const TAU=Math.PI*2;
const noise=n=>{n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return((n^(n>>>15))>>>0)/4294967296;};
export function worldGeometry(body,w,h){
  const moons=satellitesOf(body.id),outer=Math.max(surfaceOf(body).rings?.outer??1.15,...moons.map(m=>m.orbit));
  const tilt=-(surfaceOf(body).tilt??.12),vertical=outer*Math.hypot(Math.sin(tilt),.32*Math.cos(tilt))+.16;
  return{x:w*.5,y:h*.51,r:Math.min(h*.34,w/(outer*2.35),h/(vertical*2.35)),outer};
}
const orbitTilt=moon=>-(surfaceOf(destination(moon.parent)).tilt??.12);
// Real period ratios on the shared satellite clock; retrograde runs backwards.
export function satellitePose(moon,time,g){
  const a=moon.phase+time/satellitePeriodSeconds(moon)*TAU,r=g.r*moon.orbit,tilt=orbitTilt(moon);
  const x=Math.cos(a)*r,y=Math.sin(a)*r*.32;
  return{x:g.x+x*Math.cos(tilt)-y*Math.sin(tilt),y:g.y+x*Math.sin(tilt)+y*Math.cos(tilt),z:Math.sin(a),r:Math.max(2.4,g.r*moon.size)};
}
export function satelliteAt(body,w,h,time,x,y){
  const g=worldGeometry(body,w,h);
  return satellitesOf(body.id).map(m=>({m,p:satellitePose(m,time,g)})).filter(({p})=>!(p.z<0&&Math.hypot(p.x-g.x,p.y-g.y)<g.r+p.r))
    .filter(({p})=>Math.hypot(x-p.x,y-p.y)<Math.max(16,p.r+6)).sort((a,b)=>Math.hypot(x-a.p.x,y-a.p.y)-Math.hypot(x-b.p.x,y-b.p.y))[0]?.m??null;
}
function orbit(c,g,moon){c.save();c.translate(g.x,g.y);c.rotate(orbitTilt(moon));c.strokeStyle='#a9bcb51d';c.lineWidth=.7;c.beginPath();c.ellipse(0,0,g.r*moon.orbit,g.r*moon.orbit*.32,0,0,TAU);c.stroke();c.restore();}
function satellite(c,moon,p,time,hover){
  drawPlanetSphere(c,moon,p.x,p.y,p.r,{time});
  c.fillStyle=hover===moon.id?'#e5d4a6':'#8fa19b';c.font='9px system-ui,sans-serif';c.textAlign='center';c.fillText(moon.name,p.x,p.y+p.r+15);
  if(hover===moon.id){c.strokeStyle='#d6c2939c';c.lineWidth=.6;c.beginPath();c.arc(p.x,p.y,p.r+5,0,TAU);c.stroke();}
}
function footholds(c,g,body,o,time){
  const world=o.solar.colonies[body.id],profile=surfaceOf(body),spin=spinOf(body,time);
  if(world?.phase==='winter'){
    c.save();c.beginPath();c.arc(g.x,g.y,g.r,0,TAU);c.clip();c.fillStyle='#8c989079';c.fillRect(g.x-g.r,g.y-g.r,g.r*2,g.r*2);c.restore();
  }
  const points=(world?.civs??[]).map((civ,i)=>({civ,p:surfacePoint(.4+i*2.4,Math.sin(i*2.1)*.6,spin,profile.tilt)}));
  c.save();c.beginPath();c.arc(g.x,g.y,g.r,0,TAU);c.clip();
  for(const {civ,p} of points)if(p.z>.05){const x=g.x+p.x*g.r,y=g.y+p.y*g.r;drawArkLight(c,x,y,{radius:1+civ.age*.15,glow:5+civ.age,brightness:.85});}
  for(const war of world?.wars??[]){const pair=war.sides.map(id=>points.find(p=>p.civ.id===id)?.p);if(pair.some(p=>!p||p.z<.05))continue;
    const [a,b]=pair;c.strokeStyle='#cb987c99';c.lineWidth=.8;c.setLineDash([2,4]);c.beginPath();c.moveTo(g.x+a.x*g.r,g.y+a.y*g.r);c.quadraticCurveTo(g.x+(a.x+b.x)*g.r*.5,g.y+(a.y+b.y)*g.r*.5-12,g.x+b.x*g.r,g.y+b.y*g.r);c.stroke();c.setLineDash([]);
  }c.restore();
  const key=facilityAt(body.id),rank=key?o.solar.facilities[key]:body.id==='mars'&&arrived(o,'mars')?ARK_COUNT:0;
  for(let i=0;i<rank;i++){
    const a=2.7+i*.13+time*.015,x=g.x+Math.cos(a)*g.r*1.12,y=g.y+Math.sin(a)*g.r*.38;
    drawArkLight(c,x,y,{radius:.8,glow:4,brightness:.8});
  }
}
// A low-poly rock has actual rotated vertices and depth-sorted lit faces.
const VERTS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],FACES=[[0,2,4],[4,2,1],[1,2,5],[5,2,0],[4,3,0],[1,3,4],[5,3,1],[0,3,5]];
function rock(c,x,y,r,seed,time){
  const a=time*.025+seed,b=seed*.71,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
  const points=VERTS.map(([x,y,z],i)=>{const k=.75+noise(seed*7+i)*.45;return{x:(x*ca+z*sa)*k,y:(y*cb-(z*ca-x*sa)*sb)*k,z:(y*sb+(z*ca-x*sa)*cb)*k};});
  const faces=FACES.map(f=>f.map(i=>points[i])).sort((a,b)=>a.reduce((n,p)=>n+p.z,0)-b.reduce((n,p)=>n+p.z,0));
  for(const f of faces){const light=.42+Math.max(0,(f[0].x+f[1].x+f[2].x)*.25-(f[0].y+f[1].y+f[2].y)*.15)*.5;c.fillStyle=`rgb(${[128,132,118].map(v=>Math.round(v*light))})`;c.beginPath();f.forEach((p,i)=>i?c.lineTo(x+p.x*r,y+p.y*r):c.moveTo(x+p.x*r,y+p.y*r));c.closePath();c.fill();}
}
export function drawBeltScene(c,w,h,o,time){
  const rank=o.solar.facilities.belt;
  // Far dust first, near fragments last; the empty space preserves the scale.
  for(let i=0;i<150;i++){
    const depth=noise(i+26),drift=time*(.0004+depth*.0006),x=((noise(i+31)+drift)%1)*w;
    const y=h*(.25+noise(i+52)*.54)+(x-w*.5)*.17,r=1+depth**5*Math.min(w*.035,19);
    rock(c,x,y,r,i,time);
    if(i<rank*3)drawArkLight(c,x+r+4,y,{radius:.9,glow:6});
  }
  const ceres={id:'ceres',name:'谷神星',color:'#9ca799',surface:'rock'},r=Math.min(w*.14,h*.21);
  drawPlanetSphere(c,ceres,w*.37,h*.49,r,{time});
  c.fillStyle='#a8b7a7';c.font='10px system-ui,sans-serif';c.textAlign='center';c.fillText('谷神星',w*.37,h*.49+r+22);
  c.fillStyle='#839b92';c.font='9px ui-monospace,monospace';c.fillText('CERES / MAIN BELT',w*.37,h*.49+r+38);
}
export function drawWorldScene(c,w,h,body,o,{ambientTime=0,reducedMotion=false,hover=null}={}){
  const time=reducedMotion?0:o.elapsed;drawOrbitStars(c,w,h,ambientTime,reducedMotion);
  if(body.belt){drawBeltScene(c,w,h,o,time);return;}
  const g=worldGeometry(body,w,h),moons=satellitesOf(body.id).map(m=>({m,p:satellitePose(m,time,g)}));
  if(body.parent){const parent=destination(body.parent);c.save();c.globalAlpha=.18;drawPlanetSphere(c,parent,w*.94,h*.12,Math.min(w*.20,h*.30),{time});c.restore();}
  for(const {m} of moons)orbit(c,g,m);
  for(const {m,p} of moons)if(p.z<0)satellite(c,m,p,time,hover);
  drawPlanetSphere(c,body,g.x,g.y,g.r,{time});footholds(c,g,body,o,time);
  for(const {m,p} of moons)if(p.z>=0)satellite(c,m,p,time,hover);
  c.fillStyle='#7d968b';c.font='8px ui-monospace,monospace';c.textAlign='left';c.fillText(body.parent?'SATELLITE OBSERVATORY':'PLANETARY OBSERVATORY',22,h-20);
  c.textAlign='right';c.fillText(moons.length?'LOCAL SYSTEM / ORBITS NOT TO SCALE':'SURFACE SURVEY',w-22,h-20);
}
