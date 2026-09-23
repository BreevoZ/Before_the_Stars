import { createBindings } from './dom-bindings.js';
import { SITES, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as A, ORBITAL_RULES as R } from './orbital-config.js';
import { startOrbitalWar, intervene, purchaseOrbitalTalent } from './orbital-game.js';
import { buildOrbitalViewModel } from './orbital-view-model.js';
import { drawOrbitalColony, drawOrbitalTalentSky, sitePosition } from './orbital-render.js';
import { createRenderer } from './render.js';
const ICONS={orbit:'M3 12h18M12 3a7 9 0 1 0 .1 0M5 7v10M19 7v10',eye:'M2 12Q12 1 22 12Q12 23 2 12M15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0',sword:'M5 20L19 4l1 5L9 20M4 14l7 7',spark:'M13 2L5 14h7l-1 8 8-13h-7z',lock:'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',beam:'M8 3h8M12 3v11M4 21l8-7 8 7M8 21l4-7 4 7',archive:'M5 4h14v17H5zM8 8h8M8 12h8M8 16h5',leaf:'M5 20Q2 3 21 3Q22 19 5 20M5 20L16 8',nodes:'M5 6L19 7 12 20 5 6M5 6h1M19 7h1M12 20h1',link:'M3 8l6-4 6 4-6 4zM9 16l6-4 6 4-6 4z',moon:'M16 3A9 9 0 1 0 21 17A10 10 0 0 1 16 3',star:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z'};
export function createOrbitalColonyUI(getSession,{commit,archive,save,speed,viewChanged}){
  const el=id=>document.getElementById(id),bind=createBindings(document),dialog=el('orbit-talents-dialog');
  let talent='monitor';const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function selectCivilization(site,key){const o=getSession().orbital,c=o?.civilizations.find(c=>c.site===site);if(c){o[key]=c.id;
    if(key==='selectedCivilization'&&c.warId){const w=o.wars.find(w=>w.id===c.warId);o.selectedWar=w.id;o.selectedOpponent=w.participants.find(id=>id!==c.id);}commit();}}
  for(const site of SITES){
    for(const which of ['first','opponent']){const opt=document.createElement('option');opt.id=`${which}-${site.id}`;opt.value=site.id;el(`colony-${which}`).append(opt);}
    const p=sitePosition(site),button=document.createElement('button');button.id=`site-${site.id}`;button.className='orbit-site';button.type='button';button.style.left=`${p.x/10}%`;button.style.top=`${p.y/6.2}%`;button.innerHTML=`<span id="site-${site.id}-age"></span><small>${site.name}</small>`;
    button.addEventListener('click',()=>selectCivilization(site.id,'selectedCivilization'));el('colony-map').append(button);
  }
  el('colony-first').addEventListener('change',e=>selectCivilization(e.target.value,'selectedCivilization'));
  el('colony-opponent').addEventListener('change',e=>selectCivilization(e.target.value,'selectedOpponent'));
  el('colony-start-war').addEventListener('click',()=>{const s=getSession(),o=s.orbital;if(startOrbitalWar(s,o.selectedCivilization,o.selectedOpponent))commit();});
  for(const [key,a]of Object.entries(A)){
    const button=document.createElement('button');button.id=`intervene-${key}`;button.type='button';button.title=a.description;
    button.innerHTML=`<strong>${a.name}</strong><small id="intervene-${key}-cost"></small><small id="intervene-${key}-state"></small>`;
    button.addEventListener('click',()=>{const s=getSession();if(intervene(s,s.orbital.selectedCivilization,key))commit();});el('colony-interventions').append(button);
  }
  for(let i=0;i<3;i++){const button=document.createElement('button');button.id=`watch-war-${i}`;button.type='button';button.addEventListener('click',()=>{const o=getSession().orbital;if(o.wars[i]){const w=o.wars[i];o.selectedWar=w.id;[o.selectedCivilization,o.selectedOpponent]=w.participants;commit();}});el('colony-wars').append(button);}
  el('colony-auto').addEventListener('change',e=>{const o=getSession().orbital;if(o?.talents.weaving){o.autoWar=e.target.checked;commit();}});
  const NS='http://www.w3.org/2000/svg';
  for(const [key,t]of Object.entries(T)){
    for(const parent of Object.keys(t.requires)){
      const from=T[parent],path=document.createElementNS(NS,'path');path.id=`orbit-edge-${parent}-${key}`;
      path.setAttribute('d',`M${from.x} ${from.y} C${from.x} ${(from.y+t.y)/2} ${t.x} ${(from.y+t.y)/2} ${t.x} ${t.y}`);
      path.setAttribute('class',parent==='protocol'?'trunk':'branch');el('orbit-tree-edges').append(path);
    }
    const node=document.createElement('button');node.id=`orbit-node-${key}`;node.type='button';node.className=`orbit-node${t.keystone||t.root?' keystone':''}`;node.style.left=`${t.x}px`;node.style.top=`${t.y}px`;
    node.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[t.icon]}"/></svg><span class="orbit-node-name">${t.name}</span><span id="orbit-rank-${key}" class="orbit-rank"></span><small id="orbit-cost-${key}"></small>`;
    node.addEventListener('click',()=>{talent=key;sync();});node.addEventListener('dblclick',()=>buy(key));
    node.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;e.preventDefault();
      const axis=e.code==='ArrowLeft'||e.code==='ArrowRight'?'x':'y',sign=e.code==='ArrowLeft'||e.code==='ArrowUp'?-1:1;
      const next=Object.entries(T).filter(([,n])=>(n[axis]-t[axis])*sign>0).sort(([,a],[,b])=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y))[0];if(next)el(`orbit-node-${next[0]}`).focus();
    });el('orbit-tree-nodes').append(node);
  }
  function buy(key){if(!purchaseOrbitalTalent(getSession(),key))return;talent=key;commit();
    if(!reduced.matches){el(`orbit-node-${key}`).animate([{scale:1},{scale:1.17},{scale:1}],{duration:450});el('orbit-tree-wallet').animate([{color:'#efdaa0',scale:1.06},{scale:1}],{duration:500});
      for(const p of Object.keys(T[key].requires))el(`orbit-edge-${p}-${key}`).animate([{stroke:'#f0dfa7',strokeDasharray:'5 9',strokeDashoffset:40},{strokeDashoffset:0}],{duration:650});}
  }
  function openTree(){if(!getSession().orbital?.started)return;if(!dialog.open)dialog.showModal();sync();paintTree();el(`orbit-node-${talent==='monitor'?'protocol':talent}`).scrollIntoView({block:talent==='monitor'?'end':'center',inline:'center'});el(`orbit-node-${talent}`).focus({preventScroll:true});viewChanged();}
  el('colony-talents').addEventListener('click',openTree);el('colony-unlock-monitor').addEventListener('click',()=>{talent='monitor';openTree();});
  el('orbit-buy').addEventListener('click',()=>buy(talent));el('close-orbit-talents').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',viewChanged);
  for(let i=0;i<R.historyLimit;i++){const li=document.createElement('li');li.id=`orbit-log-${i}`;el('colony-log').append(li);}
  el('colony-archive').addEventListener('click',archive);el('colony-save').addEventListener('click',save);el('colony-speed').addEventListener('click',speed);
  el('colony-debug-speed').addEventListener('change',e=>{const s=getSession(),speed=Number(e.target.value);if(s.debug&&[1,5,10,20].includes(speed)){s.debugSpeed=speed;commit();}});
  const battle=el('colony-battle'),renderBattle=createRenderer(battle);
  function canvasContext(canvas){const {width,height}=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(!width||!height)return null;
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,width,height};}
  function paintTree(){const p=canvasContext(el('orbit-tree-sky'));if(p)drawOrbitalTalentSky(p.ctx,p.width,p.height);}
  function paint(){const o=getSession().orbital;if(!o?.started||document.hidden)return;if(dialog.open){paintTree();return;}
    const p=canvasContext(el('colony-world'));if(p)drawOrbitalColony(p.ctx,p.width,p.height,o,{reducedMotion:reduced.matches});
    const war=o.wars.find(w=>w.id===o.selectedWar);if(o.talents.monitor&&war&&battle.width>0)renderBattle(war.game);
  }
  function sync(options={}){bind(buildOrbitalViewModel(getSession(),{...options,talent}));}
  return{sync,paint,get treeOpen(){return dialog.open;},dismiss(){dialog.close();}};
}
