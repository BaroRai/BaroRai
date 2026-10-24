import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function mesh(geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0){
  const result=new T.Mesh(geometry,material);
  result.position.set(x,y,z);
  return result;
}
export function box(group:T.Group,material:T.Material,w:number,h:number,d:number,x:number,y:number,z:number){
  group.add(mesh(new T.BoxGeometry(w,h,d),material,x,y,z));
}
// Dispose owned geometry once, preserving borrowed materials.
export function disposeGeometry(group:T.Object3D){
  const geometries=new Set<T.BufferGeometry>();
  group.traverse(object=>{if(object instanceof T.Mesh)geometries.add(object.geometry);});
  for(const geometry of geometries)geometry.dispose();
}
// Consumes procedural input geometry; do not pass shared scene/template geometry.
// All temporary copies are released, including indexed-to-flat conversions.
export function consolidate(group:T.Group){
  group.updateMatrixWorld(true);
  const batches=new Map<T.Material,T.BufferGeometry[]>();
  const output=new T.Group();
  try{
    group.traverse(object=>{
      if(!(object instanceof T.Mesh))return;
      if(Array.isArray(object.material))throw new Error('Procedural meshes require one material');
      const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const batch=batches.get(object.material)??[];
      batch.push(geometry);
      batches.set(object.material,batch);
    });
    for(const [material,geometries] of batches){
      const merged=mergeGeometries(geometries);
      if(!merged)throw new Error('Incompatible procedural geometry attributes');
      output.add(mesh(merged,material));
    }
    return output;
  }catch(error){
    disposeGeometry(output);
    throw error;
  }finally{
    for(const geometries of batches.values())for(const geometry of geometries)geometry.dispose();
    disposeGeometry(group);
  }
}
