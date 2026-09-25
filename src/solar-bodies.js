// Presentation catalogue. Satellites belong to a planetary system; observing
// one never unlocks a route, facility, or colony in the economic simulation.
import { BODIES, bodyById } from './solar-config.js';
import { DAY_NIGHT_CYCLE_SECONDS, LUNAR_ORBIT_SECONDS } from './celestial-clock.js';
// Real sidereal periods in Earth days (negative: retrograde, like Triton).
// Every local system shares one clock, anchored so the Moon keeps VI's month:
// all satellites keep their true ratios to each other. Orbit radii stay
// compressed for readability, but their order is the real one.
const PERIODS=Object.freeze({rhea:4.5182,iapetus:79.3215,miranda:1.4135,ariel:2.5204,proteus:1.1223,nereid:360.13,nix:24.855,hydra:38.202,charon:6.3872,moon:27.322,phobos:.3189,deimos:1.2624,io:1.7691,europa:3.5512,ganymede:7.1546,callisto:16.689,enceladus:1.3702,titan:15.945,titania:8.7059,oberon:13.463,triton:-5.8769});
export const SATELLITE_DAY_SECONDS=LUNAR_ORBIT_SECONDS/PERIODS.moon;
export const satellitePeriodSeconds=m=>m.period*SATELLITE_DAY_SECONDS;
const moon=(id,name,parent,color,kind,orbit,size,phase,description)=>Object.freeze({id,name,parent,color,surface:kind,orbit,size,phase,period:PERIODS[id],kind:'moon',description});
export const SATELLITES=Object.freeze([
  moon('moon','月球','earth','#a6b6aa','rock',1.65,.23,.8,'最初的地外家园。月面工场、质量投射器与深空船坞，让文明的生产线延伸到地球之外。'),
  moon('phobos','火卫一','mars','#9c8975','rock',1.45,.065,1.4,'近处的岩石小卫星，沿着火星的弧面掠过。'),
  moon('deimos','火卫二','mars','#b2a18c','rock',2.05,.045,4.4,'更远的微小伴星。这里仍然安静，没有人类驻地。'),
  moon('io','木卫一','jupiter','#c5ad78','volcanic',1.45,.10,2.2,'火山活动塑造着斑驳的表面。'),
  moon('europa','木卫二','jupiter','#c7c7ac','ice',1.8,.085,5.2,'纵横的裂隙覆在冰壳上，壳下是尚未抵达的海洋。'),
  moon('ganymede','木卫三','jupiter','#9d9f90','rock',2.15,.14,.5,'冰与古老岩石交错的世界，远远环绕着木星。'),
  moon('callisto','木卫四','jupiter','#878779','rock',2.5,.13,3.3,'撞击坑覆盖了这颗外侧卫星，留下漫长岁月的痕迹。'),
  moon('enceladus','土卫二','saturn','#ced5c6','ice',2.15,.065,4,'明亮的冰壳与细长裂隙，藏着另一片地下海洋。'),
  moon('rhea','土卫五','saturn','#b7bcb2','ice',2.4,.08,2.9,'土星第二大的卫星，几乎全由水冰构成的冰岩球。'),
  moon('titan','土卫六','saturn','#baa16d','cloud',2.7,.16,.5,'厚重的雾霭包裹着甲烷湖。未来的家园，需要适应这里的寒冷。'),
  moon('iapetus','土卫八','saturn','#a8a699','rock',3,.08,5.6,'一面漆黑、一面雪白的双色卫星，赤道上还有一道长长的山脊。'),
  moon('miranda','天卫五','uranus','#aeb3ab','ice',1.62,.05,4.1,'被拼凑起来的小卫星，维罗纳断崖高达二十公里，是太阳系最高的悬崖。'),
  moon('ariel','天卫一','uranus','#b3bab4','ice',1.82,.07,2.2,'天王星最亮的卫星，表面布满纵横的峡谷。'),
  moon('titania','天卫三','uranus','#a4afa8','ice',2.05,.12,1,'冰与岩石构成的卫星，在倾斜的行星系统中缓缓运行。'),
  moon('oberon','天卫四','uranus','#989c96','rock',2.32,.11,3.8,'远离太阳的古老冰岩世界。'),
  moon('proteus','海卫八','neptune','#8f9290','rock',1.45,.05,5.1,'形状不规则的暗色小卫星，紧贴着海王星运行。'),
  moon('triton','海卫一','neptune','#b4c0be','ice',2,.16,2.5,'淡色冰面绕行在海王星之外，逆向的轨道划过深空。'),
  moon('nereid','海卫二','neptune','#9a9d98','ice',2.6,.04,.9,'轨道极扁的远方卫星，一圈要将近一年。'),
  moon('charon','卡戎','pluto','#a3a39a','ice',1.85,.34,1.9,'几乎有冥王星一半大的伴星，两者彼此潮汐锁定，永远以同一面相对。北极一片暗红，是从冥王星逃逸的甲烷留下的。'),
  moon('nix','冥卫二','pluto','#c3c4bc','ice',2.3,.045,3.3,'细长的小冰块，在冥王星与卡戎外侧翻滚着绕行。'),
  moon('hydra','冥卫三','pluto','#cfd0c8','ice',2.6,.045,.6,'冥王星最外侧的小卫星，冰壳明亮得像一面镜子。'),
]);
export const MOON=SATELLITES[0];
export const DESTINATIONS=BODIES;
export const destination=id=>bodyById(id)??SATELLITES.find(b=>b.id===id);
export const systemOf=id=>destination(id)?.parent??id;
export const satellitesOf=id=>SATELLITES.filter(b=>b.parent===id);
export const bodyKindLabel=b=>b.id==='moon'?'月面家园':b.parent?'自然卫星':({home:'文明摇篮',habitable:'殖民世界',industrial:b.belt?'资源星域':'行星工业',relay:'深空前哨',dwarf:'矮行星 · 柯伊伯带'}[b.kind]);
// Planets turn at their real sidereal day on the surface clock (Earth: one VI
// day). Mercury and Venus barely turn; Venus and Uranus turn backwards.
const DAY=DAY_NIGHT_CYCLE_SECONDS;
export const BODY_SURFACES=Object.freeze({
  mercury:{surface:'rock',spin:DAY*58.646,tilt:.03},venus:{surface:'cloud',spin:-DAY*243.02,tilt:.04,atmosphere:'#d6bd86'},
  earth:{surface:'earth',spin:DAY,tilt:.12,atmosphere:'#89b8ad'},mars:{surface:'mars',spin:DAY*1.026,tilt:.16,atmosphere:'#bd8d70'},
  jupiter:{surface:'gas',spin:DAY*.4135,tilt:.05,atmosphere:'#bba283'},saturn:{surface:'gas',spin:DAY*.444,tilt:.35,atmosphere:'#bbaa84',rings:{tilt:-.35,inner:1.18,outer:2.03}},
  uranus:{surface:'gas',spin:-DAY*.7183,tilt:1.64,atmosphere:'#9ac4c2',rings:{tilt:-1.64,inner:1.45,outer:1.53,faint:true}},
  neptune:{surface:'gas',spin:DAY*.6713,tilt:.18,atmosphere:'#789bbd'},
  // Pluto turns backwards, locked face to face with Charon.
  pluto:{surface:'ice',spin:-DAY*6.3872,tilt:.4,atmosphere:'#c8c3b4'},
});
// Satellites are tidally locked: one turn per orbit, so the same face looks home.
export const surfaceOf=b=>BODY_SURFACES[b.id]??{surface:b.surface??'rock',spin:b.period?satellitePeriodSeconds(b):180,tilt:.12};
