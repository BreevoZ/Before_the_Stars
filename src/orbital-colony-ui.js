import { createBindings } from './dom-bindings.js';
import { SITES, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as A, ORBITAL_RULES as R } from './orbital-config.js';
import { startOrbitalWar, intervene, purchaseOrbitalTalent } from './orbital-game.js';
import { buildOrbitalViewModel } from './orbital-view-model.js';
import { drawOrbitalColony, drawOrbitalTalentSky, drawLunarColony, sitePosition } from './orbital-render.js';
import { createRenderer } from './render.js';
import { icon } from './icons.js';
import { AGES, UNITS } from './game-config.js';
import { TRAITS } from './traits.js';
import { localSkyTime } from './celestial-clock.js';
const branch = key => T[key].branch;
const military=['doctrines','superSoldiers','sniper'];
export function createOrbitalColonyUI(getSession,{commit,archive,save,speed,viewChanged}) {
  const el=id=>document.getElementById(id),bind=createBindings(document),dialog=el('orbit-talents-dialog');
  const detail=el('orbit-detail'),scroll=dialog.querySelector('.orbit-tree-scroll');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let talent='monitor',selected=false,pinned=false,paused=false,ambient=0,last=null,lastPaint=null,hideTimer,treeSize=null,ringBuild=null;
  document.querySelectorAll('#orbital-game [data-icon], #orbit-talents-dialog [data-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.icon);});
  function selectCivilization(site,key){
    const o=getSession().orbital,c=o?.civilizations.find(c=>c.site===site);if(!c)return;
    o[key]=c.id;
    if(key==='selectedCivilization'&&c.warId){const w=o.wars.find(w=>w.id===c.warId);o.selectedWar=w.id;o.selectedOpponent=w.participants.find(id=>id!==c.id);}
    commit();
  }
  for(const site of SITES){
    for(const which of ['first','opponent']){const opt=document.createElement('option');opt.id=`${which}-${site.id}`;opt.value=site.id;el(`colony-${which}`).append(opt);}
    const button=document.createElement('button');button.id=`site-${site.id}`;button.className='orbit-site';button.type='button';
    button.innerHTML=`<span id="site-${site.id}-age"></span><small>${site.name}</small>`;
    button.addEventListener('click',()=>selectCivilization(site.id,'selectedCivilization'));el('colony-map').append(button);
    const item=document.createElement('button');item.id=`roster-${site.id}`;item.type='button';item.innerHTML=`<i></i><span id="roster-name-${site.id}"></span><small id="roster-age-${site.id}"></small>`;
    item.addEventListener('click',()=>selectCivilization(site.id,'selectedCivilization'));el('colony-roster').append(item);
  }
  el('colony-first').addEventListener('change',e=>selectCivilization(e.target.value,'selectedCivilization'));
  el('colony-opponent').addEventListener('change',e=>selectCivilization(e.target.value,'selectedOpponent'));
  el('colony-start-war').addEventListener('click',()=>{const s=getSession(),o=s.orbital;if(startOrbitalWar(s,o.selectedCivilization,o.selectedOpponent))commit();});
  for(const [key,a]of Object.entries(A)){
    const button=document.createElement('button');button.id=`intervene-${key}`;button.type='button';button.title=a.description;
    button.innerHTML=`<span class="intervention-icon">${icon({boost:'shield',airdrop:'parachute',ceasefire:'truce',advance:'spark',regress:'lock',harvest:'beam',doctrines:'shield',superSoldiers:'elite',sniper:'rifle'}[key])}</span><span><strong id="intervene-${key}-name">${a.name}</strong><small id="intervene-${key}-state"></small></span><span class="orbit-price"><small id="intervene-${key}-cost"></small>${icon("legacy")}</span>`;
    button.addEventListener('click',()=>{const s=getSession();if(intervene(s,s.orbital.selectedCivilization,key))commit();});el(military.includes(key)?'colony-military-actions':'colony-interventions').append(button);
  }
  for(let age=1;age<=5;age++){
    const item=document.createElement('li');item.id=`doctrine-tier-${age}`;item.textContent=AGES[age].numeral;
    item.title=Object.values(TRAITS).filter(t=>UNITS[t.units[0]].age===age).map(t=>t.name).join(' · ');el('colony-doctrine-tiers').append(item);
  }
  // The habitat rank is a tiny ring of seven arcs, the same shape as on the globe.
  const ringSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');ringSvg.setAttribute('viewBox','-26 -10 52 20');
  for(let i=1;i<=R.habitatSections;i++){const a=(i-1)/R.habitatSections*Math.PI*2+.06,b=i/R.habitatSections*Math.PI*2-.06;
    const arc=document.createElementNS('http://www.w3.org/2000/svg','path');arc.id=`colony-ring-ranks-${i}`;
    arc.setAttribute('d',`M${(Math.cos(a)*22).toFixed(2)} ${(Math.sin(a)*7).toFixed(2)} A22 7 0 0 1 ${(Math.cos(b)*22).toFixed(2)} ${(Math.sin(b)*7).toFixed(2)}`);ringSvg.append(arc);}
  el('colony-ring-ranks').append(ringSvg);
  for(let i=1;i<=4;i++){const part=document.createElement('i');part.id=`colony-lunar-ranks-${i}`;el('colony-lunar-ranks').append(part);}
  for(let i=0;i<3;i++){
    const button=document.createElement('button');button.id=`watch-war-${i}`;button.type='button';
    button.addEventListener('click',()=>{const o=getSession().orbital,w=o.wars[i];if(w){o.selectedWar=w.id;[o.selectedCivilization,o.selectedOpponent]=w.participants;commit();}});el('colony-wars').append(button);
  }
  el('colony-auto').addEventListener('change',e=>{const o=getSession().orbital;if(o?.talents.weaving){o.autoWar=e.target.checked;commit();}});
  const NS='http://www.w3.org/2000/svg';
  for(const [key,t]of Object.entries(T)){
    for(const parent of Object.keys(t.requires)){
      const from=T[parent],path=document.createElementNS(NS,'path');path.id=`orbit-edge-${parent}-${key}`;
      // The summit's edge stops at its rim instead of crossing the large disc.
      const end=t.y+(t.finale?52:0);path.setAttribute('d',`M${from.x} ${from.y} C${from.x} ${(from.y+end)/2} ${t.x} ${(from.y+end)/2} ${t.x} ${end}`);
      path.setAttribute('class',parent==='protocol'?'trunk':t.finale?'trunk finale':'branch');path.dataset.route=branch(key);el('orbit-tree-edges').append(path);
    }
    const node=document.createElement('button');node.id=`orbit-node-${key}`;node.type='button';node.className=`orbit-node ${t.kind??'ordinary'}${t.finale?' finale':''}`;
    node.dataset.route=branch(key);node.style.left=`${t.x}px`;node.style.top=`${t.y}px`;node.setAttribute('aria-controls','orbit-detail');
    const shape=t.finale?'<circle class="orbit-finale-ring" cx="32" cy="32" r="31.5"/><circle class="orbit-halo" cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="24"/>':t.kind==='specialist'?'<path d="M32 2 62 32 32 62 2 32Z"/>':t.kind==='keystone'?'<circle class="orbit-halo" cx="32" cy="32" r="31"/><circle cx="32" cy="32" r="26"/>':'<path d="M32 2 58 17v30L32 62 6 47V17Z"/>';
    node.innerHTML=`<svg class="orbit-node-frame" viewBox="0 0 64 64" aria-hidden="true">${shape}</svg><span class="orbit-node-glyph">${icon(t.icon)}</span><span id="orbit-rank-${key}" class="orbit-rank"></span><small class="orbit-node-price"><span id="orbit-cost-${key}"></span>${icon("legacy")}</small><span class="orbit-node-name">${t.name}</span>`;
    node.addEventListener('click',()=>selectTalent(key,true));node.addEventListener('dblclick',()=>buy(key));
    node.addEventListener('pointerenter',e=>{if(innerWidth>740&&e.pointerType==='mouse'&&!pinned)selectTalent(key);});
    node.addEventListener('pointerleave',()=>{if(!pinned)hideTimer=setTimeout(closeDetail,180);});
    node.addEventListener('keydown',e=>{
      if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;e.preventDefault();
      const axis=e.code==='ArrowLeft'||e.code==='ArrowRight'?'x':'y',sign=e.code==='ArrowLeft'||e.code==='ArrowUp'?-1:1;
      const next=Object.entries(T).filter(([,n])=>(n[axis]-t[axis])*sign>0).sort(([,a],[,b])=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y))[0];
      if(next){el(`orbit-node-${next[0]}`).focus();selectTalent(next[0],true);}
    });el('orbit-tree-nodes').append(node);
  }
  function positionDetail(){
    if(!selected||!dialog.open)return;
    if(innerWidth<=740){detail.style.left='';detail.style.top='';return;}
    const rect=el(`orbit-node-${talent}`).getBoundingClientRect(),width=detail.offsetWidth;
    detail.style.left=`${Math.max(16,Math.min(innerWidth-width-16,rect.right+width+30<innerWidth?rect.right+20:rect.left-width-20))}px`;
    detail.style.top=`${Math.max(92,Math.min(innerHeight-detail.offsetHeight-24,rect.top-24))}px`;
  }
  function closeDetail(){clearTimeout(hideTimer);selected=false;pinned=false;detail.hidden=true;sync();}
  function selectTalent(key,pin=false){clearTimeout(hideTimer);talent=key;selected=true;pinned=pin;sync();detail.hidden=false;positionDetail();}
  detail.addEventListener('pointerenter',()=>clearTimeout(hideTimer));detail.addEventListener('pointerleave',()=>{if(!pinned)hideTimer=setTimeout(closeDetail,180);});
  el('close-orbit-detail').addEventListener('click',closeDetail);
  function buy(key){
    if(!purchaseOrbitalTalent(getSession(),key))return;if(key==='recovery')ringBuild={rank:getSession().orbital.talents.recovery,start:null};talent=key;commit();selectTalent(key,true);
    el('orbit-feedback').textContent=`${T[key].name} · 已点亮 ${getSession().orbital.talents[key]} 级`;
    if(!reduced.matches){el(`orbit-node-${key}`).animate([{scale:1},{scale:1.15},{scale:1}],{duration:450});
      el('orbit-tree-wallet').animate([{transform:'translateY(-4px)',opacity:.5},{transform:'translateY(0)',opacity:1}],{duration:450});
      for(const p of Object.keys(T[key].requires))el(`orbit-edge-${p}-${key}`).animate([{strokeDasharray:'4 7',strokeDashoffset:60,opacity:1},{strokeDashoffset:0,opacity:.7}],{duration:700});}
  }
  function openTree(key=null){
    if(!getSession().orbital?.started)return;
    closeDetail();if(!dialog.open)dialog.showModal();sync();paintTree();
    el(`orbit-node-${key??'protocol'}`).scrollIntoView({block:key?'center':'end',inline:'center'});
    el(`orbit-node-${key??'protocol'}`).focus({preventScroll:true});if(key)selectTalent(key,true);viewChanged();
  }
  document.querySelectorAll('[data-orbit-route]').forEach(button=>button.addEventListener('click',()=>{closeDetail();el(`orbit-node-${button.dataset.orbitRoute}`).scrollIntoView({block:'center',inline:'center',behavior:reduced.matches?'instant':'smooth'});}));
  el('colony-talents').addEventListener('click',()=>openTree());el('colony-unlock-monitor').addEventListener('click',()=>openTree('monitor'));
  el('colony-build-habitat').addEventListener('click',()=>openTree('recovery'));el('colony-lunar-upgrade').addEventListener('click',()=>openTree('lunarIndustry'));
  el('orbit-buy').addEventListener('click',()=>buy(talent));el('close-orbit-talents').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{closeDetail();viewChanged();});scroll.addEventListener('scroll',positionDetail,{passive:true});
  dialog.addEventListener('cancel',e=>{if(selected){e.preventDefault();closeDetail();}});
  let drag=null;
  scroll.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};scroll.setPointerCapture(e.pointerId);});
  scroll.addEventListener('pointermove',e=>{if(drag){scroll.scrollLeft=drag.left+drag.x-e.clientX;scroll.scrollTop=drag.top+drag.y-e.clientY;}});
  scroll.addEventListener('pointerup',()=>{drag=null;});scroll.addEventListener('pointercancel',()=>{drag=null;});
  for(let i=0;i<R.historyLimit;i++){const li=document.createElement('li');li.id=`orbit-log-${i}`;el('colony-log').append(li);}
  el('colony-archive').addEventListener('click',archive);el('colony-save').addEventListener('click',save);el('colony-speed').addEventListener('click',speed);
  el('colony-debug-speed').addEventListener('change',e=>{const s=getSession(),speed=Number(e.target.value);if(s.debug&&[1,5,10,20].includes(speed)){s.debugSpeed=speed;commit();}});
  const battle=el('colony-battle'),renderBattle=createRenderer(battle);
  function canvasContext(canvas){const{width,height}=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(!width||!height)return null;
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,width,height};}
  function paintTree(){const p=canvasContext(el('orbit-tree-sky'));if(!p)return;const size=`${p.width}:${p.height}:${devicePixelRatio}`;if(size!==treeSize){drawOrbitalTalentSky(p.ctx,p.width,p.height);treeSize=size;}}
  function paint(timestamp=performance.now()){
    const o=getSession().orbital;if(!o?.started||document.hidden){last=null;lastPaint=null;return;}
    if(last!==null&&!paused&&!reduced.matches)ambient+=Math.max(0,Math.min(.1,(timestamp-last)/1000));last=timestamp;
    if(lastPaint!==null&&timestamp>=lastPaint&&timestamp-lastPaint<1000/30)return;lastPaint=timestamp;
    if(dialog.open){paintTree();return;}
    if(ringBuild?.start===null)ringBuild.start=ambient;
    const construction=ringBuild&&ringBuild.rank===o.talents.recovery&&!reduced.matches&&!paused?Math.min(1,(ambient-ringBuild.start)/2):1;
    const p=canvasContext(el('colony-world'));if(p)drawOrbitalColony(p.ctx,p.width,p.height,o,{ambientTime:ambient,reducedMotion:reduced.matches,construction});
    if(construction===1)ringBuild=null;
    for(const site of SITES){const pos=sitePosition(site,reduced.matches?0:o.elapsed),node=el(`site-${site.id}`);node.style.left=`${pos.x/10}%`;node.style.top=`${pos.y/6.2}%`;node.hidden=!pos.visible;}
    const war=o.wars.find(w=>w.id===o.selectedWar);
    if(o.talents.monitor&&war){const site=SITES.find(site=>site.id===o.civilizations.find(c=>c.id===war.participants[0]).site);renderBattle(war.game,{skyTime:localSkyTime(o.elapsed,site)});}
    if(o.talents.outpost){const p=canvasContext(el('colony-moon'));if(p)drawLunarColony(p.ctx,p.width,p.height,o,{ambientTime:ambient,reducedMotion:reduced.matches});}
  }
  function sync(options={}){if(Object.hasOwn(options,'paused'))paused=options.paused;bind(buildOrbitalViewModel(getSession(),{paused,...options,talent,selected}));}
  return{sync,paint,get treeOpen(){return dialog.open;},dismiss(){dialog.close();}};
}
