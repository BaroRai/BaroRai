import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {REGIONS,EDGES,OPPOSITE,destination,arrivalFrom,boundaryEdge,readiness,loadRegionId,saveRegionId,normalizeRegion} from '../src/regions.ts';
import {RegionWorld,edgePoint} from '../src/region-world.ts';
import {RegionSlot} from '../src/region-slot.ts';
import {EnemyModels} from '../src/enemy-models.ts';
import {freshProgress,quoteUpgrade,saveProgress,loadProgress} from '../src/progression.ts';
import {HARBOUR,PORT_OBSTACLES,canDock,inHarbour} from '../src/harbour.ts';

test('four hub extensions are reciprocal and have increasing fleets and distinct islands',()=>{
 assert.equal(Object.keys(REGIONS).length,5);
 assert.equal(destination(REGIONS.shallows,{x:0,z:0}),null);
 assert.equal(boundaryEdge({x:534,z:0}),null);
 const signatures=new Set<string>();
 for(const edge of EDGES){
  const target=REGIONS.shallows.routes[edge]!;const region=REGIONS[target];
  assert.equal(destination(REGIONS.shallows,edgePoint(edge,580))?.id,target);
  assert.equal(region.routes[OPPOSITE[edge]],'shallows');
  assert.equal(region.enemyCount,8+region.tier);
  assert.equal(region.enemies.length,region.tier+1);
  assert.equal(Object.keys(region.routes).length,1);
  for(const other of EDGES)if(other!==OPPOSITE[edge])assert.equal(destination(region,edgePoint(other,580)),null);
  signatures.add(JSON.stringify(region.islands));
 }
 assert.equal(signatures.size,4);
 assert.equal(boundaryEdge({x:580,z:0}),'west');
 assert.equal(boundaryEdge({x:-580,z:0}),'east');
});

test('every arrival and mini-port has clearance for the largest player hull',()=>{
 for(const region of Object.values(REGIONS)){
  assert.ok(canDock({x:HARBOUR.spawnX,z:HARBOUR.spawnZ}));
  for(const edge of EDGES){
   const p=arrivalFrom(edge);
   assert.equal(boundaryEdge(p),null,'Arrival must not immediately offer another crossing');
   for(const island of region.islands)assert.ok(Math.hypot(p.x-island.x,p.z-island.z)>island.r+14,region.name+' arrival '+edge);
   for(const obstacle of PORT_OBSTACLES)assert.ok(Math.hypot(p.x-obstacle.x,p.z-obstacle.z)>obstacle.r+14);
  }
  for(const island of region.islands)assert.ok(!inHarbour(island,island.r+14),region.name+' harbour island overlap');
 }
});
test('NPC roles trade speed for firepower and fit modular layouts',()=>{
 for(const region of Object.values(REGIONS)){
  const ids=new Set<string>();
  for(const kind of region.enemies){
   ids.add(kind.id);
   for(const side of [-1,1]){
    const mounts=kind.layout.mounts(side);
    assert.equal(mounts.length,kind.layout.armament[side<0?'port':'starboard']);
    assert.ok(mounts.length<=18);
   }
   assert.ok(kind.stats.maxHp>0&&kind.stats.maxSpeed>0&&kind.stats.damage>0);
  }
  assert.equal(ids.size,region.enemies.length);
  if(region.tier){
   const [cutter,brig]=region.enemies;
   assert.ok(cutter.stats.maxSpeed>brig.stats.maxSpeed);
   assert.ok(cutter.stats.maxHp<brig.stats.maxHp);
   assert.ok(cutter.stats.damage<brig.stats.damage);
  }
 }
});
test('recommendations use current damage and weaker broadside without spending player progress',()=>{
 const p=freshProgress();p.wallet=5000;p.guns={port:2,starboard:3};
 const before=JSON.stringify(p),rows=readiness(REGIONS.storm,p,55.2);
 assert.equal(rows[0].actual,56);assert.equal(rows[1].actual,50);
 assert.equal(JSON.stringify(p),before);
 assert.ok(rows.some(row=>row.actual<row.recommended));
});
test('region save is isolated from upgrades and handles invalid or unavailable storage',()=>{
 const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
 let p=freshProgress();p.wallet=5000;p=quoteUpgrade(p,'lengthExtensions').next!;
 saveProgress(storage,p);
 for(const region of Object.values(REGIONS)){assert.equal(saveRegionId(storage,region.id),true);assert.equal(loadRegionId(storage),region.id);assert.deepEqual(loadProgress(storage),p);}
 assert.equal(normalizeRegion('__proto__'),'shallows');assert.equal(normalizeRegion('invalid'),'shallows');
 const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}};
 assert.equal(loadRegionId(denied),'shallows');assert.equal(saveRegionId(denied,'coral'),false);
});
test('region slot destroys the previous world before constructing another, including failure',()=>{
 let live=0,peak=0;
 const slot=new RegionSlot<{dispose():void}>();
 for(let i=0;i<30;i++)slot.replace(()=>{assert.equal(live,0);live++;peak=Math.max(peak,live);return {dispose(){live--;}};});
 assert.equal(peak,1);slot.clear();slot.clear();assert.equal(live,0);
 slot.replace(()=>{live++;return{dispose(){live--;}};});
 assert.throws(()=>slot.replace(()=>{assert.equal(live,0);throw Error('factory');}));
 assert.equal(slot.value,undefined);assert.equal(live,0);
});
test('repeated region swaps release every geometry/material and detach old scenes',()=>{
 const scene=new T.Scene(),slot=new RegionSlot<RegionWorld>();
 for(let cycle=0;cycle<3;cycle++)for(const region of Object.values(REGIONS)){
  const old=slot.value;
  const next=slot.replace(()=>new RegionWorld(region));scene.add(next.root);next.animate(cycle);
  assert.equal(scene.children.length,1);
  if(old)assert.equal(old.root.children.length,0);
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  next.root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  let gd=0,md=0;
  for(const g of geometries)g.addEventListener('dispose',()=>gd++);
  for(const m of materials)m.addEventListener('dispose',()=>md++);
  slot.clear();next.dispose();
  assert.equal(gd,geometries.size);assert.equal(md,materials.size);assert.equal(scene.children.length,0);
 }
});
test('enemy caches are bounded to active variants and dispose borrowed-clone resources exactly once',()=>{
 const names=['wood','deck','trim','dark','playerSail','enemySail','red'] as const;
 const materials=Object.fromEntries(names.map(key=>[key,new T.MeshLambertMaterial()])) as ConstructorParameters<typeof EnemyModels>[0];
 const cache=new EnemyModels(materials);
 let borrowedDisposed=0;for(const m of Object.values(materials))m.addEventListener('dispose',()=>borrowedDisposed++);
 for(const region of Object.values(REGIONS)){
  for(const kind of region.enemies){
   const a=cache.clone(kind),b=cache.clone(kind);
   assert.notEqual(a,b);assert.equal((a.children[0] as T.Mesh).geometry,(b.children[0] as T.Mesh).geometry);
  }
  assert.equal(cache.size,region.enemies.length);cache.dispose();assert.equal(cache.size,0);
 }
 assert.equal(borrowedDisposed,0);for(const m of Object.values(materials))m.dispose();
});
