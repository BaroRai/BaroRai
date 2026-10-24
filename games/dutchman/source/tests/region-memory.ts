import * as T from 'three';
import {REGIONS} from '../src/regions.ts';
import {RegionWorld} from '../src/region-world.ts';
import {RegionSlot} from '../src/region-slot.ts';
import {EnemyModels} from '../src/enemy-models.ts';
const scene=new T.Scene(),renderer=new T.WebGLRenderer({antialias:true});
renderer.setSize(1000,680);document.body.append(renderer.domElement);
const camera=new T.PerspectiveCamera(55,1000/680,1,2500);camera.position.set(0,950,-880);camera.lookAt(0,0,0);
scene.add(new T.HemisphereLight(0xffffff,0x445566,3));
const water=new T.Mesh(new T.PlaneGeometry(1400,1400),new T.MeshLambertMaterial());water.rotation.x=-Math.PI/2;water.position.y=-2;scene.add(water);
const slot=new RegionSlot<RegionWorld>();
const mats=Object.fromEntries(['wood','deck','trim','dark','playerSail','enemySail','red'].map(k=>[k,new T.MeshLambertMaterial({color:0x98755a})]));
const enemies=new EnemyModels(mats as any);const enemyRoot=new T.Group();scene.add(enemyRoot);
function load(id:string){
 enemyRoot.clear();enemies.dispose();
 const region=REGIONS[id as keyof typeof REGIONS];const world=slot.replace(()=>new RegionWorld(region));scene.add(world.root);
 water.material.color.set(region.waterHigh);scene.background=new T.Color(region.sky);
 for(let i=0;i<region.enemies.length;i++){const ship=enemies.clone(region.enemies[i]);ship.scale.setScalar(3);ship.position.set(-150+i*85,8,-150);enemyRoot.add(ship);}
 world.animate(0);renderer.render(scene,camera);
 document.getElementById('title')!.textContent=region.name+' · '+region.enemyCount+' NPCs · '+region.enemies.length+' types';
 document.getElementById('metrics')!.textContent=JSON.stringify({geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,regionScenes:scene.children.filter(o=>o.name.startsWith('region:')).length,templates:enemies.size});
}
const select=document.getElementById('region') as HTMLSelectElement;
for(const r of Object.values(REGIONS)){const o=document.createElement('option');o.value=r.id;o.textContent=r.name;select.append(o);}
select.onchange=()=>load(select.value);
document.getElementById('cycles')!.onclick=()=>{
 load('shallows');const before=renderer.info.memory.geometries;
 for(let i=0;i<20;i++)for(const id of Object.keys(REGIONS))load(id);
 load('shallows');select.value='shallows';
 document.getElementById('result')!.textContent='100 swaps: geometries before '+before+', after '+renderer.info.memory.geometries+'; '+(before===renderer.info.memory.geometries?'PASS':'FAIL');
};
load('shallows');
