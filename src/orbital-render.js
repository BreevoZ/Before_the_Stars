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
const orbitPoint=(angle,rx,ry)=>[Math.cos(angle)*rx,Math.sin(angle)*ry];
function habitat(ctx,cx,cy,r,rank,front,{time=0,construction=1,reducedMotion=false}={}){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-.28);
  const rx=r*1.31,ry=r*.39,rotation=.32+(reducedMotion?0:time*TAU/600),beam=r*.045;
  // A faint surveyed orbit is distinct from the constructed, three-dimensional deck.
  ctx.strokeStyle='#adc3a819';ctx.lineWidth=.7;ctx.setLineDash([2,7]);ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,front?0:Math.PI,front?Math.PI:TAU);ctx.stroke();ctx.setLineDash([]);
  function lineArc(start,end,width,color,offset=0){
    ctx.strokeStyle=color;ctx.lineWidth=width;const points=[],steps=Math.max(1,Math.ceil((end-start)/.018));for(let i=0;i<=steps;i++){const t=start+(end-start)*i/steps;if((Math.sin(t)>=0)!==front){if(points.length>1){path(ctx,points);ctx.stroke();}points.length=0;continue;}points.push(orbitPoint(t,rx+offset,ry+offset*.3));}
    if(points.length>1){ctx.strokeStyle=color;ctx.lineWidth=width;path(ctx,points);ctx.stroke();}
  }
  for(const [i,segment]of habitatSegments(rank).entries()){
    const end=segment.start+(segment.end-segment.start)*(i===rank-1?construction:1),start=segment.start+rotation,finish=end+rotation;
    lineArc(start,finish,beam+3,'#0b191c');lineArc(start,finish,beam,'#607c72');lineArc(start,finish,1,'#becab0',beam*.38);lineArc(start,finish,1,'#263d3c',-beam*.42);
    for(let a=start+.035;a<finish;a+=.060){if((Math.sin(a)>=0)!==front)continue;const[x,y]=orbitPoint(a,rx,ry);
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(Math.cos(a)*ry,-Math.sin(a)*rx));
      ctx.fillStyle='#233e3c';ctx.fillRect(-2,-beam*.4,1,beam*.8);
      ctx.fillStyle=i%2?'#b8c9ad':'#c6bc8b';ctx.globalAlpha=.65;ctx.fillRect(-1,-beam*.20,1.8,Math.max(1,beam*.16));ctx.globalAlpha=1;ctx.restore();
    }
    for(const offset of [.26,.68]){const a=start+(segment.end-segment.start)*offset;if(a>finish||(Math.sin(a)>=0)!==front)continue;
      const[x,y]=orbitPoint(a,rx,ry);ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(Math.sin(a)*.4,Math.cos(a)));
      ctx.fillStyle='#72968a';ctx.fillRect(-2,-1,beam*1.8,2);ctx.fillStyle='#294d4b';ctx.fillRect(beam*.75,-beam*.85,beam*1.3,beam*1.7);
      ctx.strokeStyle='#88a49b60';ctx.lineWidth=.65;ctx.strokeRect(beam*.75,-beam*.85,beam*1.3,beam*1.7);for(let n=0;n<3;n++){path(ctx,[[beam*.85,-beam*.5+n*beam*.5],[beam*1.94,-beam*.5+n*beam*.5]]);ctx.stroke();}ctx.restore();
    }
    for(const a of [start,finish])if((Math.sin(a)>=0)===front){const[x,y]=orbitPoint(a,rx,ry);ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(Math.cos(a)*ry,-Math.sin(a)*rx));ctx.fillStyle='#92a995';ctx.fillRect(-2,-beam*.65,4,beam*1.3);ctx.fillStyle='#d4c393';ctx.fillRect(-1,-beam*.15,2,2);ctx.restore();}
  }
  if(rank){const length=rank/R.habitatSections*TAU,angle=rotation+(reducedMotion?.22:(time*.035)%length);if((Math.sin(angle)>=0)===front){const[x,y]=orbitPoint(angle,rx,ry);disc(ctx,x,y,3,'#bdd3c02a');disc(ctx,x,y,1.2,'#dbe2bb');}}
  ctx.restore();
}
export function drawOrbitalColony(ctx,width,height,o,{reducedMotion=false,ambientTime=o.elapsed,construction=1}={}){
  ctx.save();ctx.scale(width/1000,height/620);drawOrbitStars(ctx,1000,620,ambientTime,reducedMotion);
  const time=reducedMotion?0:o.elapsed;
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

export function lunarFacilities(level){
  return Array.from({length:3+level*2},(_,i)=>({longitude:i*2.39996,latitude:Math.sin(i*1.7)*.62,kind:i%3===0?'hub':i%3===1?'array':'factory'}));
}
export function lunarRotation(time){return dayPhase(time*120/R.lunarRotationSeconds)*TAU;}
function lunarFacility(ctx,p,size,kind,time,reduced){
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(Math.max(.16,p.depth),.8);ctx.rotate(-.13);
  ctx.fillStyle='#152e2d48';ctx.beginPath();ctx.ellipse(4,7,size*1.6,size*.35,0,0,TAU);ctx.fill();
  const panel=(x,y)=>{ctx.fillStyle='#274e4d';ctx.fillRect(x,y,14,8);ctx.strokeStyle='#9fb7a050';ctx.lineWidth=.6;ctx.strokeRect(x,y,14,8);for(let i=1;i<4;i++){path(ctx,[[x+i*3.5,y],[x+i*3.5,y+8]]);ctx.stroke();}path(ctx,[[x,y+4],[x+14,y+4]]);ctx.stroke();};
  ctx.scale(size/15,size/15);
  panel(-27,-3);panel(13,-3);ctx.strokeStyle='#879f90';ctx.lineWidth=1;path(ctx,[[-14,1],[14,1]]);ctx.stroke();
  if(kind==='hub'){
    ctx.fillStyle='#9eafa0';ctx.beginPath();ctx.ellipse(0,-3,10,7,0,Math.PI,TAU);ctx.lineTo(10,4);ctx.lineTo(-10,4);ctx.closePath();ctx.fill();
    ctx.fillStyle='#314f4b';ctx.fillRect(-10,2,20,4);ctx.strokeStyle='#c3cbb2';path(ctx,[[0,-10],[0,1]]);ctx.stroke();
    ctx.strokeStyle='#a2b7a4';path(ctx,[[8,-3],[12,-17],[18,-17]]);ctx.stroke();disc(ctx,18,-17,1,'#d2c496');
  }else{
    ctx.fillStyle='#536f65';ctx.fillRect(-10,-8,20,13);ctx.fillStyle='#b1bda6';path(ctx,[[-10,-8],[-4,-13],[14,-13],[10,-8]]);ctx.closePath();ctx.fill();ctx.fillStyle='#81998a';path(ctx,[[10,-8],[14,-13],[14,0],[10,5]]);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#b3c7b0';ctx.lineWidth=1;path(ctx,[[-6,-8],[-6,-19],[1,-19]]);ctx.stroke();
    if(kind==='factory'){const angle=reduced?-.4:Math.sin(time*.5)*.35;ctx.save();ctx.translate(-6,-19);ctx.rotate(angle);path(ctx,[[0,0],[14,0],[14,10]]);ctx.stroke();ctx.restore();}
  }
  ctx.fillStyle='#d6cc9d';for(let i=0;i<3;i++)ctx.fillRect(-7+i*5,-3,2,2);ctx.restore();
}
export function drawLunarColony(ctx,width,height,o,{ambientTime=o.elapsed,reducedMotion=false}={}){
  ctx.save();drawOrbitStars(ctx,width,height,ambientTime,reducedMotion);
  const mobile=width<620,r=mobile?Math.min(width*.35,height*.28):Math.min(height*.40,width*.21),cx=width*(mobile?.53:.76),cy=height*(mobile?.70:.51),rotation=lunarRotation(reducedMotion?0:o.elapsed);
  const halo=ctx.createRadialGradient(cx,cy,r*.98,cx,cy,r*1.07);halo.addColorStop(0,'#8ea89821');halo.addColorStop(1,'#8ea89800');disc(ctx,cx,cy,r*1.07,halo);
  const g=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);g.addColorStop(0,'#a0ae9c');g.addColorStop(.6,'#637b70');g.addColorStop(1,'#263e3b');disc(ctx,cx,cy,r,g);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
  // Craters are attached to spherical coordinates, foreshortened at the limb.
  for(let i=0;i<70;i++){
    const p=sphere(noise(i+17)*TAU,(noise(i+222)*2-1)*1.42,rotation);if(p.z<=0)continue;
    const cr=(.022+noise(i+903)*.11)*r,x=cx+p.x*r,y=cy+p.y*r;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(-p.y,p.x));ctx.scale(Math.max(.08,p.z),1);
    disc(ctx,0,0,cr,'#243f3a24');ctx.strokeStyle='#c4d0b323';ctx.lineWidth=Math.max(.7,r*.006);ctx.beginPath();ctx.arc(0,0,cr,.4,2.9);ctx.stroke();disc(ctx,cr*.1,cr*.08,cr*.7,'#334b4225');ctx.restore();
  }
  ctx.drawImage(terminator(ctx,.32),cx-r,cy-r,r*2,r*2);
  const facilities=lunarFacilities(o.talents.lunarIndustry).map(f=>{const p=sphere(f.longitude,f.latitude,rotation);return{...f,x:cx+p.x*r,y:cy+p.y*r,depth:p.z};}).filter(p=>p.depth>.12).sort((a,b)=>a.depth-b.depth);
  ctx.strokeStyle='#b7c8a235';ctx.lineWidth=1;ctx.setLineDash([2,3]);for(let i=1;i<facilities.length;i++)if(Math.hypot(facilities[i].x-facilities[i-1].x,facilities[i].y-facilities[i-1].y)<r){path(ctx,[[facilities[i].x,facilities[i].y],[facilities[i-1].x,facilities[i-1].y]]);ctx.stroke();}ctx.setLineDash([]);
  for(const p of facilities)lunarFacility(ctx,p,r*.13,p.kind,ambientTime,reducedMotion);
  ctx.restore();ctx.strokeStyle='#acbca455';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.stroke();
  ctx.fillStyle='#9baf9e';ctx.font='9px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText(`LUNA  /  ${String(lunarFacilities(o.talents.lunarIndustry).length).padStart(2,'0')} FACILITIES`,cx,cy+r+25);ctx.restore();
}
