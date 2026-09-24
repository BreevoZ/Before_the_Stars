import { createBindings } from './dom-bindings.js';
import { buildSolarViewModel } from './solar-view-model.js';
import { DESTINATIONS, destination, drawSolarSystem, drawBodyPortrait, bodyAt, solarViewport } from './solar-render.js';
import { drawShipyard } from './shipyard-render.js';
import { FACILITIES, buildFacility } from './solar-industry.js';
export function createSolarUI(getSession,{openTree,replay,commit}){
  const el=id=>document.getElementById(id),bind=createBindings(document),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let view=null,selected='earth',hover=null,portraitKey=null;
  const allowed=next=>{const o=getSession().orbital;return next==='system'&&o?.talents.voyage?'system':next==='moon'&&o?.talents.outpost?'moon':next==='earth'?'earth':o?.talents.voyage?'system':'earth';};
  function sync(){const s=getSession();if(!s.orbital?.started)return;view=allowed(view);el('colony-map').dataset.view=view;for(const id of ['system','earth','moon'])el(`colony-view-${id}`).setAttribute('aria-pressed',String(view===id));bind(buildSolarViewModel(s,{view,selected}));}
  function setView(next){view=allowed(next);sync();}
  function choose(id){if(!destination(id))return;selected=id;sync();}
  for(const [i,b]of DESTINATIONS.entries()){
    const button=document.createElement('button');button.id=`solar-select-${b.id}`;button.type='button';button.setAttribute('aria-controls','colony-body-card');button.style.setProperty('--body-color',b.color);
    button.innerHTML=`<small>${String(i+1).padStart(2,'0')}</small><i aria-hidden="true"></i><span>${b.name}</span>`;
    button.addEventListener('click',()=>choose(b.id));button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.code))return;e.preventDefault();const n=(i+(e.code==='ArrowLeft'?-1:1)+DESTINATIONS.length)%DESTINATIONS.length;choose(DESTINATIONS[n].id);el(`solar-select-${selected}`).focus();});el('solar-catalogue').append(button);
  }
  for(let i=0;i<Math.max(...Object.values(FACILITIES).map(f=>f.costs.length));i++){const li=document.createElement('li');li.id=`solar-facility-rank-${i+1}`;el('solar-facility-ranks').append(li);}
  // Building happens in the dossier of the body it stands on.
  el('solar-facility-build').addEventListener('click',()=>{const key=Object.keys(FACILITIES).find(k=>FACILITIES[k].body===selected);if(key&&buildFacility(getSession(),key)){commit();sync();}});
  for(const id of ['system','earth','moon'])el(`colony-view-${id}`).addEventListener('click',()=>setView(id));
  el('solar-to-earth').addEventListener('click',()=>setView('earth'));el('solar-to-moon').addEventListener('click',()=>setView('moon'));
  el('colony-body-enter').addEventListener('click',()=>{if(['earth','moon'].includes(selected))setView(selected);});
  el('solar-replay').addEventListener('click',replay);el('shipyard-link').addEventListener('click',()=>setView('moon'));
  el('shipyard-build').addEventListener('click',()=>openTree('shipyard'));el('shipyard-voyage').addEventListener('click',()=>getSession().orbital.talents.voyage?replay():openTree('voyage'));
  const canvas=el('colony-system-canvas');
  function hit(e){const box=canvas.getBoundingClientRect(),v=solarViewport(box.width,box.height);return bodyAt(getSession().orbital,(e.clientX-box.left-v.x)/v.scale,(e.clientY-box.top-v.y)/v.scale,{reducedMotion:reduced.matches,tolerance:Math.max(15,15/v.scale)});}
  canvas.addEventListener('pointermove',e=>{hover=hit(e)?.id??null;canvas.dataset.hover=String(Boolean(hover));});canvas.addEventListener('pointerleave',()=>{hover=null;});canvas.addEventListener('click',e=>{const b=hit(e);if(b)choose(b.id);});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();const i=DESTINATIONS.findIndex(b=>b.id===selected),n=(i+(e.code==='ArrowLeft'?-1:1)+DESTINATIONS.length)%DESTINATIONS.length;choose(DESTINATIONS[n].id);}if(e.code==='Enter'&&['earth','moon'].includes(selected)){e.preventDefault();setView(selected);}});
  function context(canvas){const{width,height}=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(!width||!height)return null;const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,width,height};}
  return{sync,setView,get view(){return allowed(view);},reset(){view=null;selected='earth';portraitKey=null;},paint(ambient){
    const o=getSession().orbital;if(!o?.started)return;
    if(view==='system'){
      const p=context(canvas);if(p)drawSolarSystem(p.ctx,p.width,p.height,o,{ambientTime:ambient,reducedMotion:reduced.matches,hover,selected});
      const q=context(el('solar-body-portrait'));if(q){const key=`${selected}:${q.width}:${q.height}:${devicePixelRatio}:${o.talents.recovery}`;if(key!==portraitKey){drawBodyPortrait(q.ctx,q.width,q.height,destination(selected),o);portraitKey=key;}}
    }
    if(view==='moon'){const p=context(el('shipyard-canvas'));if(p)drawShipyard(p.ctx,p.width,p.height,o,{time:ambient,reducedMotion:reduced.matches});}
  }};
}
