import { createBindings } from './dom-bindings.js';
import { buildSolarViewModel } from './solar-view-model.js';
import { drawSolarSystem, bodyAt, solarViewport } from './solar-render.js';
import { DESTINATIONS, SATELLITES, destination, systemOf, satellitesOf } from './solar-bodies.js';
import { drawWorldScene, satelliteAt } from './solar-world-render.js';
import { drawShipyard } from './shipyard-render.js';
import { FACILITIES, buildFacility } from './solar-industry.js';
import { transferCivilization } from './solar-colony.js';
import { watchColonyWar, liveColonyWar } from './colony-war.js';
import { createRenderer } from './render.js';
import { AGES } from './game-config.js';
export function createSolarUI(getSession,{openTree,replay,commit,openSolarTree}){
  const el=id=>document.getElementById(id),bind=createBindings(document),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let view=null,selected='mars',hover=null,moonHover=null,civSignature='',watching=null,renderBattle=null;
  const allowed=next=>{const o=getSession().orbital;
    if(next==='earth'||next==='moon'&&o?.talents.outpost)return next;
    if(o?.talents.voyage&&(next==='system'||destination(next)))return next;
    return o?.talents.voyage?'system':'earth';};
  // Earth civilizations that could board an ark: rebuilt only when the list changes.
  function syncCivOptions(o){const select=el('solar-transfer-civ'),list=o.civilizations.filter(c=>c.alive),signature=list.map(c=>`${c.id}:${c.age}:${c.warId?1:0}`).join('|');
    if(signature===civSignature)return;civSignature=signature;const keep=select.value;select.replaceChildren(...list.map(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=`${c.name} · ${AGES[c.age].numeral}${c.warId?' · 交战中':''}`;return option;}));
    select.value=list.some(c=>c.id===keep)?keep:(list.find(c=>!c.warId)?.id??list[0]?.id??'');}
  function sync(){const s=getSession();if(!s.orbital?.started)return;view=allowed(view);el('colony-map').dataset.view=view;for(const id of ['earth','moon'])el(`colony-view-${id}`).setAttribute('aria-pressed',String(view===id));
    syncCivOptions(s.orbital);
    // Only the war open in the Mars dossier runs as a real battle; leaving it folds it back.
    if(view!=='mars')watching=null;if(!watchColonyWar(s.orbital,'mars',watching))watching=null;
    bind(buildSolarViewModel(s,{view,selected,transferCiv:el('solar-transfer-civ').value,watching}));}
  function setView(next){view=allowed(next);selected=view==='system'?systemOf(selected):view;moonHover=null;sync();}
  function choose(id){if(!destination(id))return;setView(id);}
  for(const [i,b]of DESTINATIONS.entries()){
    const button=document.createElement('button');button.id=`solar-select-${b.id}`;button.type='button';button.setAttribute('aria-controls','colony-body-card');button.style.setProperty('--body-color',b.color);
    button.innerHTML=`<small>${String(i+1).padStart(2,'0')}</small><i aria-hidden="true"></i><span>${b.name}</span><em id="solar-nav-state-${b.id}"></em>`;
    button.addEventListener('click',()=>choose(b.id));button.addEventListener('keydown',e=>{if(e.code==='ArrowDown'&&satellitesOf(b.id).length){e.preventDefault();openMenu(b.id);el(`solar-moon-${satellitesOf(b.id)[0].id}`).focus();return;}if(!['ArrowLeft','ArrowRight'].includes(e.code))return;e.preventDefault();const n=(i+(e.code==='ArrowLeft'?-1:1)+DESTINATIONS.length)%DESTINATIONS.length;choose(DESTINATIONS[n].id);el(`solar-select-${selected}`).focus();});el('solar-catalogue').append(button);
  }
  for(let i=0;i<Math.max(...Object.values(FACILITIES).map(f=>f.costs.length));i++){const li=document.createElement('li');li.id=`solar-facility-rank-${i+1}`;el('solar-facility-ranks').append(li);}
  // Building happens in the dossier of the body it stands on.
  el('solar-facility-build').addEventListener('click',()=>{const key=Object.keys(FACILITIES).find(k=>FACILITIES[k].body===selected);if(key&&buildFacility(getSession(),key)){commit();sync();}});
  for(let i=0;i<8;i++){const li=document.createElement('li');li.id=`solar-colonist-${i}`;el('solar-colonists').append(li);}
  el('solar-transfer-civ').addEventListener('change',sync);
  for(let i=0;i<3;i++)el(`solar-war-${i}`).addEventListener('click',()=>{const war=getSession().orbital.solar.colonies.mars.wars[i];if(!war)return;watching=watching===war.id?null:war.id;sync();});
  el('solar-transfer-go').addEventListener('click',()=>{if(transferCivilization(getSession(),el('solar-transfer-civ').value)){civSignature='';commit();sync();}});
  el('solar-colony-tree').addEventListener('click',()=>openSolarTree?.('dome'));
  for(const id of ['earth','moon'])el(`colony-view-${id}`).addEventListener('click',()=>setView(id));
  // Satellites drop down from their planet: on hover or focus with a mouse or
  // keyboard, and after a tap on touch screens. One menu, placed under the planet.
  const menu=el('solar-moon-menu'),nav=el('solar-navigation');let menuFor=null,menuTimer=null;
  for(const m of SATELLITES){const button=document.createElement('button');button.id=`solar-moon-${m.id}`;button.type='button';button.setAttribute('role','menuitem');button.style.setProperty('--body-color',m.color);
    button.innerHTML=`<i aria-hidden="true"></i><span>${m.name}</span><small>${m.id==='moon'?'月面家园':m.period<0?'逆行卫星':'自然卫星'}</small>`;
    button.addEventListener('click',()=>{closeMenu();setView(m.id);});
    button.addEventListener('keydown',e=>{const list=satellitesOf(m.parent),i=list.indexOf(m);
      if(['ArrowDown','ArrowUp'].includes(e.code)){e.preventDefault();el(`solar-moon-${list[(i+(e.code==='ArrowDown'?1:-1)+list.length)%list.length].id}`).focus();}
      if(e.code==='Escape'){e.preventDefault();closeMenu();el(`solar-select-${m.parent}`).focus();}});
    el('solar-satellites').append(button);}
  function openMenu(id){clearTimeout(menuTimer);const moons=satellitesOf(id);if(!moons.length){closeMenu();return;}
    menuFor=id;for(const m of SATELLITES)el(`solar-moon-${m.id}`).hidden=m.parent!==id;el('solar-moon-menu-title').textContent=`${destination(id).name} · ${moons.length} 颗卫星`;
    const b=el(`solar-select-${id}`).getBoundingClientRect(),n=nav.getBoundingClientRect();menu.hidden=false;
    menu.style.left=`${Math.max(0,Math.min(n.width-menu.offsetWidth,b.left-n.left))}px`;menu.style.top=`${b.bottom-n.top}px`;}
  function closeMenu(){clearTimeout(menuTimer);menu.hidden=true;menuFor=null;}
  const later=()=>{clearTimeout(menuTimer);menuTimer=setTimeout(closeMenu,180);};
  for(const b of DESTINATIONS){const button=el(`solar-select-${b.id}`);
    button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')openMenu(b.id);});button.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')later();});
    button.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')setTimeout(()=>openMenu(b.id));});
    button.addEventListener('focus',()=>{if(button.matches(':focus-visible'))openMenu(b.id);});}
  menu.addEventListener('pointerenter',()=>clearTimeout(menuTimer));menu.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')later();});
  nav.addEventListener('focusout',e=>{if(!nav.contains(e.relatedTarget))later();});
  document.addEventListener('pointerdown',e=>{if(menuFor&&!nav.contains(e.target))closeMenu();});
  el('solar-catalogue').addEventListener('scroll',closeMenu,{passive:true});
  el('solar-overview').addEventListener('click',()=>setView('system'));
  el('solar-atlas-open').addEventListener('click',()=>choose(selected));
  el('solar-replay').addEventListener('click',replay);el('shipyard-link').addEventListener('click',()=>setView('moon'));
  el('shipyard-build').addEventListener('click',()=>openTree('shipyard'));el('shipyard-voyage').addEventListener('click',()=>getSession().orbital.talents.voyage?replay():openTree('voyage'));
  const canvas=el('colony-system-canvas');
  function hit(e){const box=canvas.getBoundingClientRect(),v=solarViewport(box.width,box.height);return bodyAt(getSession().orbital,(e.clientX-box.left-v.x)/v.scale,(e.clientY-box.top-v.y)/v.scale,{reducedMotion:reduced.matches,tolerance:Math.max(15,15/v.scale)});}
  canvas.addEventListener('pointermove',e=>{hover=hit(e)?.id??null;canvas.dataset.hover=String(Boolean(hover));});canvas.addEventListener('pointerleave',()=>{hover=null;});canvas.addEventListener('click',e=>{const b=hit(e);if(b)choose(b.id);});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();const i=DESTINATIONS.findIndex(b=>b.id===selected),n=(i+(e.code==='ArrowLeft'?-1:1)+DESTINATIONS.length)%DESTINATIONS.length;selected=DESTINATIONS[n].id;sync();}if(e.code==='Enter'){e.preventDefault();choose(selected);}});
  const worldCanvas=el('solar-body-portrait');
  function moonHit(e){const rect=worldCanvas.getBoundingClientRect(),body=destination(view);return body?satelliteAt(body,rect.width,rect.height,reduced.matches?0:getSession().orbital.elapsed,e.clientX-rect.left,e.clientY-rect.top):null;}
  worldCanvas.addEventListener('pointermove',e=>{moonHover=moonHit(e)?.id??null;worldCanvas.dataset.hover=String(Boolean(moonHover));});
  worldCanvas.addEventListener('pointerleave',()=>{moonHover=null;});
  worldCanvas.addEventListener('click',e=>{const moon=moonHit(e);if(moon)setView(moon.id);});
  worldCanvas.addEventListener('keydown',e=>{const moons=satellitesOf(view);if(!moons.length)return;
    if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();const i=moons.findIndex(m=>m.id===moonHover);moonHover=moons[(i+(e.code==='ArrowLeft'?-1:1)+moons.length)%moons.length].id;}
    if(e.code==='Enter'){e.preventDefault();setView(moonHover??moons[0].id);}
  });
  function context(canvas){const{width,height}=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(!width||!height)return null;const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,width,height};}
  return{sync,setView,get view(){return allowed(view);},reset(){view=null;selected='mars';moonHover=null;watching=null;},paint(ambient){
    const o=getSession().orbital;if(!o?.started)return;
    if(view==='system'){
      const p=context(canvas);if(p)drawSolarSystem(p.ctx,p.width,p.height,o,{ambientTime:ambient,reducedMotion:reduced.matches,hover,selected});
    }else if(!['earth','moon'].includes(view)){
      const q=context(worldCanvas),body=destination(view);if(q&&body)drawWorldScene(q.ctx,q.width,q.height,body,o,{ambientTime:ambient,reducedMotion:reduced.matches,hover:moonHover});
    }
    // The renderer sizes its own canvas; it is created the first time a war is watched.
    const live=watching&&liveColonyWar(o);if(live&&el('solar-battle').getBoundingClientRect().width){renderBattle??=createRenderer(el('solar-battle'));renderBattle(live.game,{skyTime:o.elapsed,lunarTime:o.elapsed});}
    if(view==='moon'){const p=context(el('shipyard-canvas'));if(p)drawShipyard(p.ctx,p.width,p.height,o,{time:ambient,reducedMotion:reduced.matches});}
  }};
}
