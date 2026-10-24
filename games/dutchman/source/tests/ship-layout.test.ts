import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_SHIP,ShipLayout,firingSides,chartPoint,chartHeading} from '../src/ship-layout.ts';
import {ballistic,trajectorySamples} from '../src/physics.ts';

test('starting hull and rows preserve the original ship dimensions and gun count',()=>{
  assert.equal(BASE_SHIP.length,16);assert.equal(BASE_SHIP.width,7);
  assert.equal(BASE_SHIP.collisionRadius,7);assert.equal(BASE_SHIP.floatLength,6);assert.equal(BASE_SHIP.floatWidth,3);
  for(const side of [-1,1])assert.deepEqual(BASE_SHIP.mounts(side).map(m=>m.z),[-3,0,3]);
});

test('independent upgrades are bounded and cannons must fit the hull',()=>{
  for(let length=0;length<=3;length++)for(let width=0;width<=2;width++)for(let decks=1;decks<=3;decks++){
    const layout=new ShipLayout({lengthExtensions:length,widthUpgrades:width,decks,cannonsPerRow:99});
    assert.equal(layout.mounts(1).length,(3+length)*decks);
    for(const row of layout.rows){
      assert.equal(row.length,3+length);
      for(const mount of row){assert.ok(Math.abs(mount.z)<layout.length/2-2);assert.equal(Math.abs(mount.x),layout.width/2+1.25);}
      for(let i=1;i<row.length;i++)assert.equal(row[i].z-row[i-1].z,3);
    }
  }
  assert.deepEqual(new ShipLayout({lengthExtensions:99,widthUpgrades:99,decks:99,cannonsPerRow:99}).upgrades,{lengthExtensions:3,widthUpgrades:2,decks:3,cannonsPerRow:6});
  assert.deepEqual(new ShipLayout({lengthExtensions:-1,widthUpgrades:NaN,decks:0,cannonsPerRow:Infinity}).upgrades,{lengthExtensions:0,widthUpgrades:0,decks:1,cannonsPerRow:1});
});

test('normal view selects both broadsides and side views select only their side',()=>{
  assert.deepEqual(firingSides(0),[-1,1]);assert.deepEqual(firingSides(-1),[-1]);assert.deepEqual(firingSides(1),[1]);
});

test('north-up chart arrow follows projected movement through all headings',()=>{
  assert.deepEqual(chartPoint(0,0,600),[90,90]);
  assert.ok(chartPoint(10,0,600)[0]<90);
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,.37]){
    const [x,y]=chartPoint(Math.sin(yaw)*100,Math.cos(yaw)*100,600),angle=chartHeading(yaw);
    assert.ok(Math.abs((x-90)/(100/600*85)-Math.sin(angle))<1e-12);
    assert.ok(Math.abs((y-90)/(100/600*85)+Math.cos(angle))<1e-12);
  }
});

test('translated cached curves match actual projectiles on both sides, moving and on every deck',()=>{
  const layout=new ShipLayout({lengthExtensions:3,decks:3,cannonsPerRow:6});
  for(const angle of [5,22,55])for(const speed of [0,22])for(const yaw of [0,.8,-2]){
    const samples=trajectorySamples(angle*Math.PI/180,46),before=JSON.stringify(samples);
    const f={x:Math.sin(yaw),z:Math.cos(yaw)},r={x:Math.sin(yaw-Math.PI/2),z:Math.cos(yaw-Math.PI/2)};
    for(const side of [-1,1])for(const mount of layout.mounts(side)){
      const origin={x:20-r.x*mount.x+f.x*mount.z,y:mount.y+.7,z:-130-r.z*mount.x+f.z*mount.z};
      const velocity={x:r.x*side*46*Math.cos(angle*Math.PI/180)+f.x*speed,y:46*Math.sin(angle*Math.PI/180),z:r.z*side*46*Math.cos(angle*Math.PI/180)+f.z*speed};
      for(const p of samples){const expected=ballistic(origin,velocity,p.t);assert.ok(Math.abs(expected.x-(origin.x+r.x*side*p.x+f.x*speed*p.t))<1e-10);assert.ok(Math.abs(expected.y-(origin.y+p.y))<1e-10);assert.ok(Math.abs(expected.z-(origin.z+r.z*side*p.x+f.z*speed*p.t))<1e-10);}
    }
    assert.equal(JSON.stringify(samples),before);
  }
});
