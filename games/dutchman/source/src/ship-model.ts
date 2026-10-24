import * as T from 'three';
import type {ShipLayout} from './ship-layout.ts';
import type {Equipment} from './progression.ts';
import {mesh,box,consolidate} from './rendering.ts';

// Materials are borrowed. Returned geometry belongs to the caller.
export type ShipMaterials=Record<'wood'|'deck'|'trim'|'dark'|'playerSail'|'enemySail'|'red',T.Material>;

export function makeShip(enemy:boolean,layout:ShipLayout,equipment:Readonly<Equipment>,materials:ShipMaterials){
 const {wood,deck,trim,dark,playerSail,enemySail,red}=materials;
 const g=new T.Group(),w=layout.width/7,extension=(layout.length-16)/2,top=layout.deckRise;
 const hull=new T.Shape();hull.moveTo(-3*w,-7-extension);hull.lineTo(3*w,-7-extension);hull.lineTo(3.5*w,2+extension);hull.lineTo(2.4*w,6+extension);hull.lineTo(0,9+extension);hull.lineTo(-2.4*w,6+extension);hull.lineTo(-3.5*w,2+extension);hull.closePath();
 const geo=new T.ExtrudeGeometry(hull,{depth:2.8,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.55,bevelThickness:.4});geo.rotateX(Math.PI/2);g.add(mesh(geo,wood,0,2.2,0));
 box(g,deck,5.6*w,.4,12+extension*2,0,2.4,-.5);
 // Repeated gun decks remain open between low rails so cannon rows stay visible.
 for(let d=0;d<layout.upgrades.decks;d++){
   box(g,enemy?red:trim,6.3*w,.45,11+extension*2,0,2.8+d*3,-1);
   box(g,deck,5.5*w,.4,10.5+extension*2,0,3+d*3,-1);
   if(d>0)for(const x of [-2.5*w,2.5*w])for(const z of [-4-extension,4+extension])box(g,wood,.4,3,.4,x,1.5+d*3,z);
 }
 box(g,wood,4*w,2.3,3,0,3.9+top,-5-extension);box(g,trim,4.5*w,.35,3.6,0,5.2+top,-5-extension);
 for(const z of [-3-extension,3+extension]){g.add(mesh(new T.CylinderGeometry(.17,.25,13,6),wood,0,8+top,z));box(g,wood,10*w,.22,.22,0,12+top,z);const sail=new T.PlaneGeometry(9*w*(1+.04*equipment.sails),6+.45*equipment.sails,4,3);const p=sail.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin((x/(9*w)+.5)*Math.PI)*1.1);p.setX(i,x*(.8+.2*(y/6+.5)));}sail.computeVertexNormals();g.add(mesh(sail,enemy?enemySail:playerSail,0,8.7+top,z));box(g,enemy?red:trim,2,.8,.08,1,14.3+top,z);}
 for(const row of layout.rows)for(const mount of row){const x=mount.x+mount.side*1.25;const cannon=mesh(new T.CylinderGeometry(.38+.07*equipment.cannonQuality,.48+.07*equipment.cannonQuality,2.5,7),dark,x,mount.y,mount.z);cannon.rotation.z=Math.PI/2;g.add(cannon);box(g,wood,1,1,1,x+mount.side*.9,mount.y-.4,mount.z);}
 // Equipment is rebuilt only on purchase, then merged with the hull by material.
 for(let level=0;level<equipment.reinforcement;level++)for(const side of [-1,1])box(g,trim,.18,.18,10+extension*2,side*3*w,1.1+level*.4,-1);
 for(let level=0;level<equipment.sails;level++)for(const z of [-3-extension,3+extension]){box(g,wood,(7-level)*w,.15,.15,0,14.4+top+level*1.7,z);g.add(mesh(new T.PlaneGeometry((6-level)*w,1.3),enemy?enemySail:playerSail,0,13.8+top+level*1.7,z));}
 const wheel=mesh(new T.TorusGeometry(.55+.12*equipment.helm,.1,4,8),trim,0,5.9+top,-5.8-extension);g.add(wheel);
 box(g,wood,.35,1.3, .35,0,5.3+top,-5.8-extension);box(g,dark,.35,1.8+.35*equipment.helm,1+.3*equipment.helm,0,.5,-7.5-extension);
 const anchorSize=1+.18*equipment.anchor;
 for(const side of [-1,1]){box(g,dark,.2,1.6*anchorSize,.2,side*(3.5*w+.25),2.2,3+extension);box(g,dark,1.2*anchorSize,.2,.25,side*(3.5*w+.25),1.4,3+extension);}
 g.add(mesh(new T.CylinderGeometry(.4+.12*equipment.anchor,.5+.12*equipment.anchor,.8,6),trim,0,3.7+top,-3-extension));
 return consolidate(g);
}
