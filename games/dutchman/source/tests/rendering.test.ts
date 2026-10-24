import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {consolidate,disposeGeometry,mesh} from '../src/rendering.ts';
import {makeShip} from '../src/ship-model.ts';
import {BASE_SHIP,ShipLayout} from '../src/ship-layout.ts';
import {BASE_EQUIPMENT} from '../src/progression.ts';

test('consolidation preserves world bounds, batches materials, and disposes owned geometry once',()=>{
  const material=new T.MeshBasicMaterial(),group=new T.Group();
  const geometry=new T.BoxGeometry(2,2,2);
  let disposed=0,materialDisposed=0;
  geometry.addEventListener('dispose',()=>disposed++);
  material.addEventListener('dispose',()=>materialDisposed++);
  group.add(mesh(geometry,material,-3,2,0),mesh(geometry,material,3,2,0));
  group.position.set(7,0,2);
  const expected=new T.Box3().setFromObject(group);
  const result=consolidate(group);
  assert.equal(result.children.length,1);
  assert.ok(new T.Box3().setFromObject(result).equals(expected));
  assert.equal(disposed,1);
  disposeGeometry(result);
  assert.equal(materialDisposed,0);
  material.dispose();
});
test('base, asymmetric and maximum upgraded ships build finite geometry with borrowed materials',()=>{
  const materials=Object.fromEntries(['wood','deck','trim','dark','playerSail','enemySail','red'].map(k=>[k,new T.MeshBasicMaterial()])) as Parameters<typeof makeShip>[3];
  for(const layout of [BASE_SHIP,new ShipLayout({lengthExtensions:2},{port:2,starboard:5}),new ShipLayout({lengthExtensions:3,widthUpgrades:2,decks:3},{port:18,starboard:18})]){
    for(const enemy of [false,true]){
      const result=makeShip(enemy,layout,{...BASE_EQUIPMENT,sails:3,helm:3,anchor:3,reinforcement:3,cannonQuality:3},materials);
      assert.ok(result.children.length<=7);
      const bounds=new T.Box3().setFromObject(result);
      assert.ok(bounds.max.y>layout.deckRise+14);
      result.traverse(object=>{
        if(object instanceof T.Mesh)for(const value of object.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
      });
      disposeGeometry(result);
    }
  }
  for(const material of Object.values(materials))material.dispose();
});
