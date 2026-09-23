import { drawOrbitalScene, ORBITAL_SECONDS } from './orbital-scene.js';
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
export function habitatSegments(rank){
  return Array.from({length:Math.min(R.habitatSections,Math.max(0,rank))},(_,i)=>({start:i*TAU/R.habitatSections,end:(i+1)*TAU/R.habitatSections}));
}
// The habitat is a thin band that hugs the equator, not a Saturn-scale rail. It
// is lit from the same sun as the globe: a bright rim on the day side, window
// lights on the night side, and a dark silhouette where it crosses the planet.
const RING=Object.freeze({rx:1.13,ry:.19,tilt:-.1,width:.026});
function habitat(ctx,cx,cy,r,rank,front,{time=0,construction=1,reducedMotion=false}={}){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(RING.tilt);
  const rx=r*RING.rx,ry=r*RING.ry,band=Math.max(1.6,r*RING.width),spin=reducedMotion?0:time*TAU/900;
  const faces=t=>(Math.sin(t)>=0)===front,depth=front?1:.62,point=t=>[Math.cos(t)*rx,Math.sin(t)*ry];
  function arc(a,b,width,color,alpha=1){
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha*depth;ctx.lineCap='round';
    let run=[];const flush=()=>{if(run.length>1){path(ctx,run);ctx.stroke();}run=[];};
    for(let t=a;t<=b+1e-9;t+=Math.min(.02,b-a||.02)){if(faces(t))run.push(point(t));else flush();if(t===b)break;}
    if(faces(b))run.push(point(b));flush();ctx.globalAlpha=1;
  }
  // The surveyed orbit shows where the remaining sections will go.
  ctx.setLineDash([1.5,5]);arc(0,TAU,.7,'#a9c2ad',.2);ctx.setLineDash([]);
  const segments=habitatSegments(rank);let builtEnd=spin;
  for(const [i,segment]of segments.entries()){
    const a=segment.start+spin,b=a+(segment.end-segment.start)*(i===rank-1?construction:1);builtEnd=b;
    if(front)arc(a,b,band+2.6,'#081315',.85);
    arc(a,b,band,'#58726a');
    // Sunlit rim and night-side windows, sampled along the section.
    for(let t=a;t<b;t+=.024){if(!faces(t))continue;const[x,y]=point(t),sun=Math.cos(t+RING.tilt);
      if(sun>-.15){const[nx,ny]=point(Math.min(b,t+.026));ctx.globalAlpha=clamp(sun*.75+.25)*.75*depth;ctx.strokeStyle='#dfe3c6';ctx.lineWidth=Math.max(.7,band*.3);
        path(ctx,[[x,y-band*.3],[nx,ny-band*.3]]);ctx.stroke();}
      else if(Math.floor(t/.024)%2===0){ctx.globalAlpha=clamp(-sun*1.4)*.85*depth;disc(ctx,x,y,Math.max(.55,band*.16),'#e4cf8e');}
    }ctx.globalAlpha=1;
    // Docking hubs at the joints make each purchased section readable.
    for(const t of [a,b])if(faces(t)){const[x,y]=point(t);ctx.globalAlpha=depth;disc(ctx,x,y,band*.95,'#1a2c2b');disc(ctx,x,y,band*.62,'#9db3a3');disc(ctx,x,y,band*.24,'#e2d7a6');ctx.globalAlpha=1;}
  }
  if(rank&&construction<1&&faces(builtEnd)){
    const[x,y]=point(builtEnd);ctx.setLineDash([1,3]);arc(builtEnd,builtEnd+.16,band*.5,'#d9cf9d',.45);ctx.setLineDash([]);
    const glow=ctx.createRadialGradient(x,y,0,x,y,band*3.2);glow.addColorStop(0,'#f2e3aa'+'cc');glow.addColorStop(1,'#f2e3aa00');disc(ctx,x,y,band*3.2,glow);
  }
  // Two shuttles run along the finished length.
  if(rank){const length=builtEnd-spin;for(let k=0;k<2;k++){const t=spin+length*(reducedMotion?.3+k*.4:((time*.02+k*.5)%1));if(faces(t)){const[x,y]=point(t);ctx.globalAlpha=depth;disc(ctx,x,y,band*.9,'#dfe6cc40');disc(ctx,x,y,band*.35,'#f1ecd0');ctx.globalAlpha=1;}}}
  ctx.restore();
}
// A small tidally locked moon in the Earth scene: the whole system is one frame,
// and each cargo capsule arriving from it is production made visible.
function companionMoon(ctx,o,cx,cy,r,{time,ambient,reducedMotion}){
  const x=cx+r*1.62,y=cy-r*.92,m=r*.15;
  const g=ctx.createLinearGradient(x-m,y,x+m,y);g.addColorStop(0,'#26383a');g.addColorStop(.45,'#7d8d81');g.addColorStop(1,'#b3bca8');disc(ctx,x,y,m,g);
  ctx.strokeStyle='#b3c0aa40';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(x,y,m,0,TAU);ctx.stroke();
  // Before the outpost the route is only a dashed line to an empty moon.
  if(!o.talents.outpost){ctx.setLineDash([2,6]);ctx.strokeStyle='#c9c19a55';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-m*.8,y+m*.5);
    ctx.quadraticCurveTo((x+cx+r*.62)/2,(y+cy-r*.78)/2-r*.12,cx+r*.62,cy-r*.78);ctx.stroke();ctx.setLineDash([]);return;}
  const level=o.talents.lunarIndustry;
  for(let i=0;i<4+level*3;i++){ctx.globalAlpha=.55+noise(i+77)*.4;disc(ctx,x-m*.55+noise(i+5)*m*.35,y-m*.15+noise(i+9)*m*.45,.7,'#e5d192');}ctx.globalAlpha=1;
  if(reducedMotion)return;
  const interval=6/(1+level)/(o.talents.massDriver?2:1),target=[cx+r*.62,cy-r*.78];
  for(let k=0;k<3;k++){const t=((ambient/interval)+k/3)%1,ease=t*t*(3-2*t);
    const px=x+(target[0]-x)*ease,py=y+(target[1]-y)*ease-Math.sin(t*Math.PI)*r*.12;
    ctx.globalAlpha=Math.sin(t*Math.PI)*.9;disc(ctx,px,py,2.2,'#e9d99b30');disc(ctx,px,py,.9,'#f3e7b8');}
  ctx.globalAlpha=1;
}
export function drawOrbitalColony(ctx,width,height,o,{reducedMotion=false,ambientTime=o.elapsed,construction=1}={}){
  ctx.save();ctx.scale(width/1000,height/620);drawOrbitStars(ctx,1000,620,ambientTime,reducedMotion);
  const time=reducedMotion?0:o.elapsed;
  if(o.talents.transit)companionMoon(ctx,o,500,322,238,{time,ambient:ambientTime,reducedMotion});
  habitat(ctx,500,322,238,o.talents.recovery,false,{time,construction,reducedMotion});globe(ctx,500,322,238,o,{time,reducedMotion});habitat(ctx,500,322,238,o.talents.recovery,true,{time,construction,reducedMotion});
  for(const w of o.wars){const points=w.participants.map(id=>sitePosition(SITES.find(s=>s.id===o.civilizations.find(c=>c.id===id).site),time));if(!points.every(p=>p.visible))continue;
    const[a,b]=points;ctx.strokeStyle=C.war;ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.lineDashOffset=reducedMotion?0:-ambientTime*3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-45,b.x,b.y);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.font='10px ui-monospace, monospace';ctx.fillStyle='#81968b';ctx.fillText('TERRA  /  '+(o.phase==='winter'?'核冬天':'文明观测'),38,572);
  ctx.fillText(`HABITAT  ${String(o.talents.recovery).padStart(2,'0')} / 07`,780,572);
  ctx.restore();
}
// Exactly the quiet horizon at the end of the surface departure sequence.
// No planet spin, star animation or simulation clock behind the talent tree.
export function drawOrbitalTalentSky(ctx,width,height){drawOrbitalScene(ctx,width,height,ORBITAL_SECONDS);}

