import { voyageReady, voyageFixture, lunarFixture } from './orbital-colony-cases.js';
import { toV29 } from './colony-war-cases.js';
import { mountFixture } from './progression-cases.js';
import { serializeSession, parseSession, mapSessionQuantities, createSaveStore, DEBUG_SAVE_KEY } from '../src/save.js';
import { purchaseOrbitalTalent, getOrbitalTalentState, orbitalLegacySpent } from '../src/orbital-game.js';
import { ORBITAL_TALENTS } from '../src/orbital-config.js';
import { v23Shipyards } from './fixtures/v23-shipyard.js';
import { fromV23Record } from '../src/save-record.js';
import { setDebugLegacy } from '../src/debug.js';
import { drawLunarColony } from '../src/orbital-render.js';
import { Q } from '../src/quantity.js';
import { updateOrbital } from '../src/orbital-game.js';
import { FACILITIES, PIONEER, arrivalAt, arrived, facilityState, buildFacility, industryRate, facilityRate, route, legSeconds, legDistance, arksMoored, arksAway, arkTotal } from '../src/solar-industry.js';
import { reachNeed } from '../src/solar-tree-view-model.js';
import { SOLAR_TALENTS, solarTalentState, purchaseSolarTalent, windowOpen, windowTiming, transferState, transferCivilization, transferQuote, domeCapacity, colonyRate, colonistRate, COLONY_RULES } from '../src/solar-colony.js';
import { buildSolarTreeViewModel } from '../src/solar-tree-view-model.js';
import { buildSolarViewModel } from '../src/solar-view-model.js';
import { bodyPosition, BODIES } from '../src/solar-config.js';
import { solarViewport, bodyAt, DESTINATIONS, drawSolarSystem, drawBodyPortrait } from '../src/solar-render.js';
import { drawShipyard, ARK_COUNT } from '../src/shipyard-render.js';
import { voyageFrame, voyageGeometry, voyageIllumination, arkPose, drawVoyageScene, voyageMars, VOYAGE_SECONDS } from '../src/voyage-scene.js';
import { ANIMATION_CLIPS } from '../src/animation-clips.js';
import { SATELLITES, satellitesOf, systemOf, destination } from '../src/solar-bodies.js';
import { surfacePoint, spinOf } from '../src/planet-render.js';
import { drawWorldScene, worldGeometry, satellitePose, satelliteAt } from '../src/solar-world-render.js';

