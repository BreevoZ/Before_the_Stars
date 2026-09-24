// Shared hull design: drydock, launch film and solar-system fleet.
const TAU=Math.PI*2;
const poly=(c,p,fill)=>{c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();};
export const ARK_COUNT=6;
// The prow points up; the light is restrained, with no outline around the hull.
export function drawArk(c,x,y,size,{angle=0,thrust=0,alpha=1}={}){
  c.save();c.translate(x,y);c.rotate(angle);c.scale(size,size);c.globalAlpha*=alpha;
  if(thrust){const g=c.createLinearGradient(0,22,0,22+thrust*90);g.addColorStop(0,'#e9d6a8ce');g.addColorStop(.18,'#b6caca75');g.addColorStop(1,'#9ebbb800');poly(c,[[-5,20],[0,22+thrust*90],[5,20]],g);}
  poly(c,[[-7,23],[-10,-11],[-5,-29],[0,-42],[5,-29],[10,-11],[7,23]],'#647f7d');
  poly(c,[[-5,19],[-6,-17],[0,-38],[3,-18],[2,19]],'#c0c8b6');
  poly(c,[[3,-25],[8,-11],[6,23],[2,23]],'#344f54');
  for(const sign of [-1,1]){poly(c,[[sign*8,-13],[sign*20,3],[sign*23,22],[sign*10,16]],'#718980');poly(c,[[sign*11,-6],[sign*16,2],[sign*19,15],[sign*12,12]],'#314d56');}
  c.fillStyle='#233d45';for(let i=0;i<4;i++)c.fillRect(-4,-13+i*7,6,3);
  c.fillStyle='#ded5a8';c.fillRect(-2,-25,3,3);c.fillRect(-6,21,12,2);
  c.strokeStyle='#a8bcb180';c.lineWidth=.7;c.beginPath();c.ellipse(0,5,14,3,0,0,TAU);c.stroke();c.restore();
}
export function drawShipyard(c,w,h,o,{time=0,reducedMotion=false}={}){
  c.save();c.clearRect(0,0,w,h);const scale=Math.min(w/720,h/280);c.translate(w/2,h/2);c.scale(scale,scale);
  const built=Boolean(o.talents.shipyard),launched=Boolean(o.talents.voyage);
  c.strokeStyle='#779b9526';c.lineWidth=1;c.setLineDash([2,7]);for(const y of [-70,70]){c.beginPath();c.moveTo(-335,y);c.lineTo(335,y);c.stroke();}c.setLineDash([]);
  for(let i=0;i<ARK_COUNT;i++){
    const x=-270+i*108;c.save();c.translate(x,0);c.globalAlpha=built?1:.3;
    c.fillStyle='#23373c';c.fillRect(-34,45,68,18);c.fillStyle='#526e6b';c.fillRect(-36,44,72,3);
    for(const side of [-1,1]){c.fillStyle='#3f5659';c.fillRect(side*32-3,-45,6,92);for(const y of [-34,6,38]){c.fillStyle='#7d9690';c.fillRect(side<0?-33:18,y,15,3);}c.fillStyle='#c8b98a';c.fillRect(side*32-1,-46,2,5);}
    if(!launched)drawArk(c,0,3,.93,{alpha:built?1:.35});
    if(built&&!launched&&!reducedMotion){const y=-38+(Math.sin(time*.4+i)*.5+.5)*80;c.strokeStyle='#b3c9a733';c.beginPath();c.moveTo(-24,y);c.lineTo(24,y);c.stroke();}
    c.fillStyle=built?'#9aafa3':'#617972';c.font='9px ui-monospace,monospace';c.textAlign='center';c.fillText(`${String(i+1).padStart(2,'0')} / ${launched?'DEPARTED':built?'READY':'PLANNED'}`,0,86);c.restore();
  }c.restore();
}
