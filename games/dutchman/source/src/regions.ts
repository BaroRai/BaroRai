import {WORLD} from './physics.ts';
import {ShipLayout} from './ship-layout.ts';
import {BASE_EQUIPMENT,statsFor} from './progression.ts';
import type {Equipment,Progress,ShipStats,StorageLike} from './progression.ts';

export type RegionId='shallows'|'coral'|'frost'|'ember'|'storm';
export type Edge='north'|'east'|'south'|'west';
export type Island={x:number,z:number,r:number,height:number};
export type EnemyKind={id:string,name:string,role:string,color:number,scale:number,layout:ShipLayout,equipment:Equipment,stats:ShipStats};
export type Region={
 id:RegionId,name:string,tier:number,description:string,theme:'tropical'|'coral'|'ice'|'volcanic'|'storm',
 sky:number,waterLow:number,waterHigh:number,sand:number,land:number,rock:number,accent:number,
 islands:readonly Island[],enemies:readonly EnemyKind[],enemyCount:number,
 recommended:{hull:number,broadside:number,knots:number},routes:Partial<Record<Edge,RegionId>>
};
export const EDGES:readonly Edge[]=['north','east','south','west'];
export const OPPOSITE:Record<Edge,Edge>={north:'south',south:'north',east:'west',west:'east'};
// +Z is north; +X is west, matching chartPoint and existing steering.
export function boundaryEdge(p:{x:number,z:number}):Edge|null{
 const extent=Math.max(Math.abs(p.x),Math.abs(p.z));
 if(extent<WORLD-65)return null;
 return Math.abs(p.z)>=Math.abs(p.x)?(p.z>0?'north':'south'):(p.x>0?'west':'east');
}
export function destination(region:Region,p:{x:number,z:number}){
 const edge=boundaryEdge(p);return edge&&region.routes[edge]?{edge,id:region.routes[edge]!}:null;
}
// Arrival lanes are clear of every region's islands and the southern dock.
export function arrivalFrom(exit:Edge){
 switch(exit){
  case 'north':return {x:145,z:-510,yaw:0};
  case 'south':return {x:0,z:510,yaw:Math.PI};
  case 'east':return {x:510,z:0,yaw:-Math.PI/2};
  case 'west':return {x:-510,z:0,yaw:Math.PI/2};
 }
}
const islands=(points:number[][]):Island[]=>points.map(([x,z,r,height=18])=>({x,z,r,height}));
function fleet(tier:number,colors:number[]):EnemyKind[]{
 const names=['Cutter','Brig','Bombard','Chaser','Dreadnought'];
 const roles=['Fast scout · light hull','Balanced line ship','Slow artillery · heavy volley','Fast flanker · lighter armour','Armoured flagship · many guns'];
 const hull=[65+20*tier,85+28*tier,115+35*tier,95+22*tier,180+40*tier];
 const speed=[12+2.5*tier,10+1.7*tier,8+tier,14+2.7*tier,7+.8*tier];
 const guns=[3+Math.floor(tier/3),3+Math.floor(tier/2),4+tier,3+Math.floor(tier/2),12];
 return Array.from({length:tier+1},(_,index)=>{
  const decks= index===4?3:index===2&&tier>=3?2:1;
  const lengthExtensions=Math.min(3,Math.max(0,guns[index]-3));
  const layout=new ShipLayout({lengthExtensions,widthUpgrades:decks-1,decks},{port:guns[index],starboard:guns[index]});
  const equipment={...BASE_EQUIPMENT,sails:index===0||index===3?Math.min(3,tier):0,cannonQuality:Math.min(3,Math.floor(tier/2)),reinforcement:index===2||index===4?Math.min(3,tier):0};
  return {id:'t'+tier+'-'+index,name:names[index],role:roles[index],color:colors[index%colors.length],
   scale:index===0?.78:index===3?.9:1,layout,equipment,
   stats:{maxHp:hull[index],maxSpeed:speed[index],acceleration:index===0||index===3?1:.65,
    turnRate:index===0||index===3?.8:.45,braking:2.8,damage:9+tier*2+index*2,reload:index===2||index===4?5.2:4.5,muzzleSpeed:60}};
 });
}
const starter:EnemyKind={id:'raider',name:'Raider',role:'Local patrol',color:0xd85143,scale:.85,layout:new ShipLayout(),equipment:{...BASE_EQUIPMENT},stats:{maxHp:65,maxSpeed:12,acceleration:.65,turnRate:.65,braking:2.8,damage:9,reload:4.5,muzzleSpeed:60}};
export const REGIONS:Record<RegionId,Region>={
 shallows:{id:'shallows',name:'The Shallows',tier:0,description:'Familiar warm water. Four buoy-marked routes lead to more demanding seas.',theme:'tropical',
 sky:0xa6dfd8,waterLow:0x096378,waterHigh:0x21a3a6,sand:0xe2c78f,land:0x639e75,rock:0x648b85,accent:0xf6c96d,
 islands:islands([[-190,100,42],[165,200,48],[-340,-210,62],[320,-240,55],[35,430,50],[450,330,35],[-460,370,55]]),
 enemies:[starter],enemyCount:8,recommended:{hull:100,broadside:75,knots:35},
 routes:{north:'coral',east:'frost',south:'ember',west:'storm'}},
 coral:{id:'coral',name:'Coral Reach',tier:1,description:'Rose reefs and low sandbars. Nimble cutters weave around slower, tougher brigs.',theme:'coral',
 sky:0xf1cfb1,waterLow:0x126e79,waterHigh:0x47c9b0,sand:0xf3cfa2,land:0xe18c83,rock:0xab6e80,accent:0xffb88f,
 islands:islands([[-330,250,55,11],[-235,140,35,9],[-140,70,28,8],[80,260,58,12],[200,130,44,10],[310,-60,60,12],[-300,-220,65,13],[170,-220,40,8]]),
 enemies:fleet(1,[0xe07769,0xa44056]),enemyCount:9,recommended:{hull:100,broadside:100,knots:40},routes:{south:'shallows'}},
 frost:{id:'frost',name:'Frostwake',tier:2,description:'Pale ice spires and narrow channels. Quick scouts, line brigs and heavy bombards share these cold waters.',theme:'ice',
 sky:0xc5d6e6,waterLow:0x1d496a,waterHigh:0x518fa9,sand:0xa9c6db,land:0xe6f1f3,rock:0x658bad,accent:0xbfe9fc,
 islands:islands([[-310,270,58,42],[-300,70,42,36],[-320,-180,50,40],[230,290,55,48],[250,80,40,34],[280,-170,58,43],[0,140,38,30],[70,-170,38,28]]),
 enemies:fleet(2,[0x84c2dc,0x386b99,0xd3dfef]),enemyCount:10,recommended:{hull:120,broadside:180,knots:43},routes:{west:'shallows'}},
 ember:{id:'ember',name:'Ember Strait',tier:3,description:'Black rock, glowing craters and amber water. Armoured artillery ships are screened by swift flankers.',theme:'volcanic',
 sky:0xc79987,waterLow:0x343f51,waterHigh:0x8a6862,sand:0x534943,land:0x463c42,rock:0x70515a,accent:0xff9a48,
 islands:islands([[-280,200,70,46],[170,250,80,52],[330,40,50,37],[200,-210,65,45],[-230,-180,65,40],[-60,300,30,24],[-380,-30,35,26]]),
 enemies:fleet(3,[0xd49762,0xa94438,0x494957,0xefb545]),enemyCount:11,recommended:{hull:145,broadside:260,knots:45},routes:{north:'shallows'}},
 storm:{id:'storm',name:'Stormglass',tier:4,description:'Tall slate stacks beneath a violet sky. Five rival hulls mix pursuit speed with formidable broadside power.',theme:'storm',
 sky:0x9291b2,waterLow:0x263349,waterHigh:0x556582,sand:0x777b90,land:0x626781,rock:0x444c69,accent:0xc9b9ff,
 islands:islands([[-340,300,42,52],[-180,220,36,44],[50,310,40,55],[270,240,50,58],[320,-80,46,48],[130,-180,50,42],[-180,-170,45,40],[-340,-60,36,50],[-20,60,28,38]]),
 enemies:fleet(4,[0x8e9cd4,0x6c558e,0x353950,0x74b7b4,0xcea667]),enemyCount:12,recommended:{hull:165,broadside:400,knots:47},routes:{east:'shallows'}}
};
export function readiness(region:Region,progress:Progress,hp:number){
 const stats=statsFor(progress);
 return [
  {label:'Current hull',actual:Math.ceil(hp),recommended:region.recommended.hull,unit:'HP'},
  {label:'Weaker broadside',actual:Math.min(progress.guns.port,progress.guns.starboard)*stats.damage,recommended:region.recommended.broadside,unit:'damage'},
  {label:'Top speed',actual:Math.round(stats.maxSpeed*1.94),recommended:region.recommended.knots,unit:'knots'}
 ];
}
export const REGION_SAVE_KEY='dutchman-region-v1';
export function normalizeRegion(value:unknown):RegionId{
 return typeof value==='string'&&Object.hasOwn(REGIONS,value)?value as RegionId:'shallows';
}
export function loadRegionId(storage:StorageLike):RegionId{try{return normalizeRegion(storage.getItem(REGION_SAVE_KEY));}catch{return 'shallows';}}
export function saveRegionId(storage:StorageLike,id:RegionId){try{storage.setItem(REGION_SAVE_KEY,id);return true;}catch{return false;}}