// The base grows outward from one landing site. Positions are fixed on the
// surface: the moon is tidally locked, so the sun, not the ground, moves.
export function lunarFacilities(level){
  return Array.from({length:3+level*2},(_,i)=>{const angle=i*2.39996,spread=i?.1+.085*Math.sqrt(i):0;
    return{longitude:.22+Math.cos(angle)*spread,latitude:-.12+Math.sin(angle)*spread*.8,kind:i%3===0?'hub':i%3===1?'array':'factory'};});
}
export function lunarRotation(time){return dayPhase(time*120/R.lunarRotationSeconds)*TAU;}
// Sun angle over one lunar day: from a lit right limb through full to a lit left
// limb, never a pitch-black new moon, so both the fields and the lights show.
const lunarSun=(time,reduced)=>reduced?.78:Math.PI/2+Math.sin(lunarRotation(time))*1.2;
const lunarDark=(p,sun)=>clamp(.5-(p.x*Math.cos(sun)+p.z*Math.sin(sun))*2.8);
function surfacePatch(ctx,cx,cy,r,p,draw){
  ctx.save();ctx.translate(cx+p.x*r,cy+p.y*r);ctx.rotate(Math.atan2(p.y,p.x));ctx.scale(Math.max(.14,p.z),1);draw();ctx.restore();
}
export function drawLunarColony(ctx,width,height,o,{ambientTime=o.elapsed,reducedMotion=false}={}){
  ctx.save();drawOrbitStars(ctx,width,height,ambientTime,reducedMotion);
  const mobile=width<620,r=mobile?Math.min(width*.35,height*.28):Math.min(height*.40,width*.21),cx=width*(mobile?.53:.76),cy=height*(mobile?.70:.51);
  const sun=lunarSun(o.elapsed,reducedMotion),level=o.talents.lunarIndustry,site=(lon,lat)=>sphere(lon,lat,0);
  const halo=ctx.createRadialGradient(cx,cy,r*.98,cx,cy,r*1.07);halo.addColorStop(0,'#8ea89821');halo.addColorStop(1,'#8ea89800');disc(ctx,cx,cy,r*1.07,halo);
  const g=ctx.createRadialGradient(cx-r*.25,cy-r*.3,r*.1,cx,cy,r);g.addColorStop(0,'#a9b3a1');g.addColorStop(.7,'#7f8f83');g.addColorStop(1,'#56675f');disc(ctx,cx,cy,r,g);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
  // Dark maria first, then craters with a shadowed floor and a sunward rim.
  for(let i=0;i<6;i++)for(let k=0;k<3;k++){const p=site((noise(i+401)*2-1)*1.2+(noise(i*5+k)-.5)*.35,(noise(i+433)*2-1)*.85+(noise(i*7+k+50)-.5)*.3);if(p.z<=0)continue;
    const mr=r*(.09+noise(i*3+k+457)*.12);surfacePatch(ctx,cx,cy,r,p,()=>{const soft=ctx.createRadialGradient(0,0,0,0,0,mr);soft.addColorStop(0,'#3a4c4633');soft.addColorStop(.7,'#3a4c4626');soft.addColorStop(1,'#3a4c4600');disc(ctx,0,0,mr,soft);});}
  for(let i=0;i<70;i++){const p=site((noise(i+17)*2-1)*1.5,(noise(i+222)*2-1)*1.35);if(p.z<=.02)continue;const cr=(.01+noise(i+903)**3*.055)*r;
    surfacePatch(ctx,cx,cy,r,p,()=>{const floor=ctx.createRadialGradient(-cr*.2,0,0,0,0,cr);floor.addColorStop(0,'#2b3c3848');floor.addColorStop(1,'#2b3c3810');disc(ctx,0,0,cr,floor);
      ctx.strokeStyle='#e2e6d044';ctx.lineWidth=Math.max(.6,r*.004);ctx.beginPath();ctx.arc(0,0,cr,-.9,.9);ctx.stroke();});}
  // Industry reads from orbit as ground marks: mining scars, reflective solar
  // fields and roads between sites. Buildings are too small to see from here.
  const sites=lunarFacilities(level).map(f=>({...f,p:site(f.longitude,f.latitude)})),s=r*.05;
  ctx.strokeStyle='#cfd2bb';ctx.lineWidth=.7;
  for(let i=1;i<sites.length;i++){const a=sites[i].p,b=sites[Math.floor((i-1)/2)].p;if(a.z<=0||b.z<=0)continue;ctx.globalAlpha=.2;path(ctx,[[cx+a.x*r,cy+a.y*r],[cx+b.x*r,cy+b.y*r]]);ctx.stroke();}
  ctx.globalAlpha=1;
  for(const [i,f]of sites.entries()){if(f.p.z<=0)continue;const lit=1-lunarDark(f.p,sun);surfacePatch(ctx,cx,cy,r,f.p,()=>{
    if(f.kind==='array'){ // reflective panel rows; they glint in sunlight
      ctx.fillStyle='#a9c0c2';for(let row=0;row<3;row++)for(let col=0;col<4;col++){ctx.globalAlpha=.25+lit*.45;ctx.fillRect(-s*.95+col*s*.5+row*s*.12,-s*.5+row*s*.36,s*.4,s*.24);}}
    else if(f.kind==='factory'){ // a pale mining scar of overlapping regolith blobs
      for(let k=0;k<4;k++){const bx=(noise(i*9+k)-.5)*s*1.6,by=(noise(i*11+k+3)-.5)*s,br=s*(.45+noise(i*13+k)*.5);
        const scar=ctx.createRadialGradient(bx,by,0,bx,by,br);scar.addColorStop(0,'#d6d6c066');scar.addColorStop(1,'#d6d6c000');disc(ctx,bx,by,br,scar);}
      ctx.strokeStyle='#2f3d3999';ctx.lineWidth=.8;path(ctx,[[-s*.5,s*.1],[s*.1,-s*.15],[s*.55,.0]]);ctx.stroke();}
    else{ // a hub: a few small building footprints, no outline
      for(let k=0;k<5;k++){ctx.globalAlpha=.7;ctx.fillStyle=k%2?'#c7ccb7':'#aab4a2';const w=s*(.22+noise(i+k*17)*.25),h=s*(.16+noise(i+k*23)*.18);
        ctx.fillRect((noise(i+k*31)-.5)*s*1.1-w/2,(noise(i+k*37)-.5)*s*.8-h/2,w,h);}}
    ctx.globalAlpha=1;});}
  ctx.drawImage(terminator(ctx,sun),cx-r,cy-r,r*2,r*2);
  // City lights come up where the base has fallen into night.
  for(const f of sites){if(f.p.z<=0)continue;const dark=lunarDark(f.p,sun);if(dark<.05)continue;const n=f.kind==='hub'?10:f.kind==='factory'?6:3;
    for(let k=0;k<n;k++){const x=cx+f.p.x*r+(noise(k*13+f.longitude*977|0)-.5)*s*2.4*f.p.z,y=cy+f.p.y*r+(noise(k*29+f.latitude*613|0)-.5)*s*1.8;
      ctx.globalAlpha=dark*.18;disc(ctx,x,y,2.6,'#e8cf8a');ctx.globalAlpha=dark*(.6+noise(k+3)*.4);disc(ctx,x,y,.8,'#f2dea0');}}
  ctx.globalAlpha=1;ctx.restore();
  ctx.strokeStyle='#acbca455';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.stroke();
  // The mass driver: a straight track from the first site, launching cargo at a
  // rate that rises with the factory level.
  const hub=sites[0].p,hx=cx+hub.x*r,hy=cy+hub.y*r,dir=[-.82,-.57],track=r*.34,tx=hx+dir[0]*track,ty=hy+dir[1]*track;
  ctx.strokeStyle='#d9d2a6';ctx.globalAlpha=.55;ctx.lineWidth=1;path(ctx,[[hx,hy],[tx,ty]]);ctx.stroke();ctx.globalAlpha=1;
  const interval=6/(1+level)/(o.talents.massDriver?2:1);
  for(let k=0;k<4;k++){const t=reducedMotion?.25+k*.2:((ambientTime/interval)+k/4)%1;
    const on=t<.25,d=on?t/.25:1+(t-.25)/.75*2.2,x=hx+dir[0]*track*d,y=hy+dir[1]*track*d;
    ctx.globalAlpha=on?.9:Math.max(0,.9-(t-.25)/.75);disc(ctx,x,y,3,'#efdfa434');disc(ctx,x,y,1.1,'#f6ebc2');}
  ctx.globalAlpha=1;
  ctx.fillStyle='#9baf9e';ctx.font='9px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText(`LUNA  /  ${String(sites.length).padStart(2,'0')} FACILITIES`,cx,cy+r+25);ctx.restore();
}
