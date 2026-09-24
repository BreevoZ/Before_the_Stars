// The same visual vocabulary as Earth and the Moon: broad muted regions,
// shallow craters and a soft night mask. All marks live on a rotating sphere;
// there are no raster surface textures or screen-space scrolling stripes.
import { surfaceOf } from './solar-bodies.js';
import { drawEarthSphere } from './orbital-render.js';
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const noise=n=>{n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return((n^(n>>>15))>>>0)/4294967296;};
const disc=(c,x,y,r,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();};
const path=(c,points)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));};
// Shared with surface settlements: marks on the far hemisphere have z < 0.
export function surfacePoint(lon,lat,spin=0,tilt=0){
  const a=lon+spin,c=Math.cos(lat),x=Math.sin(a)*c,y=-Math.sin(lat),ct=Math.cos(tilt),st=Math.sin(tilt);
  return{x:x*ct+y*st,y:-x*st+y*ct,z:Math.cos(a)*c};
}
export const spinOf=(body,time)=>time/(surfaceOf(body).spin??180)*TAU;
// Clip small surface polygons against the horizon before projecting them.
function polygon(c,points,r,color){
  const visible=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];if(a.z>=0)visible.push(a);
    if((a.z>=0)!==(b.z>=0)){const t=a.z/(a.z-b.z);visible.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
  }
  if(visible.length<3)return;path(c,visible.map(p=>({x:p.x*r,y:p.y*r})));c.closePath();c.fillStyle=color;c.fill();
}
function patch(c,r,spin,tilt,lon,lat,rx,ry,color,seed=0,ragged=0){
  const points=Array.from({length:36},(_,i)=>{const a=i/36*TAU,k=1+ragged*Math.sin(a*5+seed);return surfacePoint(lon+Math.cos(a)*rx*k/Math.max(.3,Math.cos(lat)),lat+Math.sin(a)*ry*k,spin,tilt);});
  polygon(c,points,r,color);
}
// A broad latitude zone, with just a small amount of cloud motion. Include
// the limb between its two edges so the strip follows the globe exactly.
function band(c,r,spin,tilt,lo,hi,color,wave=.004,phase=0){
  const points=[],edge=(lon,lat)=>surfacePoint(lon,lat+wave*(Math.sin((lon-spin)*5+phase)+.3*Math.sin((lon-spin)*9)),0,tilt);
  for(let i=0;i<=64;i++)points.push(edge(-Math.PI/2+i*Math.PI/64,hi));
  for(let i=1;i<=12;i++)points.push(edge(Math.PI/2,hi+(lo-hi)*i/12));
  for(let i=1;i<=64;i++)points.push(edge(Math.PI/2-i*Math.PI/64,lo));
  for(let i=1;i<12;i++)points.push(edge(-Math.PI/2,lo+(hi-lo)*i/12));
  polygon(c,points,r,color);
}
const PALETTES={
  jupiter:['#c9b99c','#b1a186','#817967'],saturn:['#cec5a2','#b7ad8b','#85816d'],
  uranus:['#a9c8c3','#8eafad','#638784'],neptune:['#779cae','#587f95','#3b596f'],
  mars:['#b08d71','#97765f','#66594e'],mercury:['#aaa795','#898c7e','#586961'],
  venus:['#c6bc98','#afa884','#788573'],titan:['#b7ad86','#a49a73','#717761'],
};
function gas(c,body,r,spin,tilt){
  if(body.id==='jupiter'){
    for(const [lo,hi,color] of [[.76,1.4,'#8e897842'],[.46,.66,'#a9998155'],[.14,.34,'#9e8268aa'],[-.13,.09,'#d4c5a266'],[-.37,-.17,'#a48568aa'],[-.66,-.49,'#a4967b77'],[-1.4,-.83,'#92877455']])band(c,r,spin,tilt,lo,hi,color,.006,lo*10);
    // The Great Red Spot sits in the southern equatorial belt. Muted and
    // flattened, with a pale surrounding wake; not a concentric bullseye.
    patch(c,r,spin,tilt,.35,-.34,.23,.095,'#ceba9466');
    patch(c,r,spin,tilt,.35,-.34,.17,.063,'#a8785caa',2,.045);
    patch(c,r,spin,tilt,.37,-.33,.11,.033,'#b88e68aa');
    for(let i=0;i<7;i++)patch(c,r,spin,tilt,i*.91,-.50+(i%2)*.95,.055,.018,'#d9cdae45');
  }else if(body.id==='saturn'){
    for(const [lo,hi,color] of [[.62,1.2,'#a29e8350'],[.18,.39,'#cfc09a45'],[-.17,.12,'#ded1ac44'],[-.50,-.31,'#a79b7b40'],[-1.4,-.85,'#a29a7e45']])band(c,r,spin,tilt,lo,hi,color,.002);
    patch(c,r,spin,tilt,.8,.37,.42,.022,'#e2d7b125');
  }else if(body.id==='uranus'){
    band(c,r,spin,tilt,.55,1.5,'#d0ddd52a',.001);
    band(c,r,spin,tilt,-.18,.08,'#d0ddd510',.001);
    patch(c,r,spin,tilt,.4,.25,.30,.018,'#d2e0d31a');
  }else{
    band(c,r,spin,tilt,-.45,-.16,'#365b751e',.003);
    band(c,r,spin,tilt,.32,.55,'#a7bfbd14',.003);
    patch(c,r,spin,tilt,-.55,-.33,.14,.045,'#38586e44');
    for(const [lon,lat] of [[.35,.41],[-.65,-.2],[2.4,.36]])patch(c,r,spin,tilt,lon,lat,.24,.013,'#c1d0c745');
  }
}
function cloud(c,body,r,spin,tilt){
  // Venus and Titan read as veiled globes, without Jupiter-like belts.
  for(let i=0;i<9;i++)patch(c,r,spin,tilt,i*2.4,Math.sin(i*2)*.94,.55,.25,i%2?'#d9d0ab10':'#7679650e',i,.15);
  if(body.id==='venus')for(let i=0;i<3;i++)band(c,r,spin,tilt,-.7+i*.6,-.63+i*.6,'#dbd3af10',.065,i);
}
function tangent(c,p,r,draw){
  c.save();c.translate(p.x*r,p.y*r);c.rotate(Math.atan2(p.y,p.x));c.scale(Math.max(.025,p.z),1);draw();c.restore();
}
function rocky(c,body,r,spin,tilt){
  const seed=[...body.id].reduce((n,ch)=>n*31+ch.charCodeAt(0),0)>>>0;
  spin+=noise(seed)*TAU;
  const mars=body.id==='mars',ice=body.surface==='ice',volcanic=body.surface==='volcanic';
  if(mars){
    for(let i=0;i<10;i++)patch(c,r,spin,tilt,i*2.39,Math.sin(i*3.1+.4)*.7,.24+noise(i+6)*.2,.12+noise(i+71)*.15,'#665e4d44',i,.18);
    band(c,r,spin,tilt,1.39,Math.PI/2,'#d7d5ba99',.012);band(c,r,spin,tilt,-Math.PI/2,-1.41,'#d7d5ba99',.01);
    for(let i=0;i<5;i++)patch(c,r,spin,tilt,-.55+i*.12,-.16+i*.007,.09,.012,'#574c4040');
  }else for(let i=0;i<14;i++){
    const p=surfacePoint(i*2.4,Math.sin(i*1.3)*1.1,spin,tilt);if(p.z<=0)continue;
    const pr=r*(.08+noise(seed+i+457)*.12);tangent(c,p,r,()=>{const g=c.createRadialGradient(0,0,0,0,0,pr);g.addColorStop(0,volcanic?'#70634444':'#3a4c4633');g.addColorStop(.7,'#3a4c4620');g.addColorStop(1,'#3a4c4600');disc(c,0,0,pr,g);});
  }
  if(ice){
    // Sparse hairline fractures, projected with the ice instead of a noise map.
    for(let k=0;k<10;k++){
      const points=Array.from({length:22},(_,i)=>surfacePoint(k*.71+(i-11)*.025,Math.sin(k*2)*.9+(i-11)*.033+Math.sin(i*.4)*.025,spin,tilt));
      c.strokeStyle='#797c6838';c.lineWidth=Math.max(.4,r*.003);let open=false;c.beginPath();
      for(const p of points){if(p.z<=0){open=false;continue;}if(open)c.lineTo(p.x*r,p.y*r);else c.moveTo(p.x*r,p.y*r);open=true;}c.stroke();
    }
  }
  const count=Math.min(ice?14:mars?28:66,r<15?8:r<30?20:66);
  for(let i=0;i<count;i++){
    const p=surfacePoint(noise(seed+i+17)*TAU,Math.asin(noise(seed+i+222)*2-1),spin,tilt);if(p.z<=.02)continue;
    const cr=(.009+noise(seed+i+903)**3*(mars?.034:.06))*r;
    tangent(c,p,r,()=>{const g=c.createRadialGradient(-cr*.2,0,0,0,0,cr);g.addColorStop(0,'#2b3c3838');g.addColorStop(1,'#2b3c380a');disc(c,0,0,cr,g);
      c.strokeStyle='#e2e6d033';c.lineWidth=Math.max(.45,r*.003);c.beginPath();c.arc(0,0,cr,-.9,.9);c.stroke();});
  }
}
const masks=new WeakMap();
function nightMask(c,angle){
  let cache=masks.get(c);if(!cache){cache=new Map();masks.set(c,cache);}const key=Math.round(angle*80)/80;if(cache.has(key))return cache.get(key);
  const canvas=c.canvas.ownerDocument.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),image=ctx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const nx=(x+.5)/64-1,ny=(y+.5)/64-1,z2=1-nx*nx-ny*ny;if(z2<=0)continue;
    const light=(nx*Math.cos(key)+ny*Math.sin(key))*.94+Math.sqrt(z2)*.34,i=(y*128+x)*4;
    image.data[i]=7;image.data[i+1]=16;image.data[i+2]=23;image.data[i+3]=Math.round(clamp(.5-light*2.8)*158);
  }ctx.putImageData(image,0,0);if(cache.size>=12)cache.delete(cache.keys().next().value);cache.set(key,canvas);return canvas;
}
function rings(c,r,settings,front){
  c.save();c.rotate(settings.tilt);c.scale(1,.32);
  const count=settings.faint?5:110,step=(settings.outer-settings.inner)/count,start=front?0:Math.PI;
  for(let i=0;i<count;i++){
    const radius=settings.inner+(i+.5)*step;
    // One narrow Cassini division; the rest is a continuous, fine dust plane.
    if(!settings.faint&&radius>1.72&&radius<1.76)continue;
    const alpha=settings.faint?.12:(radius<1.4?.23:radius<1.72?.65:.42)*( .83+noise(i+441)*.17);
    c.strokeStyle=`rgba(187,182,153,${alpha})`;c.lineWidth=step*r*1.15;c.beginPath();c.arc(0,0,r*radius,start,start+Math.PI);c.stroke();
  }c.restore();
}
export function drawPlanetSphere(ctx,body,x,y,r,{time=0,sunAngle=-.4,reducedMotion=false}={}){
  if(body.id==='earth'){drawEarthSphere(ctx,x,y,r,{time,reducedMotion});return;}
  const profile=surfaceOf(body),spin=spinOf(body,reducedMotion?0:time),tilt=profile.tilt??.12;
  const palette=PALETTES[body.id]??(body.surface==='ice'?['#b8c3b5','#a0afa3','#697d76']:body.surface==='volcanic'?['#b8ae85','#9b9876','#697766']:['#a9b3a1','#7f8f83','#56675f']);
  ctx.save();ctx.translate(x,y);if(profile.rings)rings(ctx,r,profile.rings,false);
  if(profile.atmosphere){const glow=ctx.createRadialGradient(0,0,r*.97,0,0,r*1.07);glow.addColorStop(0,`${profile.atmosphere}00`);glow.addColorStop(.5,`${profile.atmosphere}20`);glow.addColorStop(1,`${profile.atmosphere}00`);disc(ctx,0,0,r*1.07,glow);}
  const g=ctx.createRadialGradient(-r*.25,-r*.3,r*.1,0,0,r);g.addColorStop(0,palette[0]);g.addColorStop(.7,palette[1]);g.addColorStop(1,palette[2]);disc(ctx,0,0,r,g);
  ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
  if(profile.surface==='gas')gas(ctx,body,r,spin,tilt);
  else if(profile.surface==='cloud')cloud(ctx,body,r,spin,tilt);
  else rocky(ctx,body,r,spin,tilt);
  ctx.drawImage(nightMask(ctx,sunAngle),-r,-r,r*2,r*2);ctx.restore();
  ctx.strokeStyle='#acbca42b';ctx.lineWidth=.65;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();
  if(profile.rings)rings(ctx,r,profile.rings,true);ctx.restore();
}
