import { BODIES } from './orbital-config.js';
import { civilizationAge } from './celestial-economy.js';
const C = { sky: '#0c171d', ocean: '#29494f', land: '#526957', highland: '#6c7861', light: '#c9d9bd', muted: '#839f94', gold: '#c8b785', conflict: '#c58c71', dark: '#172b2b', panel: '#4b6a70', metal: '#9bab9e' };
const noise = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
function disc(ctx, x, y, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2); ctx.fill(); }
function polygon(ctx, points, color) { ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill(); }
function path(ctx, points, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke(); }
function station(ctx, x, y, scale, o, time) {
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  path(ctx, [[-65,0],[65,0]], C.metal, 3);
  for (let wing = 0; wing < Math.max(1, o.structures.solar); wing++) for (const sign of [-1,1]) {
    const x = sign * (35 + wing * 27);
    ctx.fillStyle = o.structures.solar ? C.panel : C.dark; ctx.fillRect(x-10,-25,20,48);
    for (let y=-17;y<24;y+=9) path(ctx, [[x-9,y],[x+9,y]], C.muted, .5);
    path(ctx, [[x, -25], [x, 23]], C.muted, .5);
  }
  ctx.fillStyle = C.metal; ctx.fillRect(-12,-8,24,17);
  for (let i=0;i<o.structures.habitat;i++) {
    ctx.strokeStyle = i ? C.muted : C.light; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 18+i*6, 30+i*5, -.3, 0, Math.PI*2); ctx.stroke();
  }
  if (o.structures.observer) { polygon(ctx, [[-8,14],[8,14],[4,20],[-4,20]], C.light); path(ctx, [[0,20],[0,27]], C.metal); }
  if (o.structures.relay) { path(ctx, [[0,-10],[0,-34],[-8,-40],[8,-40],[0,-34]], C.gold); disc(ctx,0,-40,2,C.light); }
  for (let i=0;i<o.structures.battery;i++) { ctx.fillStyle = C.muted; ctx.fillRect(15+i*9,-9,6,18); }
  if (o.project) {
    const t = 1 - o.project.remaining / o.project.duration, xx = -50 + t * 100;
    polygon(ctx, [[xx-5,43],[xx+5,43],[xx+3,49],[xx-3,49]], C.gold);
    path(ctx, [[xx,43],[Math.sin(time*.4)*18,20]], '#9aaa7955', .8);
  }
  ctx.restore();
}
const LAND = [
  [[.18,.25],[.3,.16],[.41,.2],[.45,.33],[.39,.46],[.46,.52],[.44,.64],[.35,.67],[.28,.54],[.26,.39],[.17,.34]],
  [[.52,.22],[.65,.19],[.72,.3],[.82,.34],[.83,.49],[.72,.53],[.78,.64],[.72,.76],[.62,.74],[.55,.61],[.58,.49],[.48,.41]],
  [[.39,.66],[.49,.72],[.46,.84],[.4,.88],[.35,.77]],
];
export function drawOrbitalColony(ctx, width, height, o, { reducedMotion = false } = {}) {
  const time = reducedMotion ? 0 : o.elapsed, moon = o.selectedBody === 'moon';
  ctx.fillStyle = C.sky; ctx.fillRect(0,0,width,height);
  for (let i=0;i<100;i++) { ctx.globalAlpha = .18 + noise(i+600)*.4; disc(ctx, noise(i)*width, noise(i+180)*height, .45+noise(i+360)*.6, C.light); }
  ctx.globalAlpha = 1;
  const cx = width * .5, cy = height * .61, r = Math.min(width * .40,height * .355);
  const xy = (x,y) => [cx+(x-.5)*r*2,cy+(y-.5)*r*2];
  const stationY = Math.max(65, cy-r-47), scale = Math.min(1.1,width/600);
  // The home remains above the limb, visually linked to the ground without
  // conflating presentation coordinates with civilization simulation state.
  const glow = ctx.createRadialGradient(cx-r*.35,cy-r*.3,r*.1,cx,cy,r*1.12);
  glow.addColorStop(0, moon ? '#697779' : '#47686c'); glow.addColorStop(.88,moon ? '#354347' : C.ocean); glow.addColorStop(1,'#29494f00');
  disc(ctx,cx,cy,r*1.12,glow);
  ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
  if (!moon) {
    for (const points of LAND) polygon(ctx,points.map(([x,y])=>xy(x,y)),C.land);
    for (let i=0;i<28;i++) {
      const x=.25+noise(i+91)*.48,y=.3+noise(i+42)*.39; if (x>.45 && x<.57) continue;
      const [xx,yy]=xy(x,y), size=3+noise(i)*6;
      polygon(ctx,[[xx-size,yy+size],[xx,yy-size],[xx+size,yy+size]],C.highland);
    }
    // Old ruins survive beside new settlements.
    for (let i=0;i<30;i++) { const p=LAND[i%2][i%LAND[i%2].length], [x,y]=xy(p[0],p[1]); ctx.fillStyle='#344d42'; ctx.fillRect(x+(i%3)*4,y,2,3+i%5); }
    const civs=o.bodies.earth.civilizations;
    for (let i=0;i<civs.length;i++) {
      const c=civs[i], spec=BODIES.earth.civilizations[i], [x,y]=xy(spec.x,spec.y);
      if (!c.born) { disc(ctx,x,y,2,C.muted); continue; }
      const other=BODIES.earth.civilizations[(i+1)%3], [tx,ty]=xy(other.x,other.y), war=c.unrest>=65;
      if (civs[(i+1)%3].born) {
        ctx.setLineDash([2,5]); path(ctx,[[x,y],[tx,ty]],war?'#c58c7160':'#a4b89530');ctx.setLineDash([]);
        const t=reducedMotion?.5:(time*.025+i*.3)%1;disc(ctx,x+(tx-x)*t,y+(ty-y)*t,1.6,war?C.conflict:C.gold);
      }
      const age=civilizationAge(c), size=2.5+Math.min(3,r/80);
      disc(ctx,x,y,12+age*2,war?'#c58c7118':'#a9c3a518');
      for(let j=0;j<age+2;j++) {
        const xx=x+(j%3-1)*size*1.3, yy=y+Math.floor(j/3)*size*1.3;
        if(age<2) polygon(ctx,[[xx-size*.5,yy],[xx,yy-size],[xx+size*.5,yy]],spec.color);
        else { ctx.fillStyle=spec.color; ctx.fillRect(xx,yy-(age+j%2)*1.6,size*.7,(age+j%2)*1.6); }
      }
      if(c.id===o.selectedCivilization) { ctx.strokeStyle=C.gold;ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,18+age*2,0,Math.PI*2);ctx.stroke(); }
    }
    const shade=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r*.5);shade.addColorStop(0,'#09151900');shade.addColorStop(.5,'#09151905');shade.addColorStop(1,'#091519bd');ctx.fillStyle=shade;ctx.fillRect(cx-r,cy-r,r*2,r*2);
  } else {
    disc(ctx,cx,cy,r,'#657374');
    for(let i=0;i<35;i++) { const [x,y]=xy(noise(i+7),noise(i+28)),size=5+noise(i+91)*r*.16;disc(ctx,x,y,size,'#4e5f61');disc(ctx,x+2,y+3,size*.83,'#5c6c6c'); }
    const [x,y]=xy(.5,.52);
    if(o.structures.outpost) {
      for(let i=0;i<4;i++) { ctx.fillStyle=C.light;ctx.fillRect(x-22+i*13,y-(i%2)*7,9,6);path(ctx,[[x-20+i*13,y+8],[x-12+i*13,y+8]],C.muted,2); }
      for(let i=0;i<o.structures.reactor;i++) { disc(ctx,x+38+i*12,y+16,7,C.metal);disc(ctx,x+38+i*12,y+16,4,C.dark); }
      if(o.structures.shipyard) { path(ctx,[[x-30,y-29],[x+35,y-29]],C.light,3);for(let i=0;i<3;i++)polygon(ctx,[[x-19+i*16,y-36],[x-16+i*16,y-48],[x-13+i*16,y-36]],C.light); }
    } else { disc(ctx,x,y,3,C.gold);path(ctx,[[x-10,y],[x+10,y]],C.gold); }
  }
  ctx.restore();
  if (!moon) {
    for(const [i,c] of o.bodies.earth.civilizations.entries()) {
      if(!c.signal)continue;const spec=BODIES.earth.civilizations[i],[x,y]=xy(spec.x,spec.y),color=c.signal.kind==='tribute'?C.gold:C.light;
      ctx.globalAlpha = reducedMotion ? .5 : Math.min(1,c.signal.remaining);
      path(ctx,[[cx,stationY+20],[x,y]],color,.8);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y, reducedMotion?18:12+(2-c.signal.remaining)*16,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    }
  }
  station(ctx,cx,stationY,scale,o,time);
  ctx.font='10px ui-monospace, monospace';ctx.fillStyle=C.muted;ctx.textAlign='left';ctx.fillText(moon?'LUNA / 384,400 KM':'TERRA / HOMEWORLD',20,height-19);
  ctx.textAlign='right';ctx.fillText(o.project?'ASSEMBLY IN PROGRESS':'ORBIT STABLE',width-20,height-19);
}
