import { SITES, ORBITAL_RULES as R } from './orbital-config.js';
import { dayPhase, TAU, siteLongitude } from './celestial-clock.js';
const C={sky:'#0e181b',ocean:'#284c51',land:'#829077',light:'#b9cfb4',gold:'#c5b17d',war:'#c28d70'};
const clamp=v=>Math.max(0,Math.min(1,v));
function noise(n){let v=Math.imul(n^(n>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);return((v^(v>>>15))>>>0)/4294967296;}
function disc(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=color;ctx.fill();}
function path(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));}
const STARS=Array.from({length:120},(_,i)=>({x:noise(i*7+921),y:noise(i*11+7171),r:i%7===0?1.1:.55,p:noise(i+21)*TAU}));
export function drawOrbitStars(ctx,w,h,time=0,reduced=false){
  ctx.fillStyle=C.sky;ctx.fillRect(0,0,w,h);
  const haze=ctx.createRadialGradient(w*.6,h*.55,0,w*.6,h*.55,w*.7);haze.addColorStop(0,'#29403b35');haze.addColorStop(1,'#29403b00');ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);
  for(const [i,s]of STARS.entries()){
    const pulse=reduced?.55:(1+Math.sin(time*(.55+i%5*.13)+s.p))/2;
    ctx.globalAlpha=.15+pulse*pulse*.5;disc(ctx,s.x*w,s.y*h,s.r,C.light);
    if(i%13===0){ctx.globalAlpha=pulse**5*.2;ctx.strokeStyle=C.light;ctx.lineWidth=.65;path(ctx,[[s.x*w-3,s.y*h],[s.x*w+3,s.y*h]]);ctx.stroke();path(ctx,[[s.x*w,s.y*h-3],[s.x*w,s.y*h+3]]);ctx.stroke();}
  }ctx.globalAlpha=1;
}
// Deliberately faceted coastlines; no bitmap textures or external map requests.
const CONTINENTS=[
  [[-168,66],[-142,71],[-121,58],[-100,73],[-58,49],[-81,26],[-97,17],[-117,31],[-128,51]],
  [[-81,13],[-61,9],[-36,-8],[-49,-25],[-68,-55],[-76,-24]],
  [[-18,36],[10,37],[34,30],[51,10],[38,-13],[19,-35],[10,-21],[-5,4],[-17,17]],
  [[-11,36],[-8,59],[27,71],[46,62],[73,72],[129,59],[175,66],[152,45],[118,20],[107,-8],[90,8],[77,7],[56,27],[33,40],[20,35]],
  [[112,-12],[137,-10],[154,-26],[141,-40],[116,-33]],
  [[-51,83],[-22,76],[-42,59],[-61,68]],[[44,-13],[50,-18],[46,-27],[42,-20]],
];
// Clip each coast polygon to small longitude/latitude tiles. Coast vertices
// stay exact (no checkerboard shoreline), while the tiles follow the sphere.
function clipPolygon(points,axis,edge,sign){
  const result=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],av=(a[axis]-edge)*sign,bv=(b[axis]-edge)*sign;
    if(av>=0)result.push(a);
    if((av>=0)!==(bv>=0)){const t=av/(av-bv);result.push(a.map((v,j)=>v+(b[j]-v)*t));}
  }return result;
}
const MESH=[];
const polar=[[[ -180,74],[180,74],[180,90],[-180,90]],[[-180,-90],[180,-90],[180,-78],[-180,-78]]];
for(const continent of [...CONTINENTS,...polar]){
  const minX=Math.floor(Math.min(...continent.map(p=>p[0]))/6)*6,maxX=Math.max(...continent.map(p=>p[0]));
  const minY=Math.floor(Math.min(...continent.map(p=>p[1]))/6)*6,maxY=Math.max(...continent.map(p=>p[1]));
  for(let lat=minY;lat<maxY;lat+=6)for(let lon=minX;lon<maxX;lon+=6){
    let points=continent;for(const [axis,edge,sign]of [[0,lon,1],[0,lon+6,-1],[1,lat,1],[1,lat+6,-1]])points=clipPolygon(points,axis,edge,sign);
    if(points.length>=3)MESH.push({points,latitude:lat});
  }
}
function sphere(lon,lat,rotation,camera=0){const a=lon+rotation-camera,c=Math.cos(lat);return{x:Math.sin(a)*c,y:-Math.sin(lat),z:Math.cos(a)*c};}
export function sitePosition(site,time=0,{cx=500,cy=322,r=238,camera=0}={}){
  const p=sphere(siteLongitude(site),(.5-site.y)*Math.PI,dayPhase(time)*TAU,camera);
  return{x:cx+p.x*r,y:cy+p.y*r,visible:p.z>.08,depth:p.z};
}
const shadows=new WeakMap();
function terminator(ctx,camera){
  const angle=Math.round(camera*80)/80,previous=shadows.get(ctx);if(previous?.angle===angle)return previous.canvas;
  const canvas=previous?.canvas??ctx.canvas.ownerDocument.createElement('canvas');canvas.width=canvas.height=128;
  const c=canvas.getContext('2d'),pixels=c.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const nx=(x+.5)/64-1,ny=(y+.5)/64-1,z2=1-nx*nx-ny*ny;if(z2<=0)continue;
    const solar=nx*Math.cos(angle)+Math.sqrt(z2)*Math.sin(angle),i=(y*128+x)*4;
    pixels.data[i]=7;pixels.data[i+1]=16;pixels.data[i+2]=23;pixels.data[i+3]=Math.round(clamp(.5-solar*2.8)*158);
  }c.putImageData(pixels,0,0);shadows.set(ctx,{canvas,angle});return canvas;
}
function globe(ctx,cx,cy,r,o,{time=o.elapsed,camera=0,reducedMotion=false}={}){
  const rotation=dayPhase(time)*TAU,night=o.phase==='winter';
  const glow=ctx.createRadialGradient(cx,cy,r*.93,cx,cy,r*1.07);glow.addColorStop(0,'#759b8a00');glow.addColorStop(.6,'#8cbaa229');glow.addColorStop(1,'#759b8a00');disc(ctx,cx,cy,r*1.07,glow);
  const ocean=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);ocean.addColorStop(0,'#3f6264');ocean.addColorStop(1,'#182f35');disc(ctx,cx,cy,r,ocean);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
  for(const tile of MESH){const points=tile.points.map(([a,b])=>sphere(a*Math.PI/180,b*Math.PI/180,rotation,camera));if(points.every(p=>p.z<=0))continue;
    const mid=points.reduce((v,p)=>({x:v.x+p.x/points.length,y:v.y+p.y/points.length,z:v.z+p.z/points.length}),{x:0,y:0,z:0});
    const lit=clamp((mid.x*Math.cos(camera)+mid.z*Math.sin(camera))*.9+.18),base=Math.abs(tile.latitude)>72?[166,181,164]:[105,129,101];
    const shade=.46+lit*.52;
    ctx.fillStyle=`rgb(${base.map(v=>Math.round(v*shade)).join(',')})`;path(ctx,points.map(p=>[cx+p.x*r,cy+p.y*r]));ctx.closePath();ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.4;ctx.stroke();
  }
  // Cache a small, smoothly sampled sphere-lighting mask. Overlapping alpha
  // rectangles otherwise form a visible checkerboard and cost thousands of fills.
  ctx.drawImage(terminator(ctx,camera),cx-r,cy-r,r*2,r*2);
  // Narrow cloud streams curve with the surface and spin with the planet.
  ctx.strokeStyle='#d0d7bc';ctx.lineWidth=Math.max(1,r*.009);ctx.globalAlpha=.10;
  for(let k=0;k<7;k++){const points=[];for(let i=0;i<18;i++){const p=sphere((k*.91+i*.038)+rotation*.08,Math.sin(k*2.1)*.9+i*.006,rotation,camera);if(p.z>.08)points.push([cx+p.x*r*1.003,cy+p.y*r*1.003]);}if(points.length>1){path(ctx,points);ctx.stroke();}}
  ctx.globalAlpha=1;
  for(const c of o.civilizations){const site=SITES.find(s=>s.id===c.site),p=sitePosition(site,time,{cx,cy,r,camera});if(!p.visible)continue;
    const daylight=Math.sin(siteLongitude(site)+rotation),alpha=clamp(-daylight+.2);
    if(c.alive&&c.age>1){for(let i=0;i<c.age*3;i++){ctx.globalAlpha=alpha*.8;disc(ctx,p.x+(noise(i+c.age)*18-9)*r/238,p.y+(noise(i+31)*14-7)*r/238,.5+c.age*.08,C.gold);}}
  }ctx.globalAlpha=1;
  if(night){ctx.fillStyle='#111c1b8f';ctx.fillRect(cx-r,cy-r,r*2,r*2);
    const age=o.elapsed-o.lastCatastropheAt;
    if(!reducedMotion&&age<R.nuclearVisualSeconds)for(const c of o.civilizations){const p=sitePosition(SITES.find(s=>s.id===c.site),time,{cx,cy,r,camera});if(p.visible){ctx.globalAlpha=clamp(1-age/R.nuclearVisualSeconds)*.4;disc(ctx,p.x,p.y,8+age*r*.035,'#d8c195');}}
  }
  ctx.restore();ctx.globalAlpha=1;ctx.strokeStyle='#b4cbb52b';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.stroke();
}
export function habitatSegments(rank){return Array.from({length:rank},(_,i)=>({start:-2.6+i*1.72,end:-1.9+i*1.72}));}
function habitat(ctx,cx,cy,r,rank,front){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-.28);const rx=r*1.28,ry=r*.36;
  ctx.strokeStyle='#adc3a82a';ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,front?0:Math.PI,front?Math.PI:TAU);ctx.stroke();
  for(const segment of habitatSegments(rank)){
    const pts=[];for(let t=segment.start;t<=segment.end;t+=.025){if((Math.sin(t)>=0)!==front)continue;pts.push([Math.cos(t)*rx,Math.sin(t)*ry]);}
    if(pts.length<2)continue;path(ctx,pts);ctx.strokeStyle='#192725';ctx.lineWidth=r*.038;ctx.stroke();ctx.strokeStyle='#899d8b';ctx.lineWidth=r*.020;ctx.stroke();
    for(let i=1;i<pts.length;i+=4){disc(ctx,pts[i][0],pts[i][1],Math.max(.75,r*.0035),C.gold);}
  }ctx.restore();
}
export function drawOrbitalColony(ctx,width,height,o,{reducedMotion=false,ambientTime=o.elapsed}={}){
  ctx.save();ctx.scale(width/1000,height/620);drawOrbitStars(ctx,1000,620,ambientTime,reducedMotion);
  const time=reducedMotion?0:o.elapsed;
  habitat(ctx,500,322,238,o.talents.recovery,false);globe(ctx,500,322,238,o,{time,reducedMotion});habitat(ctx,500,322,238,o.talents.recovery,true);
  for(const w of o.wars){const points=w.participants.map(id=>sitePosition(SITES.find(s=>s.id===o.civilizations.find(c=>c.id===id).site),time));if(!points.every(p=>p.visible))continue;
    const[a,b]=points;ctx.strokeStyle=C.war;ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.lineDashOffset=reducedMotion?0:-ambientTime*3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-45,b.x,b.y);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.font='10px ui-monospace, monospace';ctx.fillStyle='#81968b';ctx.fillText('TERRA  /  '+(o.phase==='winter'?'核冬天':'文明观测'),38,572);
  ctx.fillText(`HABITAT  ${String(o.talents.recovery).padStart(2,'0')} / 03`,780,572);
  ctx.restore();
}
export function drawOrbitalTalentSky(ctx,width,height,o={elapsed:0,phase:'living',civilizations:[],talents:{recovery:0}},{ambientTime=0,reducedMotion=false}={}){
  drawOrbitStars(ctx,width,height,ambientTime,reducedMotion);
  const r=Math.max(width*.42,height*.58),cx=width*.5,cy=height+r*.42;
  const camera=reducedMotion?0:ambientTime*.014,time=reducedMotion?0:o.elapsed;
  habitat(ctx,cx,cy,r,o.talents.recovery,false);globe(ctx,cx,cy,r,o,{time,camera,reducedMotion});habitat(ctx,cx,cy,r,o.talents.recovery,true);
  const veil=ctx.createLinearGradient(0,0,0,height);veil.addColorStop(0,'#0b141950');veil.addColorStop(.55,'#0b141945');veil.addColorStop(1,'#0b141920');ctx.fillStyle=veil;ctx.fillRect(0,0,width,height);
}
export function drawLunarColony(ctx,width,height,o,{ambientTime=o.elapsed,reducedMotion=false}={}){
  ctx.save();drawOrbitStars(ctx,width,height,ambientTime,reducedMotion);
  const r=height*.62,cx=width*.70,cy=height*.66;
  const g=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);g.addColorStop(0,'#a8b09b');g.addColorStop(.5,'#687669');g.addColorStop(1,'#263633');disc(ctx,cx,cy,r,g);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
  for(let i=0;i<28;i++){const x=cx+(noise(i+60)*2-1)*r,y=cy+(noise(i+800)*2-1)*r,cr=3+noise(i+99)*r*.15;disc(ctx,x,y,cr,'#34443d40');ctx.strokeStyle='#d1d5bb15';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,cr,.4,2.7);ctx.stroke();}
  for(let i=0;i<1+(o.talents.lunarIndustry??0)*2;i++){
    const x=cx-r*.6+(i%5)*r*.24,y=cy+r*.12+Math.floor(i/5)*r*.16;
    ctx.fillStyle='#b2bdaa';ctx.fillRect(x,y-10,14,10);ctx.fillStyle='#405750';ctx.fillRect(x+16,y-7,17,6);ctx.fillStyle=C.gold;ctx.fillRect(x+4,y-7,3,2);
  }ctx.restore();ctx.restore();
}
