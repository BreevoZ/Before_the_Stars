import { drawOrbitalSky } from './orbital-scene.js';
import { ARK_COUNT, arkSite, drawArkLight } from './ark-lights.js';

export const VOYAGE_SECONDS = 30;
export const VOYAGE_ARRIVAL = 26;
// One distant sun lights both the lunar disc and the Earth's atmospheric limb.
export const VOYAGE_SUN = Object.freeze({x:.68,y:-.38,z:.63});
const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const disc=(c,x,y,r,color)=>{c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle=color;c.fill();};
export function voyageFrame(seconds,reduced=false){
  const time=reduced?VOYAGE_SECONDS:Math.max(0,Math.min(VOYAGE_SECONDS,seconds));
  // The Moon comes out of the dark in two stages: first a faint earthlit
  // silhouette while the tree fades, then sunlight spreads across its face.
  return {time,treeOpacity:1-ease(time/4.5),camera:ease((time-2)/22),
    moonReveal:ease((time-.8)/7.5),moonLight:ease((time-3)/9),dawn:ease((time-4)/10)*(1-.45*ease((time-21)/9)),
    marsReveal:ease((time-6)/6),
    arrival:ease((time-VOYAGE_ARRIVAL)/2),actions:ease((time-28)/2),complete:time>=VOYAGE_SECONDS};
}
export function voyageGeometry(seconds,w,h){
  const f=voyageFrame(seconds);
  // The Moon is already in the sky. Tiny parallax and a lowering foreground
  // replace the former large upward translation; it never pops up or grows.
  return {moon:{x:w*(w<600?.60:.64),y:h*(.75-f.camera*.035),r:Math.min(w*.095,h*.115)},
    earth:{x:w*.5,y:h*(.90+f.camera*.035)+Math.max(w*.8,h*1.2),r:Math.max(w*.8,h*1.2)}};
}
function pointOnRoute(start,end,t,h){
  const u=1-t,c1={x:start.x+(end.x-start.x)*.12,y:start.y-h*.13},c2={x:end.x-(end.x-start.x)*.16,y:end.y+h*.22};
  return {x:u**3*start.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t**3*end.x,y:u**3*start.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t**3*end.y};
}
// Mars: a small warm star high on the left, where the whole fleet is bound.
export const voyageMars=(w,h)=>({x:w*(w<600?.2:.26),y:h*.15});
// The seven arks gather into a small arrowhead formation as they near Mars.
const FORMATION=[[0,0],[-1,1],[1,1],[-2,2],[2,2],[-1,3],[1,3]];
export function arkPose(index,seconds,w,h){
  const f=voyageFrame(seconds),m=voyageGeometry(f.time,w,h).moon,p=arkSite(index),mars=voyageMars(w,h);
  const launchX=m.x+p.x*m.r,launchY=m.y+p.y*m.r,delay=8+index*.8;
  const flight=clamp((f.time-delay)/12),travel=ease(flight),gap=Math.min(w,h)*.016,[fx,fy]=FORMATION[index];
  // An arrowhead pointing at Mars, held a little short of it so the red star
  // stays visible: back runs from Mars towards the Moon, side across it.
  const bx=m.x-mars.x,by=m.y-mars.y,len=Math.hypot(bx,by),back={x:bx/len,y:by/len},side={x:-back.y,y:back.x},lead=Math.min(w,h)*.055+fy*gap;
  const targetX=mars.x+back.x*lead+side.x*fx*gap,targetY=mars.y+back.y*lead+side.y*fx*gap;
  const start={x:launchX,y:launchY},end={x:targetX,y:targetY},point=pointOnRoute(start,end,travel,h);
  const tail=pointOnRoute(start,end,Math.max(0,travel-.055*ease(flight*7)),h);
  return {...point,flight,ignition:ease((f.time-delay+2)/2),launchX,launchY,targetX,targetY,tail,
    radius:1.25-flight*.4,brightness:1-flight*.1};
}
const masks=new WeakMap();
export function voyageIllumination(x,y,z=0){return clamp(x*VOYAGE_SUN.x+y*VOYAGE_SUN.y+z*VOYAGE_SUN.z);}
function lunarShadow(ctx){
  if(masks.has(ctx))return masks.get(ctx);
  const canvas=ctx.canvas.ownerDocument.createElement('canvas'),size=192;canvas.width=canvas.height=size;
  const c=canvas.getContext('2d'),pixels=c.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x+.5-size/2)/(size/2),ny=(y+.5-size/2)/(size/2),rr=nx*nx+ny*ny;if(rr>1)continue;
    const lit=voyageIllumination(nx,ny,Math.sqrt(1-rr)),i=(y*size+x)*4;
    pixels.data[i]=8;pixels.data[i+1]=19;pixels.data[i+2]=22;pixels.data[i+3]=Math.round((.94-.94*lit**.65)*255);
  }
  c.putImageData(pixels,0,0);masks.set(ctx,canvas);return canvas;
}
function moon(ctx,m,reveal,light){
  ctx.save();
  // A wide, faint halo arrives with the sunlight, so the disc never cuts in hard.
  const halo=ctx.createRadialGradient(m.x,m.y,m.r*.9,m.x,m.y,m.r*2.4);halo.addColorStop(0,`rgba(214,214,180,${.07*light*reveal})`);halo.addColorStop(1,'rgba(214,214,180,0)');
  ctx.fillStyle=halo;ctx.fillRect(m.x-m.r*2.4,m.y-m.r*2.4,m.r*4.8,m.r*4.8);
  ctx.globalAlpha=reveal;disc(ctx,m.x,m.y,m.r,'#9ba58e');
  ctx.beginPath();ctx.arc(m.x,m.y,m.r,0,TAU);ctx.clip();
  // Soft lunar maria, with a handful of shallow crater rims. No surface props.
  for(let i=0;i<11;i++){
    const a=i*2.39996,q=Math.sqrt((i+.5)/12)*m.r*.85,x=m.x+Math.cos(a)*q,y=m.y+Math.sin(a)*q,r=m.r*(.10+i%3*.025);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#344c3f38');g.addColorStop(1,'#344c3f00');disc(ctx,x,y,r,g);
    ctx.strokeStyle='#d2d6b916';ctx.lineWidth=.55;ctx.beginPath();ctx.arc(x,y,r*.6,-1.2,.15);ctx.stroke();
  }
  ctx.drawImage(lunarShadow(ctx),m.x-m.r,m.y-m.r,m.r*2,m.r*2);
  // Before the sun reaches it the whole face is only earthlit.
  if(light<1)disc(ctx,m.x,m.y,m.r,`rgba(9,19,23,${.82*(1-light)})`);
  ctx.restore();
}
function mars(ctx,p,reveal){
  if(reveal<=0)return;ctx.save();ctx.globalAlpha=reveal;
  const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,9);g.addColorStop(0,'#f0b28c80');g.addColorStop(.35,'#c07a5a2e');g.addColorStop(1,'#c07a5a00');disc(ctx,p.x,p.y,9,g);disc(ctx,p.x,p.y,1.6,'#f2c4a2');ctx.restore();
}
function earth(ctx,e,w,h,dawn){
  // Atmospheric scattering is strongest on the same upper-right side as the Moon.
  ctx.save();const glow=ctx.createRadialGradient(w*.79,h*1.04,0,w*.79,h*1.04,h*.48);
  glow.addColorStop(0,`rgba(224,208,158,${.13+dawn*.22})`);glow.addColorStop(.35,`rgba(143,160,129,${.04+dawn*.08})`);glow.addColorStop(1,'#76968d00');
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  disc(ctx,e.x,e.y,e.r,'#0b171c');
  for(let i=0;i<100;i++){
    const a=Math.PI+i*Math.PI/100,b=a+Math.PI/100+.002,light=voyageIllumination(Math.cos(a),Math.sin(a));
    ctx.globalAlpha=.10+light*(.30+dawn*.6);ctx.strokeStyle='#c6c8a2';ctx.lineWidth=1.1;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r,a,b);ctx.stroke();
    ctx.globalAlpha*=.12;ctx.lineWidth=6;ctx.beginPath();ctx.arc(e.x,e.y,e.r+2,a,b);ctx.stroke();
  }ctx.restore();
}
export function drawVoyageScene(ctx,w,h,seconds,{reducedMotion=false}={}){
  const f=voyageFrame(seconds,reducedMotion),g=voyageGeometry(f.time,w,h);
  ctx.save();drawOrbitalSky(ctx,w,h,1+f.camera*.025);
  mars(ctx,voyageMars(w,h),f.marsReveal);moon(ctx,g.moon,f.moonReveal,f.moonLight);earth(ctx,g.earth,w,h,f.dawn);
  for(let i=0;i<ARK_COUNT;i++){
    const p=arkPose(i,f.time,w,h);
    if(p.flight>0&&p.flight<1){
      const trail=ctx.createLinearGradient(p.tail.x,p.tail.y,p.x,p.y);trail.addColorStop(0,'#d8ddbb00');trail.addColorStop(1,'#f3eac27a');
      ctx.save();ctx.globalAlpha=1-ease((p.flight-.75)/.25);ctx.strokeStyle=trail;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(p.tail.x,p.tail.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
    }
    drawArkLight(ctx,p.x,p.y,{radius:p.radius,glow:4+p.ignition*8*(1-p.flight*.5),brightness:(.55+p.ignition*.45)*p.brightness*f.moonReveal});
  }
  ctx.restore();return f;
}
