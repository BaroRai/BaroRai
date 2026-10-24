import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshProgress,quoteUpgrade,quoteCannons,statsFor,layoutFor,normalizeProgress,saveProgress,loadProgress,UPGRADES,START_ELEVATION,MUZZLE_SPEED} from '../src/progression.ts';
import {HARBOUR,inHarbour,canDock,crossesHarbour,outsideHarbour} from '../src/harbour.ts';
import {ballistic,trajectoryImpact,trajectorySamples} from '../src/physics.ts';

test('pairs are atomic, while future side-specific purchases remain independent',()=>{
  let p=freshProgress();p.wallet=10000;
  assert.equal(quoteUpgrade(p,'cannons').next,null);
  p=quoteUpgrade(p,'lengthExtensions').next!;
  assert.deepEqual(p.guns,{port:3,starboard:3});
  const pair=quoteUpgrade(p,'cannons');assert.deepEqual(pair.next!.guns,{port:4,starboard:4});assert.equal(pair.next!.wallet,p.wallet-pair.price);
  const port=quoteCannons(p,['port']).next!;assert.deepEqual(port.guns,{port:4,starboard:3});
  assert.equal(quoteUpgrade(port,'cannons').next,null);assert.equal(port.guns.starboard,3);
  const starboard=quoteCannons(port,['starboard']).next!;assert.deepEqual(starboard.guns,{port:4,starboard:4});
  assert.equal(layoutFor(port).mounts(-1).length,4);assert.equal(layoutFor(port).mounts(1).length,3);
});

test('empty decks add capacity, all nine upgrade categories are capped and affordable purchases are immutable',()=>{
  let p=freshProgress();p.wallet=100000;assert.equal(quoteUpgrade(p,'decks').next,null);
  for(const id of ['widthUpgrades','lengthExtensions','decks','sails','helm','anchor','reinforcement','cannonQuality'] as const){
    while(quoteUpgrade(p,id).next){const before=JSON.stringify(p),next=quoteUpgrade(p,id).next!;assert.equal(JSON.stringify(p),before);assert.ok(next.wallet<p.wallet);p=next;}
  }
  assert.deepEqual(p.guns,{port:3,starboard:3});assert.equal(p.upgrades.decks,3);
  while(quoteUpgrade(p,'cannons').next)p=quoteUpgrade(p,'cannons').next!;
  assert.deepEqual(p.guns,{port:18,starboard:18});assert.equal(UPGRADES.length,9);
  for(const item of UPGRADES)assert.equal(quoteUpgrade(p,item.id).next,null);
  const max=statsFor(p),base=statsFor(freshProgress());assert.ok(max.maxHp>base.maxHp);assert.ok(max.maxSpeed>base.maxSpeed);assert.ok(max.turnRate>base.turnRate);assert.ok(max.braking>base.braking);assert.ok(max.damage>base.damage);
  assert.equal(quoteUpgrade(freshProgress(),'sails').next,null);
});

test('progress survives storage round trips and malformed/blocked storage cannot crash the game',()=>{
  const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  let p=freshProgress();p.wallet=900;p=quoteUpgrade(p,'sails').next!;
  assert.equal(saveProgress(storage,p),true);assert.deepEqual(loadProgress(storage),p);
  assert.deepEqual(normalizeProgress(null),freshProgress());assert.deepEqual(normalizeProgress({version:99}),freshProgress());
  const bad=normalizeProgress({version:1,wallet:-10,upgrades:{lengthExtensions:999,widthUpgrades:0,decks:999,sails:NaN},guns:{port:999,starboard:-4}});
  assert.equal(bad.wallet,0);assert.equal(bad.upgrades.decks,1);assert.equal(bad.upgrades.lengthExtensions,3);assert.deepEqual(bad.guns,{port:6,starboard:0});
  const blocked={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};assert.deepEqual(loadProgress(blocked),freshProgress());assert.equal(saveProgress(blocked,p),false);
});

test('harbour protection includes boundary crossings and dock proximity is distinct',()=>{
  assert.ok(inHarbour({x:HARBOUR.x,z:HARBOUR.z}));assert.ok(canDock({x:HARBOUR.spawnX,z:HARBOUR.spawnZ}));
  assert.equal(canDock({x:HARBOUR.x,z:HARBOUR.z+60}),false);
  assert.ok(crossesHarbour({x:-200,z:-400},{x:200,z:-400}));assert.equal(crossesHarbour({x:-200,z:0},{x:200,z:0}),false);
  const p=outsideHarbour({x:0,z:-400},20);assert.ok(Math.hypot(p.x-HARBOUR.x,p.z-HARBOUR.z)>=HARBOUR.radius+20);
});

test('10-degree fire is flatter with approximately the former combat range',()=>{
  const apex=(speed:number,angle:number)=>Math.pow(speed*Math.sin(angle*Math.PI/180),2)/19.62;
  assert.ok(apex(MUZZLE_SPEED,START_ELEVATION)<apex(46,22)*.5);
  const range=(speed:number,angle:number)=>{const vy=speed*Math.sin(angle*Math.PI/180);return speed*Math.cos(angle*Math.PI/180)*(vy+Math.sqrt(vy*vy+19.62*3.6))/9.81;};
  assert.ok(Math.abs(range(MUZZLE_SPEED,START_ELEVATION)/range(46,22)-1)<.15);
});

test('coarse preview and fixed-step shots agree on moving water impact time',()=>{
  for(const launch of [0,2,7])for(const angle of [10,35,55]){
    const origin={x:20,y:3.6,z:100},velocity={x:60*Math.cos(angle*Math.PI/180),y:60*Math.sin(angle*Math.PI/180),z:12};
    const impact=(step:number)=>{for(let t=0;t<12;t+=step){const hit=trajectoryImpact(origin,velocity,t,t+step,launch,[]);if(hit)return hit;}throw Error('No impact');};
    assert.ok(Math.abs(impact(.09).age-impact(1/60).age)<.001);
  }
});

test('terrain clipping catches a narrow obstacle crossed between endpoints',()=>{
  const origin={x:-20,y:4,z:0},velocity={x:60,y:0,z:0};
  const hit=trajectoryImpact(origin,velocity,0,.6,0,[{x:0,z:0,r:2,height:12}]);
  assert.equal(hit?.kind,'land');assert.ok(Math.abs(hit!.point.x+2)<.001);
  const samples=trajectorySamples(10*Math.PI/180,60);const before=JSON.stringify(samples);ballistic(origin,velocity,1);assert.equal(JSON.stringify(samples),before);
});
