import * as T from 'three';
import {makeShip} from './ship-model.ts';
import type {ShipMaterials} from './ship-model.ts';
import type {EnemyKind} from './regions.ts';
import {disposeGeometry} from './rendering.ts';
// Only the active region owns templates. Clones borrow these resources.
export class EnemyModels{
 private templates=new Map<string,{group:T.Group,paint:T.Material,sail:T.Material}>();
 constructor(privateMaterials:ShipMaterials){this.materials=privateMaterials;}
 private readonly materials:ShipMaterials;
 get size(){return this.templates.size;}
 clone(kind:EnemyKind){
  let entry=this.templates.get(kind.id);
  if(!entry){
   const paint=new T.MeshLambertMaterial({color:kind.color,flatShading:true});
   const sail=paint.clone();sail.side=T.DoubleSide;
   try{
    const group=makeShip(true,kind.layout,kind.equipment,{...this.materials,red:paint,enemySail:sail});
    entry={group,paint,sail};this.templates.set(kind.id,entry);
   }catch(error){paint.dispose();sail.dispose();throw error;}
  }
  return entry.group.clone();
 }
 dispose(){
  for(const {group,paint,sail} of this.templates.values()){disposeGeometry(group);group.clear();paint.dispose();sail.dispose();}
  this.templates.clear();
 }
}
