import { drawOrbitalScene, ORBITAL_SECONDS } from './orbital-scene.js';
import { drawArk, ARK_COUNT } from './shipyard-render.js';
export const VOYAGE_SECONDS=22;
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function voyageFrame(seconds,reduced=false){const t=reduced?VOYAGE_SECONDS:Math.max(0,Math.min(VOYAGE_SECONDS,seconds));return{time:t,treeOpacity:1-ease(t/3),moonRise:ease((t-1)/5),departure:ease((t-6)/12),arrival:ease((t-17)/3),actions:ease((t-20)/2),complete:t>=VOYAGE_SECONDS};}
export function arkPose(index,seconds,w,h){
  const f=voyageFrame(seconds),r=Math.min(w*.18,h*.2),moonY=h*.92-f.moonRise*h*.34;
  const launchX=w*.5+(index-(ARK_COUNT-1)/2)*r*.23,launchY=moonY-r*Math.sqrt(1-((launchX-w*.5)/r)**2)*.79;
  const flight=clamp((f.time-6-index*.65)/10),travel=flight*flight*(3-2*flight);
  const targetX=w*(.06+index*.176),targetY=h*(.12+(index%3)*.075);
  return{x:launchX+(targetX-launchX)*travel,y:launchY+(targetY-launchY)*travel,flight,
    angle:Math.atan2(targetX-launchX,launchY-targetY),scale:(w<600?.38:.55)*(1-travel*.79),launchX,launchY,targetX,targetY};
}
export function drawVoyageScene(c,w,h,seconds,{reducedMotion=false}={}){
  const f=voyageFrame(seconds,reducedMotion);drawOrbitalScene(c,w,h,ORBITAL_SECONDS);c.save();
  const r=Math.min(w*.18,h*.2),x=w*.5,y=h*.92-f.moonRise*h*.34;
  c.globalAlpha=ease((f.time-.7)/2);const halo=c.createRadialGradient(x,y,r*.95,x,y,r*1.2);halo.addColorStop(0,'#95aaa724');halo.addColorStop(1,'#95aaa700');c.fillStyle=halo;c.beginPath();c.arc(x,y,r*1.2,0,Math.PI*2);c.fill();
  const moon=c.createLinearGradient(x-r,y-r,x+r,y+r);moon.addColorStop(0,'#b5bcb0');moon.addColorStop(.5,'#788c85');moon.addColorStop(1,'#20333c');c.fillStyle=moon;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.save();c.clip();
  for(let i=0;i<45;i++){const a=i*2.39996,q=Math.sqrt((i+.5)/45)*r;c.fillStyle=i%3?'#19313917':'#d0d3b117';c.beginPath();c.ellipse(x+Math.cos(a)*q,y+Math.sin(a)*q,r*(.018+i%4*.016),r*(.014+i%3*.016),a,0,Math.PI*2);c.fill();}
  // Surface docks follow the moon's curvature, linked by a thin service route.
  c.strokeStyle='#afbea455';c.lineWidth=1;c.beginPath();
  for(let i=0;i<ARK_COUNT;i++){const p=arkPose(i,f.time,w,h);i?c.lineTo(p.launchX,p.launchY+8):c.moveTo(p.launchX,p.launchY+8);}c.stroke();
  for(let i=0;i<ARK_COUNT;i++){const p=arkPose(i,f.time,w,h);
    c.fillStyle='#60756f';c.fillRect(p.launchX-8,p.launchY+5,16,5);c.fillStyle='#c4c5a4';c.fillRect(p.launchX-8,p.launchY+4,16,1);
    for(const side of [-1,1]){c.fillStyle='#435f61';c.fillRect(p.launchX+side*10-1,p.launchY-12,2,22);c.fillStyle='#b9c4ac';c.fillRect(p.launchX+side*10-1,p.launchY-12,2,2);}
    if(p.flight===0)drawArk(c,p.launchX,p.launchY,p.scale);
  }
  c.restore();c.globalAlpha=1;
  // The Earth's opaque limb hides the rising Moon until it clears the horizon.
  const hr=Math.max(w*.8,h*1.2),hy=h+hr-h*.1;c.fillStyle='#0b171c';c.beginPath();c.arc(w*.5,hy,hr,0,Math.PI*2);c.fill();c.strokeStyle='#6d989166';c.stroke();
  for(let i=0;i<ARK_COUNT;i++){const p=arkPose(i,f.time,w,h);if(!p.flight)continue;
    c.save();c.globalAlpha=(1-f.arrival)*.22;c.strokeStyle='#c0cdb2';c.lineWidth=.7;c.beginPath();c.moveTo(p.launchX,p.launchY);c.lineTo(p.x,p.y);c.stroke();c.restore();
    drawArk(c,p.x,p.y,p.scale,{angle:p.angle*ease(p.flight*5),thrust:ease(p.flight*8)*(1-p.flight*.7),alpha:1-f.arrival*.5});
  }
  // The scene remains in place while the final text/actions fade in above it.
  c.fillStyle=`rgba(6,14,23,${f.arrival*.42})`;c.fillRect(0,0,w,h);c.restore();return f;
}
