import * as T from 'three';
import {mesh,box,consolidate,disposeGeometry} from './rendering.ts';
import {WORLD,waveHeight} from './physics.ts';
import {HARBOUR} from './harbour.ts';
import type {Region,Edge} from './regions.ts';

export function edgePoint(edge:Edge,extent=WORLD){
 return edge==='north'?{x:0,z:extent}:edge==='south'?{x:0,z:-extent}:edge==='west'?{x:extent,z:0}:{x:-extent,z:0};
}
export class RegionWorld{
 readonly root=new T.Group();
 private materials:T.Material[]=[];
 private buoyPoints:{x:number,z:number,scale:number}[]=[];
 private buoyBodies:T.InstancedMesh|undefined;
 private buoyPoles:T.InstancedMesh|undefined;
 private transform=new T.Object3D();
 private disposed=false;
 readonly region:Region;
 constructor(region:Region){
  this.region=region;
  this.root.name='region:'+region.id;
  try{this.build();}catch(error){this.dispose();throw error;}
 }
 private material(color:number){
  const m=new T.MeshLambertMaterial({color,flatShading:true});this.materials.push(m);return m;
 }
 private build(){
  const r=this.region,sand=this.material(r.sand),land=this.material(r.land),rock=this.material(r.rock),
   accent=this.material(r.accent),wood=this.material(0x76503c),cream=this.material(0xf0e2cb);
  for(const island of r.islands){
   const {x,z,r:radius,height}=island,g=new T.Group();
   g.add(mesh(new T.CylinderGeometry(radius*.75,radius,8,9),sand,0,1,0));
   g.add(mesh(new T.ConeGeometry(radius*.72,height,7),land,0,height/2,0));
   for(let j=0;j<4;j++){
    const a=j*2.4,px=Math.sin(a)*radius*.45,pz=Math.cos(a)*radius*.45;
    if(r.theme==='tropical'){
     g.add(mesh(new T.CylinderGeometry(.6,1,13,5),wood,px,10,pz));
     for(let k=0;k<4;k++){const leaf=mesh(new T.ConeGeometry(3,11,4),land,px+Math.sin(k*1.57)*3,17,pz+Math.cos(k*1.57)*3);leaf.rotation.z=Math.sin(k*1.57)*1.1;leaf.rotation.x=Math.cos(k*1.57)*1.1;g.add(leaf);}
    }else if(r.theme==='ice'||r.theme==='storm'){
     const spire=mesh(new T.ConeGeometry(5+j,height*.65,4),j%2?land:rock,px,height*.325+4,pz);spire.rotation.y=a;g.add(spire);
    }else{
     g.add(mesh(new T.DodecahedronGeometry(4+j,0),rock,px,5+j,pz));
     if(r.theme==='coral'){box(g,accent,1.5,8+j,1.5,px,7,pz);box(g,accent,6,1.5,1.5,px,8,pz);}
    }
   }
   if(r.theme==='volcanic'){
    const crater=mesh(new T.TorusGeometry(radius*.14,2,5,12),accent,0,height*.84,0);crater.rotation.x=Math.PI/2;g.add(crater);
   }
   const model=consolidate(g);model.position.set(x,0,z);this.root.add(model);
  }
  // Every region has the same safe port footprint, styled by its local palette.
  const port=new T.Group();
  box(port,wood,44,2,24,0,1,-473);box(port,sand,44,.4,24,0,2.2,-473);box(port,wood,8,1,28,-27,1,-439);
  for(const x of [-13,12]){box(port,cream,12,8,10,x,6,-477);const roof=mesh(new T.ConeGeometry(10,5,4),accent,x,12.5,-477);roof.rotation.y=Math.PI/4;port.add(roof);}
  box(port,wood,2,13,2,0,8,-473);box(port,accent,5,3,.2,2,13,-473);this.root.add(consolidate(port));
  for(let j=0;j<80;j++){
   const side=Math.floor(j/20),a=(j%20)/20*WORLD*2-WORLD;
   this.buoyPoints.push({x:side===0?-WORLD:side===1?WORLD:a,z:side===2?-WORLD:side===3?WORLD:a,scale:1});
  }
  for(let j=0;j<32;j++){const a=j*Math.PI*2/32;this.buoyPoints.push({x:HARBOUR.x+Math.cos(a)*HARBOUR.radius,z:HARBOUR.z+Math.sin(a)*HARBOUR.radius,scale:.8});}
  // Taller buoys mark the centre of each navigable edge.
  for(const edge of Object.keys(r.routes) as Edge[]){
   const p=edgePoint(edge,WORLD-10);this.buoyPoints.push({...p,scale:2.3});
  }
  this.buoyBodies=new T.InstancedMesh(new T.ConeGeometry(1.4,3,6),accent,this.buoyPoints.length);
  const pole=new T.CylinderGeometry(.13,.13,5,5);pole.translate(0,2,0);
  this.buoyPoles=new T.InstancedMesh(pole,wood,this.buoyPoints.length);
  this.buoyBodies.frustumCulled=this.buoyPoles.frustumCulled=false;
  this.root.add(this.buoyBodies,this.buoyPoles);this.animate(0);
 }
 animate(time:number){
  if(this.disposed||!this.buoyBodies||!this.buoyPoles)return;
  for(let i=0;i<this.buoyPoints.length;i++){
   const p=this.buoyPoints[i];this.transform.position.set(p.x,waveHeight(p.x,p.z,time)+1,p.z);
   this.transform.scale.setScalar(p.scale);this.transform.updateMatrix();
   this.buoyBodies.setMatrixAt(i,this.transform.matrix);this.buoyPoles.setMatrixAt(i,this.transform.matrix);
  }
  this.buoyBodies.instanceMatrix.needsUpdate=this.buoyPoles.instanceMatrix.needsUpdate=true;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  this.root.removeFromParent();
  this.root.traverse(object=>{if(object instanceof T.InstancedMesh)object.dispose();});
  disposeGeometry(this.root);
  for(const material of this.materials)material.dispose();
  this.root.clear();this.materials.length=0;this.buoyPoints.length=0;
  this.buoyBodies=this.buoyPoles=undefined;
 }
}
