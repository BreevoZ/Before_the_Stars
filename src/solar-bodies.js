// Presentation catalogue. Satellites belong to a planetary system; observing
// one never unlocks a route, facility, or colony in the economic simulation.
import { BODIES, bodyById } from './solar-config.js';
const moon=(id,name,parent,color,kind,orbit,size,phase,description)=>Object.freeze({id,name,parent,color,surface:kind,orbit,size,phase,kind:'moon',description});
export const SATELLITES=Object.freeze([
  moon('moon','月球','earth','#a6b6aa','rock',1.65,.23,.8,'最初的地外家园。月面工场、质量投射器与深空船坞，让文明的生产线延伸到地球之外。'),
  moon('phobos','火卫一','mars','#9c8975','rock',1.45,.065,1.4,'近处的岩石小卫星，沿着火星的弧面掠过。'),
  moon('deimos','火卫二','mars','#b2a18c','rock',2.05,.045,4.4,'更远的微小伴星。这里仍然安静，没有人类驻地。'),
  moon('io','木卫一','jupiter','#c5ad78','volcanic',1.45,.10,2.2,'火山活动塑造着斑驳的表面。'),
  moon('europa','木卫二','jupiter','#c7c7ac','ice',1.8,.085,5.2,'纵横的裂隙覆在冰壳上，壳下是尚未抵达的海洋。'),
  moon('ganymede','木卫三','jupiter','#9d9f90','rock',2.15,.14,.5,'冰与古老岩石交错的世界，远远环绕着木星。'),
  moon('callisto','木卫四','jupiter','#878779','rock',2.5,.13,3.3,'撞击坑覆盖了这颗外侧卫星，留下漫长岁月的痕迹。'),
  moon('enceladus','土卫二','saturn','#ced5c6','ice',2.15,.065,4,'明亮的冰壳与细长裂隙，藏着另一片地下海洋。'),
  moon('titan','土卫六','saturn','#baa16d','cloud',2.65,.16,.5,'厚重的雾霭包裹着甲烷湖。未来的家园，需要适应这里的寒冷。'),
  moon('titania','天卫三','uranus','#a4afa8','ice',1.8,.12,1,'冰与岩石构成的卫星，在倾斜的行星系统中缓缓运行。'),
  moon('oberon','天卫四','uranus','#989c96','rock',2.3,.11,3.8,'远离太阳的古老冰岩世界。'),
  moon('triton','海卫一','neptune','#b4c0be','ice',2,.16,2.5,'淡色冰面绕行在海王星之外，逆向的轨道划过深空。'),
]);
export const MOON=SATELLITES[0];
export const DESTINATIONS=BODIES;
export const destination=id=>bodyById(id)??SATELLITES.find(b=>b.id===id);
export const systemOf=id=>destination(id)?.parent??id;
export const satellitesOf=id=>SATELLITES.filter(b=>b.parent===id);
export const bodyKindLabel=b=>b.id==='moon'?'月面家园':b.parent?'自然卫星':({home:'文明摇篮',habitable:'殖民世界',industrial:b.belt?'资源星域':'行星工业',relay:'深空前哨'}[b.kind]);
export const BODY_SURFACES=Object.freeze({
  mercury:{surface:'rock',spin:180,tilt:.03},venus:{surface:'cloud',spin:-240,tilt:.04,atmosphere:'#d6bd86'},
  earth:{surface:'earth',spin:120,tilt:.12,atmosphere:'#89b8ad'},mars:{surface:'mars',spin:150,tilt:.16,atmosphere:'#bd8d70'},
  jupiter:{surface:'gas',spin:85,tilt:.05,atmosphere:'#bba283'},saturn:{surface:'gas',spin:100,tilt:.35,atmosphere:'#bbaa84',rings:{tilt:-.35,inner:1.18,outer:2.03}},
  uranus:{surface:'gas',spin:140,tilt:1.64,atmosphere:'#9ac4c2',rings:{tilt:-1.64,inner:1.45,outer:1.53,faint:true}},
  neptune:{surface:'gas',spin:120,tilt:.18,atmosphere:'#789bbd'},
});
export const surfaceOf=b=>BODY_SURFACES[b.id]??{surface:b.surface??'rock',spin:180,tilt:.12};