export function registerSolarTests(test, assert, near) {
  const throws=fn=>{let failed=false;try{fn();}catch{failed=true;}assert(failed,'Invalid shipyard record must be rejected');};
  test('Worlds: observing all nine systems and their satellites never unlocks routes, advances wars or changes the ledger',()=>{
    const s=voyageFixture(),raw=serializeSession(s);
    assert(!DESTINATIONS.some(b=>b.id==='moon') && satellitesOf('earth').length===1 && systemOf('moon')==='earth');
    assert(satellitesOf('mercury').length===0 && satellitesOf('venus').length===0);
    for(const b of [...DESTINATIONS,...SATELLITES]){
      const v=buildSolarViewModel(s,{view:b.id});assert(v['#colony-system@hidden'] && v['#colony-body-name']===b.name);
      assert(v[`#solar-select-${systemOf(b.id)}@aria-pressed`]==='true');
      for(const m of SATELLITES)assert(v[`#solar-moon-${m.id}@aria-pressed`]===String(m.id===b.id));
      if(b.parent&&b.id!=='moon')assert(v['#solar-facility@hidden']&&v['#solar-colony@hidden']);
    }
    const mars=buildSolarViewModel(s,{view:'mars'}),venus=buildSolarViewModel(s,{view:'venus'});
    assert(mars['#solar-select-mars@data-reach']==='transit'&&venus['#solar-select-venus@data-reach']==='survey'&&venus['#solar-facility-build@disabled']);
    assert(serializeSession(s)===raw);
  });
  test('World geometry: self rotation stays on a sphere; orbiting moons have depth and cannot be clicked through their parent',()=>{
    for(const t of [0,8,47,120]){const p=surfacePoint(.7,.4,spinOf(destination('mars'),t),.16);near(p.x*p.x+p.y*p.y+p.z*p.z,1);}
    assert(surfacePoint(0,0,0).z>0 && surfacePoint(0,0,Math.PI).z<0);
    for(const body of DESTINATIONS)for(const [w,h] of [[320,340],[900,500]]){
      const g=worldGeometry(body,w,h);
      for(const moon of satellitesOf(body.id))for(const t of [0,20,70,140]){
        const p=satellitePose(moon,t,g);assert(p.x-p.r>=0&&p.x+p.r<=w&&p.y-p.r>=0&&p.y+p.r<h);
        const hidden=p.z<0&&Math.hypot(p.x-g.x,p.y-g.y)<g.r+p.r;
        if(hidden)assert(satelliteAt(body,w,h,t,p.x,p.y)?.id!==moon.id);
        else assert(satelliteAt(body,w,h,t,p.x,p.y)?.id===moon.id);
      }
    }
  });
  test.browser('World rendering: distinct rotating spheres, rings and rocks; reduced motion freezes the whole local system without touching state',()=>{
    const s=voyageFixture(),raw=serializeSession(s),c=document.createElement('canvas');c.width=900;c.height=500;const x=c.getContext('2d'),images=new Set();
    for(const body of [...DESTINATIONS,...SATELLITES]){
      drawWorldScene(x,900,500,body,s.orbital,{reducedMotion:true});const quiet=c.toDataURL();images.add(quiet);
      drawWorldScene(x,900,500,body,{...s.orbital,elapsed:s.orbital.elapsed+31},{ambientTime:900,reducedMotion:true});assert(c.toDataURL()===quiet,body.id);
    }
    assert(images.size===DESTINATIONS.length+SATELLITES.length);
    for(const id of ['mars','jupiter','saturn','uranus','belt']){
      drawWorldScene(x,900,500,destination(id),s.orbital);const a=c.toDataURL();
      drawWorldScene(x,900,500,destination(id),{...s.orbital,elapsed:s.orbital.elapsed+23});assert(c.toDataURL()!==a,id);
    }
    assert(serializeSession(s)===raw);
  });
  test('Shipyard: seven paid ranks light seven arks, persist separately, and gate departure until the fleet is complete', () => {
    const clean=voyageReady({arks:0}),before=clean.permanent.legacy;let total=0;
    for(let rank=1;rank<=ARK_COUNT;rank++) {
      assert(getOrbitalTalentState(clean,'voyage')==='prerequisite' && !purchaseOrbitalTalent(clean,'voyage'));
      assert(purchaseOrbitalTalent(clean,'shipyard'));total+=ORBITAL_TALENTS.shipyard.costs[rank-1];
      assert(clean.orbital.talents.shipyard===rank && Q.eq(clean.permanent.legacy,Q.sub(before,total)));
      const raw=serializeSession(clean),back=parseSession(raw);assert(serializeSession(back)===raw && back.orbital.talents.shipyard===rank);
      const v=buildSolarViewModel(back,{view:'moon'});assert(v['#colony-lunar-arks'].includes(`${rank} / 7`));
      assert(v['#shipyard-gate-fleet@data-ready']===(rank===7));
    }
    assert(total===4161536 && !purchaseOrbitalTalent(clean,'shipyard') && purchaseOrbitalTalent(clean,'voyage'));
    // Complete prerequisites on a separate fixture; insufficient money must not add a rank.
    const noMoney=voyageReady({arks:0});setDebugLegacy(noMoney,0);
    assert(getOrbitalTalentState(noMoney,'shipyard')==='legacy' && !purchaseOrbitalTalent(noMoney,'shipyard') && noMoney.orbital.talents.shipyard===0);
  });
  test('Shipyard v24: genuine v23 owners inherit seven arks with their original payment, wallet and departure record intact', () => {
    for(const [key,raw] of Object.entries(v23Shipyards)) {
      const record=JSON.parse(raw);mapSessionQuantities(record,Q.decode);
      const old=fromV23Record(record),next=parseSession(raw),owned=key!=='unbuilt';
      assert(next.orbital.talents.shipyard===(owned?7:0));
      assert(Q.eq(next.permanent.legacy,old.permanent.legacy) && Q.eq(orbitalLegacySpent(next.orbital),orbitalLegacySpent(old.orbital)));
      assert(next.orbital.completionAt===old.orbital.completionAt && next.orbital.talents.voyage===old.orbital.talents.voyage);
      if(owned)assert(JSON.stringify(next.orbital.payments.shipyard)==='[4194304,0,0,0,0,0,0]');
      const saved=serializeSession(next);assert(serializeSession(parseSession(saved))===saved);
      const memory=new Map([[DEBUG_SAVE_KEY,raw]]),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
      const store=createSaveStore(()=>storage,{debug:true}),loaded=store.load();assert(loaded.ok&&loaded.migrated&&store.save(loaded.session).ok);
      assert(memory.get(`${DEBUG_SAVE_KEY}.backup`)===raw,'Keep the original v23 backup');
    }
    const bad=JSON.parse(v23Shipyards.ready);bad.orbital.talents.shipyard=7;throws(()=>parseSession(JSON.stringify(bad)));
    const migrated=JSON.parse(serializeSession(parseSession(v23Shipyards.ready)));migrated.orbital.payments.shipyard[1]='65536';throws(()=>parseSession(JSON.stringify(migrated)));
    migrated.orbital.payments.shipyard[1]='0';migrated.orbital.payments.shipyard[0]='32768';throws(()=>parseSession(JSON.stringify(migrated)));
  });
  test('Solar atlas: readiness and destinations derive from the real saved VI state without mutations', () => {
    const s=voyageReady(),raw=serializeSession(s),v=buildSolarViewModel(s,{view:'moon'});
    assert(v['#orbital-game@data-stage']==='VI' && v['#colony-system@hidden']);
    assert(v['#shipyard-status'].includes('整备完成') && v['#shipyard-voyage'].includes('签署'));
    assert(v['#shipyard-gate-ring@data-ready'] && v['#shipyard-gate-cycles@data-ready'] && v['#shipyard-gate-winter@data-ready']);
    assert(serializeSession(s)===raw);assert(purchaseOrbitalTalent(s,'voyage'));
    const vii=buildSolarViewModel(s,{view:'system',selected:'saturn'});
    assert(vii['#orbital-game@data-stage']==='VII' && !vii['#colony-system@hidden']);
    assert(vii['#colony-body-name']==='土星' && vii['#colony-body-card@hidden']);
    assert(vii['#shipyard-status'].includes('已启航'));
    assert(DESTINATIONS.length===9 && new Set(DESTINATIONS.map(b=>b.id)).size===9);
    assert(buildSolarViewModel(s,{view:'europa'})['#solar-body-period'].startsWith('3.6 天')&&buildSolarViewModel(s,{view:'triton'})['#solar-body-period'].includes('逆行'));
  });
  test('Arks: seven lights moor at Mars; each foothold takes one away, flies leg by leg through drydocks and stays as the station', () => {
    const s=voyageFixture(),o=s.orbital,run=seconds=>{for(let i=0;i<Math.round(seconds*30);i++)updateOrbital(s,1/30);};
    setDebugLegacy(s,2**39);const rejects=(raw,why)=>{let failed=false;try{parseSession(raw);}catch{failed=true;}assert(failed,why);};
    const land=()=>{while(o.solar.flights.length)run(1);};
    // The fleet is still flying: nothing is moored and nothing can leave.
    near(arrivalAt(o,'mars'),o.completionAt+PIONEER.seconds);assert(arksMoored(o)===0&&route(o,'venus').blocked==='harbor');
    for(const key of Object.keys(FACILITIES))assert(facilityState(s,key)==='prerequisite'&&!buildFacility(s,key));
    run(PIONEER.seconds+1);assert(arksMoored(o)===ARK_COUNT&&solarTalentState(s,'harbor')==='ready'&&purchaseSolarTalent(s,'harbor'));
    // Venus is within a chemical leg of Mars; the ark leaves the moored row.
    const leg=route(o,'venus');assert(leg.from==='mars'&&leg.via.length===0&&leg.seconds===legSeconds(legDistance('mars','venus')));
    const wallet=s.permanent.legacy;assert(buildFacility(s,'venus')&&arksMoored(o)===ARK_COUNT-1&&o.solar.flights[0].via.length===0);
    assert(Q.eq(s.permanent.legacy,Q.sub(wallet,FACILITIES.venus.costs[0]))&&facilityState(s,'venus')==='transit');
    let raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw,'An ark in flight round-trips');
    const stray=JSON.parse(raw);stray.orbital.solar.flights[0].via=['pluto'];rejects(JSON.stringify(stray),'Arks pass only through drydocks');
    const unpaid=JSON.parse(raw);unpaid.orbital.solar.payments.venus=[];rejects(JSON.stringify(unpaid),'Every ark is paid');
    land();assert(o.solar.facilities.venus===1&&arksMoored(o)===ARK_COUNT-1,'The ark stays at Venus as its station');
    const produced=o.solar.produced;run(10);near(Q.toNumber(Q.sub(o.solar.produced,produced)),FACILITIES.venus.base*10,FACILITIES.venus.base*.05);
    // Mercury and the belt need a nuclear drive; Jupiter needs fusion from the belt.
    assert(route(o,'mercury').blocked==='range'&&reachNeed(o,'mercury')==='需核热推进'&&purchaseSolarTalent(s,'nuclear'));
    assert(buildFacility(s,'mercury')&&buildFacility(s,'belt'));land();
    assert(reachNeed(o,'jupiter')==='需聚变推进'&&purchaseSolarTalent(s,'fusion')&&buildFacility(s,'jupiter'));land();
    // Saturn is one deep leg from Mars; Uranus goes through the Jupiter drydock, Neptune through Uranus.
    for(const key of ['fuel','jupiterDock','deepDrive'])assert(purchaseSolarTalent(s,key),key);
    assert(route(o,'saturn').via.length===0&&buildFacility(s,'saturn'));
    const uranus=route(o,'uranus');assert(uranus.via.join()==='jupiter'&&buildFacility(s,'uranus'));
    assert(o.solar.flights.find(f=>f.body==='uranus').via.join()==='jupiter');run(5);
    raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw,'A relayed ark round-trips');land();
    assert(reachNeed(o,'neptune')==='需天王星船坞中转'&&purchaseSolarTalent(s,'uranusDock'));
    assert(route(o,'neptune').via.join()==='jupiter,uranus'&&arksMoored(o)===1&&buildFacility(s,'neptune')&&arksMoored(o)===0);
    // Seven arks, seven stations: the belt's forge is the only way to more.
    assert(arkTotal(o)===ARK_COUNT&&arksAway(o)===ARK_COUNT);
    const extra=JSON.parse(serializeSession(s));extra.orbital.solar.flights.push({...extra.orbital.solar.flights[0],body:'belt'});rejects(JSON.stringify(extra),'No more arks away than the fleet');
    assert(purchaseSolarTalent(s,'arkForge')&&arksMoored(o)===1);
    // Upgrades by world: Venus refining, the Mercury furnace, sails for every flight.
    const venus=facilityRate(o,'venus');assert(purchaseSolarTalent(s,'refinery')&&facilityRate(o,'venus')===venus*2);
    const industry=industryRate(o);assert(purchaseSolarTalent(s,'solarSail')&&purchaseSolarTalent(s,'smelter'));near(industryRate(o),industry*1.5);
    assert(transferQuote(o,{age:1}).seconds===COLONY_RULES.travelSeconds*.7||!windowOpen(o));
  });
  test('Satellites: each moon branches off its planet, needs that foothold, costs no ark and does what its node says', () => {
    const s=voyageFixture(),o=s.orbital,run=n=>{for(let i=0;i<Math.round(n*30);i++)updateOrbital(s,1/30);},land=()=>{while(o.solar.flights.length)run(1);};
    setDebugLegacy(s,2**39);run(PIONEER.seconds+1);
    for(const [key,t] of Object.entries(SOLAR_TALENTS).filter(([,t])=>t.satellite))assert(Object.keys(t.requires).length===1&&[140,280].includes(Math.abs(t.x-SOLAR_TALENTS[Object.keys(t.requires)[0]].x))&&t.y===1270,key);
    assert(solarTalentState(s,'phobos')==='prerequisite'&&purchaseSolarTalent(s,'harbor'));
    const civ={age:3},before=transferQuote(o,civ).cost,moored=arksMoored(o);
    assert(purchaseSolarTalent(s,'phobos')&&transferQuote(o,civ).cost===Math.round(before*.75)&&arksMoored(o)===moored,'A lander, not an ark');
    for(const key of ['venus','nuclear','belt'])assert(purchaseSolarTalent(s,key),key);land();assert(purchaseSolarTalent(s,'fusion')&&purchaseSolarTalent(s,'jupiter'));land();
    const jupiter=facilityRate(o,'jupiter');assert(purchaseSolarTalent(s,'io')&&facilityRate(o,'jupiter')===jupiter*2);
    const total=arkTotal(o);assert(purchaseSolarTalent(s,'ganymede')&&arkTotal(o)===total+1);
    assert(solarTalentState(s,'titan')==='planned'&&!purchaseSolarTalent(s,'titan'));
    const view=buildSolarViewModel(s,{view:'io'});assert(view['#solar-body-note'].includes('木星采集站 ×2'));
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
  });
  test('Map v30: v29 saves refund 近日隔热 and talents whose new prerequisite is missing, and keep a dome by granting 火星港 free', () => {
    const s=voyageFixture();setDebugLegacy(s,2**36);for(let i=0;i<30*(PIONEER.seconds+1);i++)updateOrbital(s,1/30);
    const old=toV29(JSON.parse(serializeSession(s))),sol=old.orbital.solar,M=2**20;
    Object.assign(sol.talents,{heat:1,dome:1,fusion:1,harbor:0});Object.assign(sol.payments,{heat:[String(12*M)],dome:[String(16*M)],fusion:[String(320*M)]});
    const next=parseSession(JSON.stringify(old)),n=next.orbital.solar;
    assert(n.talents.harbor===1&&Q.eq(n.payments.harbor[0],0),'A dome keeps its harbour, free');
    assert(n.talents.fusion===0&&!n.payments.fusion&&!('heat' in n.talents)&&!n.payments.heat,'Refunded: 近日隔热, and fusion without a belt foothold');
    assert(Q.eq(next.permanent.legacy,Q.sub(s.permanent.legacy,16*M)),'Only the dome stays paid; refunds return to the wallet');
    assert(n.facilities.neptune===0&&serializeSession(parseSession(serializeSession(next)))===serializeSession(next));
  });
  test('Industry v25–v27: older saves gain empty ledgers and new talents; VI saves never own footholds', () => {
    const s=voyageFixture(),old=JSON.parse(serializeSession(s));old.version=24;old.orbital.version=10;delete old.orbital.solar;
    const next=parseSession(JSON.stringify(old));assert(Object.values(next.orbital.solar.facilities).every(v=>v===0)&&Q.eq(next.orbital.solar.produced,0));
    assert(next.orbital.solar.flights.length===0&&next.orbital.solar.talents.harbor===0);
    setDebugLegacy(s,2**40);const v26=toV29(JSON.parse(serializeSession(s)));v26.version=26;v26.orbital.version=12;delete v26.orbital.solar.flights;v26.orbital.solar.colonies={mars:[]};for(const k of ['heat','harbor','nuclear','fusion','uplift'])delete v26.orbital.solar.talents[k];
    v26.orbital.solar.facilities.jupiter=1;v26.orbital.solar.payments.jupiter=[String(FACILITIES.jupiter.costs[0])];
    const kept=parseSession(JSON.stringify(v26));assert(kept.orbital.solar.facilities.jupiter===1&&kept.orbital.solar.talents.fusion===0,'Footholds built under v26 stay');
    const vi=voyageReady();vi.orbital.solar.facilities.venus=1;vi.orbital.solar.payments.venus=[FACILITIES.venus.costs[0]];
    let rejected=false;try{parseSession(serializeSession(vi));}catch{rejected=true;}assert(rejected,'Industry needs 远航协议');
    const view=buildSolarViewModel(s,{view:'venus'});assert(!view['#solar-facility@hidden']&&view['#solar-facility-build'].includes('火星港')&&view['#solar-facility-build@disabled']);
    assert(buildSolarViewModel(s,{view:'system',selected:'mars'})['#colony-body-status'].includes('先遣编队'));
    assert(buildSolarViewModel(s,{view:'system',selected:'saturn'})['#solar-facility@hidden']);
  });
  test('Windows: the Earth–Mars alignment opens and closes on the synodic clock, and the countdown lands on the change', () => {
    const o=voyageFixture().orbital,start=o.elapsed;let changes=0,was=windowOpen(o);
    for(let t=0;t<3000;t+=5){o.elapsed=start+t;const now=windowOpen(o);if(now!==was){changes++;was=now;}}
    assert(changes>=2,'A Mars synodic period brings both an opening and a closing');
    o.elapsed=start;const timing=windowTiming(o);o.elapsed=start+timing.seconds+.5;assert(windowOpen(o)!==timing.open,'The countdown ends where the window changes');
    o.elapsed=start+timing.seconds-.5;assert(windowOpen(o)===timing.open);
  });
  test('Transfer: an idle Earth civilization flies to the Mars dome, pays by age and window, frees its site and works on arrival', () => {
    const s=voyageFixture(),o=s.orbital,run=seconds=>{for(let i=0;i<Math.round(seconds*30);i++)updateOrbital(s,1/30);};setDebugLegacy(s,'1e13');
    assert(solarTalentState(s,'harbor')==='transit'&&solarTalentState(s,'dome')==='prerequisite'&&!purchaseSolarTalent(s,'dome'),'The dome waits for the Mars harbour');
    run(95);assert(purchaseSolarTalent(s,'harbor')&&purchaseSolarTalent(s,'dome')&&purchaseSolarTalent(s,'transfer')&&solarTalentState(s,'uplift')==='ready');
    run(70);assert(o.phase==='living');const civ=o.civilizations.find(c=>c.alive&&!c.warId);assert(civ&&transferState(s,civ.id)==='ready');
    const quote=transferQuote(o,civ),wallet=s.permanent.legacy;assert(Q.eq(quote.cost,COLONY_RULES.transferBase*2**(civ.age-1)*(quote.open?1:COLONY_RULES.lateCost)));
    assert(transferCivilization(s,civ.id)&&!o.civilizations.some(c=>c.id===civ.id)&&o.solar.transfers.length===1&&Q.eq(s.permanent.legacy,Q.sub(wallet,quote.cost)));
    const second=o.civilizations.find(c=>c.alive&&!c.warId);assert(!second||transferState(s,second.id)==='fleet','One transfer ark until 转运舰队');
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
    run(quote.seconds+1);assert(o.solar.transfers.length===0&&o.solar.colonies.mars.civs.length===1&&colonyRate(o)===colonistRate(civ));
    const produced=o.solar.produced;run(10);assert(Q.toNumber(Q.sub(o.solar.produced,produced))>=colonyRate(o)*9);
    // Capacity: two residents per dome rank.
    assert(domeCapacity(o)===COLONY_RULES.domeCapacity);
    // Tampering: a colonist over capacity, or a transfer without payment, is rejected.
    const over=JSON.parse(serializeSession(s));over.orbital.solar.colonies.mars.civs.push({...over.orbital.solar.colonies.mars.civs[0],id:'c9-99'},{...over.orbital.solar.colonies.mars.civs[0],id:'c9-98'});
    let rejected=false;try{parseSession(JSON.stringify(over));}catch{rejected=true;}assert(rejected,'Dome capacity holds');
    const unpaid=JSON.parse(serializeSession(s));unpaid.orbital.solar.payments.transfers=[];rejected=false;try{parseSession(JSON.stringify(unpaid));}catch{rejected=true;}assert(rejected,'Every transfer is paid');
  });
  test('VII tree: the root is owned, facilities are the same nodes as in the dossiers, planned nodes cannot be bought, and v25 saves gain empty colonies', () => {
    const s=voyageFixture(),o=s.orbital;setDebugLegacy(s,'1e13');
    let v=buildSolarTreeViewModel(s,{talent:'venus',selected:true});
    assert(v['#solar-node-voyage@data-state']==='max'&&v['#solar-node-venus@data-state']==='prerequisite'&&v['#solar-gate-venus']==='需火星港'&&v['#solar-node-harbor@data-state']==='cycles'&&v['#solar-gate-harbor'].startsWith('编队'));
    for(let i=0;i<30*(PIONEER.seconds+1);i++)updateOrbital(s,1/30);assert(purchaseSolarTalent(s,'harbor'));v=buildSolarTreeViewModel(s,{talent:'venus',selected:true});
    assert(v['#solar-node-venus@data-state']==='ready'&&v['#solar-buy'].includes('派遣方舟')&&v['#solar-detail-requires'].includes('火星 → 金星')&&v['#solar-detail-branch'].includes('VENUS'));
    assert(purchaseSolarTalent(s,'venus')&&o.solar.flights.length===1,'Buying the node dispatches the ark');
    v=buildSolarTreeViewModel(s,{talent:'venus',selected:true});assert(v['#solar-node-venus@data-state']==='cycles'&&v['#solar-gate-venus'].startsWith('方舟'));
    for(let i=0;i<30*90;i++)updateOrbital(s,1/30);assert(o.solar.facilities.venus===1);
    assert(solarTalentState(s,'starship')==='planned'&&!purchaseSolarTalent(s,'starship'));
    assert(buildSolarTreeViewModel(s,{talent:'starship',selected:true})['#solar-buy@disabled']);
    const old=toV29(JSON.parse(serializeSession(voyageFixture())));old.version=25;old.orbital.version=11;for(const k of ['talents','colonies','transfers','nextTransfer','flights'])delete old.orbital.solar[k];
    const next=parseSession(JSON.stringify(old));assert(next.orbital.solar.colonies.mars.civs.length===0&&next.orbital.solar.talents.dome===0);
  });
  test('Solar atlas: uniform projection and shared hit positions stay in bounds at desktop and mobile sizes', () => {
    for(const [w,h] of [[1400,700],[390,350],[320,350]]) {
      const v=solarViewport(w,h);near(v.x*2+1000*v.scale,w);near(v.y*2+500*v.scale,h);
      for(const b of BODIES.filter(b=>!b.belt)) {
        const p=bodyPosition(b,0);assert(p.x>0 && p.x<1000 && p.y>0 && p.y<500);
        assert(bodyAt({elapsed:0},p.x,p.y).id===b.id);
      }
    }
  });
  test('Voyage: tree fades before seven lights depart, moon stays in place, one sun lights both worlds and actions arrive last', () => {
    assert(voyageFrame(0).treeOpacity===1 && voyageFrame(4.5).treeOpacity===0);
    assert(voyageFrame(0).moonReveal===0 && voyageFrame(10).moonReveal===1 && voyageFrame(26).actions===0);
    // The Moon eases in: silhouette before sunlight, with no step between frames.
    for(let t=0;t<14;t+=.05){const a=voyageFrame(t),b=voyageFrame(t+.05);assert(b.moonReveal>=a.moonReveal&&b.moonReveal-a.moonReveal<.02&&b.moonLight-a.moonLight<.02);assert(a.moonLight<=a.moonReveal+1e-9);}
    assert(voyageIllumination(1,0)>voyageIllumination(-1,0) && voyageIllumination(0,-1)>voyageIllumination(0,1));
    for(const [w,h] of [[1400,800],[390,750],[320,600]]){
      const start=voyageGeometry(0,w,h),end=voyageGeometry(VOYAGE_SECONDS,w,h);
      near(start.moon.r,end.moon.r);near(start.moon.x,end.moon.x);assert(Math.abs(start.moon.y-end.moon.y)<h*.04);
      assert(start.moon.y+start.moon.r<start.earth.y-start.earth.r,'Moon stays fully above the horizon');
    }
    const targets=new Set();
    for(let i=0;i<ARK_COUNT;i++) {
      const dock=arkPose(i,5,1000,700),end=arkPose(i,VOYAGE_SECONDS,1000,700);
      assert(dock.flight===0 && dock.x===dock.launchX && dock.y===dock.launchY);
      assert(end.flight===1 && end.radius<dock.radius);near(end.x,end.targetX);near(end.y,end.targetY);
      for(let t=7;t<26;t+=.25){const a=arkPose(i,t,1000,700),b=arkPose(i,t+.001,1000,700);assert(Math.hypot(a.x-b.x,a.y-b.y)<1,'No sudden launch jump');}
      targets.add(`${end.x}:${end.y}`);const mars=voyageMars(1000,700);assert(Math.hypot(end.x-mars.x,end.y-mars.y)<80,'The whole fleet is bound for Mars');
    }
    assert(targets.size===7 && arkPose(0,10,1000,700).flight>arkPose(6,10,1000,700).flight);
    assert(voyageFrame(VOYAGE_SECONDS).actions===1 && voyageFrame(0,true).complete);
    assert(ANIMATION_CLIPS.some(c=>c.id==='interplanetary-voyage' && c.kind==='voyage'));
  });
  test('Voyage: purchase is atomic before presentation and reloading cannot charge or settle it again', () => {
    const s=voyageReady(),before=s.permanent.legacy;assert(purchaseOrbitalTalent(s,'voyage'));
    const raw=serializeSession(s),back=parseSession(raw);assert(Q.lt(back.permanent.legacy,before));
    assert(back.orbital.talents.voyage===1 && !purchaseOrbitalTalent(back,'voyage'));
    assert(serializeSession(back)===raw && buildSolarViewModel(back,{view:'system'})['#orbital-game@data-stage']==='VII');
  });
  test.browser('Voyage rendering: shipyard phases, planetary portraits and launch frames differ; reduced motion is stable and read-only', () => {
    const c=document.createElement('canvas');c.width=700;c.height=500;const x=c.getContext('2d'),s=voyageReady(),raw=serializeSession(s);
    drawShipyard(x,700,500,s.orbital);const dock=c.toDataURL();drawShipyard(x,700,500,{...s.orbital,talents:{...s.orbital.talents,voyage:1}});assert(c.toDataURL()!==dock);
    const portraits=new Set();for(const b of DESTINATIONS){drawBodyPortrait(x,700,500,b,s.orbital);portraits.add(c.toDataURL());}assert(portraits.size===DESTINATIONS.length);
    drawSolarSystem(x,700,500,s.orbital,{reducedMotion:true});const quiet=c.toDataURL();drawSolarSystem(x,700,500,s.orbital,{reducedMotion:true,ambientTime:90});assert(c.toDataURL()===quiet);
    const moons=new Set();for(let rank=0;rank<=ARK_COUNT;rank++){drawLunarColony(x,700,500,{...s.orbital,talents:{...s.orbital.talents,shipyard:rank}},{reducedMotion:true});moons.add(c.toDataURL());}assert(moons.size===8,'Each purchased ark appears on the Moon');
    const frames=new Set();for(const t of [0,4,8,14,22,30]){drawVoyageScene(x,700,500,t);frames.add(c.toDataURL());}assert(frames.size===6);
    drawVoyageScene(x,700,500,0,{reducedMotion:true});const still=c.toDataURL();drawVoyageScene(x,700,500,12,{reducedMotion:true});assert(c.toDataURL()===still && serializeSession(s)===raw);
  });
  test.browser('World economy UI: dispatch from Venus still pays once, lands while observing another world and restores its saved flight',async()=>{
    const s=voyageFixture();setDebugLegacy(s,2**36);for(let i=0;i<30*(PIONEER.seconds+1);i++)updateOrbital(s,1/30);assert(purchaseSolarTalent(s,'harbor'));
    const before=s.permanent.legacy,frame=await mountFixture(serializeSession(s),false,'debug',{reducedMotion:true});
    try{
      const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      el('solar-select-venus').click();assert(!el('solar-facility-build').disabled && !el('solar-facility').hidden);
      el('solar-facility-build').click();el('solar-facility-build').click();
      const saved=parseSession(w.__storage.getItem(DEBUG_SAVE_KEY));assert(saved.orbital.solar.flights.length===1 && Q.eq(saved.permanent.legacy,Q.sub(before,FACILITIES.venus.costs[0])));
      assert(el('solar-facility-build').disabled && el('solar-facility-build').textContent.includes('航行中'));
      el('solar-select-saturn').click();for(let i=0;i<100;i++)w.__testFrame(now+=100);
      el('solar-select-venus').click();w.__testFrame(now+=100);
      assert(el('solar-facility-level').textContent==='1 / 5' && !el('solar-facility-build').disabled);
      assert(el('solar-nav-state-venus').textContent==='驻地' && !d.body.dataset.fixtureError);
    }finally{frame.remove();}
  });
  test.browser('Shipyard UI: seven purchases update the lunar lights, gates, prices and persisted ranks without enabling early departure', async () => {
    const frame=await mountFixture(serializeSession(voyageReady({arks:0})),false,'debug',{reducedMotion:true});
    try {
      const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      el('colony-pause').click();el('colony-view-moon').click();w.__testFrame(now+=100);
      let moon=el('colony-moon').toDataURL();
      for(let rank=1;rank<=ARK_COUNT;rank++) {
        el('shipyard-build').click();assert(el('orbit-buy').textContent.includes(Q.format(ORBITAL_TALENTS.shipyard.costs[rank-1])));
        el('orbit-buy').click();assert(parseSession(w.__storage.getItem(DEBUG_SAVE_KEY)).orbital.talents.shipyard===rank);
        el('close-orbit-talents').click();w.__testFrame(now+=100);
        assert(el('colony-lunar-arks').textContent.includes(`${rank} / 7`));
        const next=el('colony-moon').toDataURL();assert(next!==moon);moon=next;
        assert(el('shipyard-gate-fleet').dataset.ready===String(rank===7));
        assert(el('shipyard-voyage').textContent.includes(rank===7?'签署':'条件'));
      }
      el('shipyard-build').click();assert(el('orbit-buy').disabled && !el('orbit-detail').textContent.includes('undefined'));
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
  });
  test.browser('VI tree: lunar income and wars continue; tree pause, save dialog and hidden page stop simulation without catch-up', async () => {
    const seed=lunarFixture();seed.debugSpeed=1;
    const frame=await mountFixture(serializeSession(seed),false,'debug',{reducedMotion:true});
    try {
      const w=frame.contentWindow,d=frame.contentDocument,el=id=>d.getElementById(id);let now=0;
      const tick=n=>{for(let i=0;i<n;i++)w.__testFrame(now+=100);};
      el('colony-start-war').click();el('colony-talents').click();tick(20);
      el('orbit-tree-pause').click();const time=el('colony-time').textContent,wallet=el('colony-lunar-produced').textContent;tick(20);
      assert(el('colony-time').textContent===time && el('colony-lunar-produced').textContent===wallet && el('orbit-tree-pause').getAttribute('aria-pressed')==='true');
      el('orbit-tree-pause').click();tick(120);assert(el('colony-time').textContent!==time && el('colony-lunar-produced').textContent!==wallet,`Tree did not resume: hidden=${d.hidden}, dialogs=${[...d.querySelectorAll('dialog[open]')].map(x=>x.id)}, time=${time}/${el('colony-time').textContent}, wallet=${wallet}/${el('orbit-tree-wallet').textContent}`);
      el('close-orbit-talents').click();el('colony-save').click();const savedTime=el('colony-time').textContent;tick(20);assert(el('colony-time').textContent===savedTime);
      el('manual-save').click();const saved=parseSession(w.__storage.getItem(DEBUG_SAVE_KEY));assert(saved.orbital.lunarProduced>seed.orbital.lunarProduced && saved.orbital.wars[0].game.elapsed>0);
      el('close-save').click();el('colony-talents').click();Object.defineProperty(d,'hidden',{configurable:true,value:true});d.dispatchEvent(new w.Event('visibilitychange'));tick(20);assert(el('colony-time').textContent===savedTime);
      Object.defineProperty(d,'hidden',{configurable:true,value:false});d.dispatchEvent(new w.Event('visibilitychange'));w.__testFrame(now+=3600000);assert(el('colony-time').textContent===savedTime,'No offline catch-up');
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
  });
  test.browser('Voyage UI: committed purchase survives refresh; skip and replay release modal pause without a second charge', async () => {
    let frame=await mountFixture(serializeSession(voyageReady()),false,'debug'),raw;
    try {
      const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      const tick=n=>{for(let i=0;i<n;i++)w.__testFrame(now+=100);};
      el('colony-talents').click();el('orbit-node-voyage').click();el('orbit-buy').click();
      assert(el('voyage-dialog').open && el('orbit-talents-dialog').open);raw=w.__storage.getItem(DEBUG_SAVE_KEY);assert(parseSession(raw).orbital.talents.voyage===1);
      el('orbit-buy').click();assert(w.__storage.getItem(DEBUG_SAVE_KEY)===raw,'Repeated clicks cannot charge twice');
      const time=el('colony-time').textContent;tick(30);assert(el('colony-time').textContent===time);
      el('voyage-skip').click();assert(el('voyage-dialog').dataset.phase==='arrived' && !el('voyage-actions').inert);
      const title=el('voyage-title').getBoundingClientRect().top;tick(20);near(el('voyage-title').getBoundingClientRect().top,title);
      el('voyage-enter').click();assert(!el('voyage-dialog').open && !el('orbit-talents-dialog').open && el('orbital-game').dataset.view==='system');
      tick(10);assert(el('colony-time').textContent!==time);
      el('solar-replay').click();el('voyage-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert(el('voyage-dialog').dataset.phase==='arrived');
      el('voyage-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert(!el('voyage-dialog').open);
      assert(parseSession(w.__storage.getItem(DEBUG_SAVE_KEY)).orbital.talents.voyage===1);
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
    frame=await mountFixture(raw,false,'debug');try{assert(frame.contentDocument.getElementById('orbital-game').dataset.view==='system' && !frame.contentDocument.getElementById('voyage-dialog').open);}finally{frame.remove();}
  });
  test.browser('Voyage UI: full film and reduced-motion arrival keep fixed layout, preserve manual pause and recover from canvas failure', async () => {
    for(const reducedMotion of [false,true]) {
      const frame=await mountFixture(serializeSession(voyageFixture()),false,'debug',{reducedMotion});
      try {
        const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
        el('colony-pause').click();el('solar-replay').click();for(let i=0;i<VOYAGE_SECONDS*10+10;i++)w.__testFrame(now+=100);
        assert(el('voyage-dialog').dataset.phase==='arrived');el('voyage-enter').click();assert(el('colony-pause').getAttribute('aria-pressed')==='true');
        el('voyage-canvas').getContext=()=>{throw Error('Test canvas failure');};el('solar-replay').click();
        assert(!el('voyage-dialog').open && !el('orbit-talents-dialog').open && el('orbital-game').dataset.view==='system');
        el('colony-pause').click();assert(el('colony-pause').getAttribute('aria-pressed')==='false');
      } finally {frame.remove();}
    }
  });
  test.browser('Solar UI: independent worlds, nested satellites and overview remain usable at 320/390/1100px', async () => {
    const frame=await mountFixture(serializeSession(voyageFixture()),false,'debug',{reducedMotion:true});
    try {
      const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      for(const width of [320,390,1100]) {
        frame.style.width=`${width}px`;await new Promise(r=>setTimeout(r,35));w.__testFrame(now+=100);
        el('solar-overview').click();w.__testFrame(now+=100);
        assert(d.documentElement.scrollWidth<=width+2,`System overflow at ${width}`);
        const chart=el('colony-system-canvas'),r=chart.getBoundingClientRect();near(chart.width/chart.height,r.width/r.height);
        assert(!el('solar-navigation').hidden && !el('solar-select-moon'),'The Moon is not a top-level destination');
        for(const body of DESTINATIONS){
          el(`solar-select-${body.id}`).click();w.__testFrame(now+=100);
          assert(el('orbital-game').dataset.view===body.id && el('colony-system').hidden);
          assert(el(`solar-select-${body.id}`).getAttribute('aria-pressed')==='true');
          if(body.id!=='earth')assert(!el('colony-body-card').hidden && el('colony-body-name').textContent===body.name);
          assert(d.documentElement.scrollWidth<=width+2,`${body.id} overflow at ${width}`);
        }
        el('solar-select-saturn').click();
        el('solar-select-saturn').dispatchEvent(new w.KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));assert(el('colony-body-name').textContent==='天王星');
        // Satellites drop down from their planet: hovering Jupiter lists exactly its four moons.
        el('solar-select-jupiter').dispatchEvent(new w.PointerEvent('pointerenter',{pointerType:'mouse'}));
        assert(!el('solar-moon-menu').hidden && !el('solar-moon-europa').hidden && el('solar-moon-titan').hidden && el('solar-moon-menu-title').textContent.includes('4 颗'));
        el('solar-moon-europa').click();w.__testFrame(now+=100);assert(el('solar-moon-menu').hidden);
        assert(el('orbital-game').dataset.view==='europa' && el('solar-select-jupiter').getAttribute('aria-pressed')==='true' && el('solar-facility').hidden);
        el('solar-select-jupiter').click();assert(el('orbital-game').dataset.view==='jupiter');
        el('solar-select-mercury').dispatchEvent(new w.PointerEvent('pointerenter',{pointerType:'mouse'}));assert(el('solar-moon-menu').hidden,'No menu without satellites');
        el('solar-select-earth').click();el('solar-select-earth').dispatchEvent(new w.PointerEvent('pointerenter',{pointerType:'mouse'}));el('solar-moon-moon').click();w.__testFrame(now+=100);
        assert(el('orbital-game').dataset.view==='moon' && !el('colony-shipyard').hidden && el('solar-select-earth').getAttribute('aria-pressed')==='true');
        el('shipyard-build').click();assert(el('orbit-talents-dialog').open);el('close-orbit-talents').click();
        el('solar-select-earth').click();assert(el('orbital-game').dataset.view==='earth');
        el('colony-talents').click();assert(el('solar-talents-dialog').open && !el('orbit-talents-dialog').open);el('close-solar-talents').click();
      }
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
  });
}
