import { SITES, ORBITAL_RULES as R } from './orbital-config.js';
const C={sky:'#0d191e',ocean:'#284950',land:'#4a6557',light:'#c8d8bc',muted:'#87a296',gold:'#cbb787',war:'#c19176'};
const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
function disc(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function poly(ctx,pts,color){ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();}
export const sitePosition=site=>({x:500+(site.x-.5)*540,y:340+(site.y-.5)*540});
function stars(ctx,w,h){ctx.fillStyle=C.sky;ctx.fillRect(0,0,w,h);for(let i=0;i<150;i++){ctx.globalAlpha=.15+noise(i+100)*.5;disc(ctx,noise(i)*w,noise(i+240)*h,.5+noise(i+60)*.6,C.light);}ctx.globalAlpha=1;}
export function drawOrbitalColony(ctx,width,height,o,{reducedMotion=false}={}){
  ctx.save();ctx.scale(width/1000,height/620);stars(ctx,1000,620);
  const r=270,gradient=ctx.createRadialGradient(420,265,80,500,340,r+12);gradient.addColorStop(0,'#42666a');gradient.addColorStop(.9,C.ocean);gradient.addColorStop(1,'#28495000');disc(ctx,500,340,r+12,gradient);
  ctx.save();ctx.beginPath();ctx.arc(500,340,r,0,Math.PI*2);ctx.clip();
  const land=[[[.17,.28],[.3,.18],[.42,.22],[.48,.37],[.37,.54],[.47,.64],[.42,.88],[.34,.72],[.27,.47]],[[.53,.22],[.69,.15],[.77,.28],[.88,.4],[.80,.58],[.72,.60],[.75,.79],[.58,.77],[.50,.54],[.58,.44]]];
  land.forEach(points=>poly(ctx,points.map(([x,y])=>[500+(x-.5)*540,340+(y-.5)*540]),C.land));
  for(let i=0;i<24;i++){const site=SITES[i%SITES.length],p=sitePosition(site),size=5+i%4;poly(ctx,[[p.x+10,p.y+10],[p.x+size+10,p.y-size],[p.x+size*2+10,p.y+10]],'#647762');}
  for(const c of o.civilizations){const p=sitePosition(SITES.find(s=>s.id===c.site));
    for(let i=0;i<c.age+2;i++){ctx.fillStyle=c.alive?'#b3c1a0':'#263d38';ctx.fillRect(p.x+(i%3-1)*6,p.y+10-Math.floor(i/3)*5,4,3+c.age*2);}
  }
  const shade=ctx.createLinearGradient(260,150,780,500);shade.addColorStop(0,'#0a171900');shade.addColorStop(1,'#0a1719aa');ctx.fillStyle=shade;ctx.fillRect(220,60,560,560);ctx.restore();
  for(const w of o.wars){const points=w.participants.map(id=>sitePosition(SITES.find(s=>s.id===o.civilizations.find(c=>c.id===id).site)));const [a,b]=points;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-55,b.x,b.y);ctx.strokeStyle=C.war;ctx.lineWidth=1.2;ctx.setLineDash([4,6]);ctx.lineDashOffset=reducedMotion?0:-o.elapsed*5;ctx.stroke();ctx.setLineDash([]);
  }
  if(o.phase==='winter'){
    const age=o.elapsed-o.lastCatastropheAt,t=reducedMotion?1:Math.min(1,age/R.nuclearVisualSeconds);
    ctx.save();ctx.beginPath();ctx.arc(500,340,r,0,Math.PI*2);ctx.clip();
    ctx.globalAlpha=.5*t;disc(ctx,500,340,r,'#101b1c');
    for(let i=0;i<o.civilizations.length;i++){const p=sitePosition(SITES.find(s=>s.id===o.civilizations[i].site));ctx.globalAlpha=reducedMotion?.2:Math.max(0,.45-age*.055);disc(ctx,p.x,p.y,16+age*6,'#cbb795');}
    ctx.restore();ctx.globalAlpha=1;
  }
  ctx.strokeStyle='#9fb3a450';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(500,340,330,100,-.22,Math.PI,Math.PI*2);ctx.stroke();
  const stationX=500,stationY=47;ctx.fillStyle=C.muted;ctx.fillRect(stationX-9,stationY-5,18,10);ctx.fillStyle='#53747a';ctx.fillRect(stationX-46,stationY-12,28,24);ctx.fillRect(stationX+18,stationY-12,28,24);
  ctx.strokeStyle=C.light;ctx.beginPath();ctx.ellipse(stationX,stationY,15,23,-.25,0,Math.PI*2);ctx.stroke();
  if(o.talents.outpost)disc(ctx,900,95,25,'#88928a');
  ctx.font='12px ui-monospace, monospace';ctx.fillStyle=C.muted;ctx.fillText(o.phase==='winter'?'TERRA / NUCLEAR WINTER':'TERRA / CIVILIZATION SEEDS',24,595);
  ctx.restore();
}
export function drawOrbitalTalentSky(ctx,width,height){
  stars(ctx,width,height);const radius=Math.max(width*.75,height),cx=width*.5,cy=height+radius*.78;
  const g=ctx.createRadialGradient(cx,cy,radius*.6,cx,cy,radius);g.addColorStop(0,'#345549');g.addColorStop(.98,'#284954');g.addColorStop(1,'#6f958e');disc(ctx,cx,cy,radius,g);
  ctx.fillStyle='#08131960';ctx.fillRect(0,0,width,height);
}
