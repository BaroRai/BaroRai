import * as T from 'three';
import {mesh,box,consolidate,disposeGeometry} from './rendering.ts';
import {makeShip} from './ship-model.ts';
import {WORLD,WAVES,waveHeight,ballistic,angleDelta,segmentSphere,trajectorySamples,trajectoryImpact,SHOT_LIFETIME,ARC_SAMPLE_COUNT} from './physics';
import {BASE_SHIP,SHIP_LIMITS,ShipLayout,firingSides,chartPoint,chartHeading} from './ship-layout';
import type {CannonMount} from './ship-layout';
import {BASE_EQUIPMENT,START_ELEVATION,freshProgress,loadProgress,saveProgress,layoutFor,statsFor,quoteUpgrade} from './progression';
import type {Equipment,ShipStats,UpgradeId} from './progression';
import {HARBOUR,PORT_OBSTACLES,inHarbour,canDock,crossesHarbour,outsideHarbour} from './harbour';
import {ShipyardUI,renderShipStats} from './shipyard-ui';
import {REGIONS,EDGES,destination,arrivalFrom,readiness,loadRegionId,saveRegionId} from './regions.ts';
import type {RegionId,Edge,Island,EnemyKind} from './regions.ts';
import {RegionWorld,edgePoint} from './region-world.ts';
import {RegionSlot} from './region-slot.ts';
import {EnemyModels} from './enemy-models.ts';
import './style.css';

// Scene bootstrap and procedural asset helpers. See docs/dutchman.md for system routing.
const $=(id:string)=>document.getElementById(id)!;
const canvas=$('sea') as HTMLCanvasElement;
let renderer:T.WebGLRenderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch{ $('overlay-copy').textContent='Dutchman needs WebGL 2. Try a current desktop browser with hardware acceleration enabled.';($('start') as HTMLButtonElement).disabled=true;throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene();scene.background=new T.Color('#a6dfd8');scene.fog=new T.Fog('#a6dfd8',300,1050);
const camera=new T.PerspectiveCamera(55,innerWidth/innerHeight,.3,1800);
scene.add(new T.HemisphereLight(0xfff0cc,0x287a83,2.4));const sun=new T.DirectionalLight(0xffedcd,2.8);sun.position.set(-100,200,-80);scene.add(sun);
const mat=(color:number)=>new T.MeshLambertMaterial({color,flatShading:true});
const wood=mat(0x76503c),deck=mat(0xbb8050),trim=mat(0xf6c96d),dark=mat(0x293e43),cream=mat(0xffedc7),red=mat(0xd85143);
// Player-only sail material: fading must never affect enemy ships or hull trim.
const playerSail=cream.clone(),enemySail=red.clone();playerSail.side=enemySail.side=T.DoubleSide;
playerSail.transparent=true;playerSail.depthWrite=false;
const shipMaterials={wood,deck,trim,dark,playerSail,enemySail,red};
const enemyModels=new EnemyModels(shipMaterials);
// Entity records share module state; player is also a member of ships.
type Ship={group:T.Group,layout:ShipLayout,stats:ShipStats,x:number,z:number,yaw:number,speed:number,hp:number,scale:number,enemy:boolean,cool:number[],state:string,phase:number,vy:number};
const ships:Ship[]=[];let player:Ship;
const disposePlayerGeometry=disposeGeometry;
function shipGroup(enemy:boolean,layout:ShipLayout,equipment:Readonly<Equipment>,kind?:EnemyKind){
 return enemy?enemyModels.clone(kind??REGIONS.shallows.enemies[0]):makeShip(false,layout,equipment,shipMaterials);
}
function spawnShip(x:number,z:number,enemy:boolean,scale=1,layout=BASE_SHIP,kind?:EnemyKind){
 const equipment=enemy?(kind?.equipment??BASE_EQUIPMENT):progress.upgrades;
 const stats=enemy?{...(kind??REGIONS.shallows.enemies[0]).stats}:statsFor(progress);
 const group=shipGroup(enemy,layout,equipment,kind);group.scale.setScalar(scale);group.position.set(x,0,z);scene.add(group);
 const ship:Ship={group,layout,stats,x,z,yaw:enemy?Math.random()*Math.PI*2:0,speed:0,hp:stats.maxHp,scale,enemy,cool:[0,0],state:'patrol',phase:Math.random()*100,vy:0};
 ships.push(ship);return ship;
}

// GPU and CPU share the same wave coefficients and simulation clock.
const waterUniform={value:0};
const waveGLSL=WAVES.map(w=>`{float p=${w.k.toFixed(8)}*(dot(q,vec2(${w.dx.toFixed(8)},${w.dz.toFixed(8)}))-${w.speed.toFixed(4)}*uTime);pos.y+=${w.a.toFixed(4)}*sin(p);pos.xz+=vec2(${w.dx.toFixed(8)},${w.dz.toFixed(8)})*${(w.steep*w.a).toFixed(8)}*cos(p);}`).join('\n');
const waterMaterial=new T.ShaderMaterial({uniforms:{uTime:waterUniform,uLow:{value:new T.Color(REGIONS.shallows.waterLow)},uHigh:{value:new T.Color(REGIONS.shallows.waterHigh)},uSky:{value:new T.Color(REGIONS.shallows.sky)}},vertexShader:`uniform float uTime;varying vec3 world;void main(){vec3 pos=position;vec2 q=pos.xz;${waveGLSL}world=pos;gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);}`,fragmentShader:`uniform vec3 uLow;uniform vec3 uHigh;uniform vec3 uSky;varying vec3 world;void main(){vec3 n=normalize(cross(dFdx(world),dFdy(world)));float light=.5+.5*abs(dot(n,normalize(vec3(-.3,1.,-.5))));vec3 col=mix(uLow,uHigh,light);float foam=smoothstep(.82,1.14,world.y);col=mix(col,vec3(.67,.87,.78),foam*.5);float fog=smoothstep(270.,1050.,distance(cameraPosition,world));gl_FragColor=vec4(mix(col,uSky,fog),1.);}`});
const oceanGeo=new T.PlaneGeometry(2200,2200,230,230);oceanGeo.rotateX(-Math.PI/2);scene.add(mesh(oceanGeo,waterMaterial));
let regionId:RegionId='shallows';try{regionId=loadRegionId(localStorage);}catch{}
const regionSlot=new RegionSlot<RegionWorld>();
let islands:readonly Island[]=[],obstacles:{x:number,z:number,r:number,height:number}[]=[],shotObstacles:typeof obstacles=[];
let enemySequence=0;
function currentRegion(){return REGIONS[regionId];}
// Dynamic entities and reusable mesh pools. Templates share geometry/materials.
type Shot={mesh:T.Mesh,origin:T.Vector3,velocity:T.Vector3,age:number,launchTime:number,damage:number,owner:Ship};const shots:Shot[]=[];const shotPool:T.Mesh[]=[];const ballGeo=new T.SphereGeometry(.48,7,5);
type Loot={mesh:T.Group,x:number,z:number,age:number};const loot:Loot[]=[];const crateTemplate=new T.Group();box(crateTemplate,deck,2.7,2.7,2.7,0,0,0);box(crateTemplate,trim,2.85,.35,2.85,0,.8,0);box(crateTemplate,trim,2.85,.35,2.85,0,-.8,0);box(crateTemplate,trim,.35,2.85,2.85,0,0,0);
type Effect={mesh:T.Mesh,velocity:T.Vector3,life:number,max:number};const effects:Effect[]=[];const effectPool:T.Mesh[]=[];const effectGeo=new T.IcosahedronGeometry(.6,0);const splashMat=mat(0xe4f5cd),hitMat=mat(0xffbd63);
function burst(p:T.Vector3,hit=false){for(let i=0;i<10&&effects.length<160;i++){const m=effectPool.pop()||mesh(effectGeo,splashMat);m.material=hit?hitMat:splashMat;m.position.copy(p);m.scale.setScalar(1);m.visible=true;scene.add(m);effects.push({mesh:m,velocity:new T.Vector3((Math.random()-.5)*12,Math.random()*9+2,(Math.random()-.5)*12),life:.7,max:.7});}}
// Synthesized audio, persistent fleet progress, and separate per-voyage score.
let audio:AudioContext|undefined,sound=false;function tone(freq:number,duration:number,volume=.1){if(!sound)return;audio??=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*.3),audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
let progress=freshProgress();try{progress=loadProgress(localStorage);}catch{}
function persistProgress(){let saved=false;try{saved=saveProgress(localStorage,progress);}catch{}$('save-status').textContent=saved?'Saved on this device':'Saving unavailable — progress lasts for this tab only';}
let graphicsLost=false;
let running=false,started=false,dead=false,time=0,score=0,kills=0,best=0,elevation=START_ELEVATION,side=0,spawnTimer=0,noticeTimer=0;
try{best=Number(localStorage.getItem('dutchman-best'))||0;}catch{}$('best').textContent=String(best);
// Input has immediate press actions as well as held actions in simulate().
const keys=new Set<string>();let mouseFire=false;const controlled=['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','Space'];
function notice(t:string){$('notice').textContent=t;noticeTimer=4;}
function aimSide(){return keys.has('KeyQ')?-1:keys.has('KeyE')?1:0;}
window.addEventListener('keydown',e=>{
 if(travelDialog.open){if((e.code==='KeyF'||e.code==='Escape')&&!e.repeat){e.preventDefault();closeTravel();}return;}
 if(shipyard.dialog.open){if((e.code==='KeyF'||e.code==='Escape')&&!e.repeat){e.preventDefault();closePort();}return;}
 if(e.code==='KeyI'&&!e.repeat&&started&&!dead){e.preventDefault();toggleStats();return;}
 if(e.code==='KeyF'&&!e.repeat&&running){e.preventDefault();if(destination(currentRegion(),player))openTravel();else openPort();return;}
 if(e.code==='Space'&&(e.target as HTMLElement)?.closest?.('button,a'))return;
 if(controlled.includes(e.code)&&running){e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='Space')firePlayer();if(e.code==='ArrowUp')elevation=Math.min(55,elevation+1);if(e.code==='ArrowDown')elevation=Math.max(5,elevation-1);}}
 if(e.code==='Escape'&&!e.repeat&&started&&!dead)togglePause();
});window.addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('pointerdown',e=>{if(e.button===0&&running){mouseFire=true;firePlayer();}});window.addEventListener('pointerup',()=>mouseFire=false);window.addEventListener('pointercancel',()=>mouseFire=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{if(running){e.preventDefault();elevation=T.MathUtils.clamp(elevation-Math.sign(e.deltaY)*2,5,55);}},{passive:false});
function clearInput(){keys.clear();mouseFire=false;side=0;}
window.addEventListener('blur',()=>{clearInput();if(running)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound));tone(400,.15);};$('pause').onclick=()=>{if(started&&!dead)togglePause();};
function pause(){running=false;clearInput();document.body.classList.add('paused');$('overlay').classList.remove('hidden');$('overlay-copy').textContent='Your voyage is paused. The sea can wait.';$('start').innerHTML='Resume voyage <span>↗</span>';$('pause').textContent='Resume';}
function togglePause(){if(shipyard.dialog.open||travelDialog.open||graphicsLost)return;if(running)pause();else resume();}
function resume(){if(graphicsLost)return;running=true;clearInput();document.body.classList.remove('paused');document.body.classList.add('playing');$('overlay').classList.add('hidden');$('pause').innerHTML='Pause <kbd>Esc</kbd>';canvas.focus();}
$('start').onclick=()=>{if(!started||dead)reset();started=true;resume();tone(330,.2);notice(currentRegion().name+' · F near the dock for upgrades; F at route buoys to travel.');};
// UI callbacks are the only purchase entry point. The catalogue validates and prices it.
const shipyard=new ShipyardUI(buyUpgrade,closePort);
$('enter-port').onclick=openPort;$('ship-info').onclick=toggleStats;
function toggleStats(){const panel=$('ship-details');panel.hidden=!panel.hidden;$('ship-info').setAttribute('aria-expanded',String(!panel.hidden));renderShipStats(progress,player.hp,score);}
function protectedShip(s:Ship){return inHarbour(s,s.layout.collisionRadius*s.scale);}
function openPort(){if(!running||dead||!canDock(player))return;running=false;clearInput();player.speed=0;$('ship-details').hidden=true;$('ship-info').setAttribute('aria-expanded','false');shipyard.open(progress);}
function closePort(){if(!shipyard.dialog.open)return;shipyard.close();resume();canvas.focus();}
function buyUpgrade(id:UpgradeId){
 if(!shipyard.dialog.open||!canDock(player)||dead)return;
 const quote=quoteUpgrade(progress,id);if(!quote.next)return;
 const oldGroup=player.group,oldMax=player.stats.maxHp;progress=quote.next;
 player.layout=layoutFor(progress);player.stats=statsFor(progress);player.hp=Math.min(player.stats.maxHp,player.hp+player.stats.maxHp-oldMax);
 player.group=shipGroup(false,player.layout,progress.upgrades);player.group.position.copy(oldGroup.position);player.group.rotation.copy(oldGroup.rotation);player.group.scale.copy(oldGroup.scale);
 scene.remove(oldGroup);disposePlayerGeometry(oldGroup);scene.add(player.group);persistProgress();shipyard.render(progress);hud();tone(480,.15);
}
// The route dialog previews danger without spending money or requiring a level.
const travelDialog=$('travel-dialog') as HTMLDialogElement;
let pendingTravel:{edge:Edge,id:RegionId}|null=null;
$('travel-cancel').onclick=closeTravel;
$('travel-confirm').onclick=confirmTravel;
$('travel-route').onclick=openTravel;
travelDialog.addEventListener('cancel',e=>{e.preventDefault();closeTravel();});
function openTravel(){
 if(!running||dead)return;
 const route=destination(currentRegion(),player);if(!route)return;
 pendingTravel=route;running=false;clearInput();
 const next=REGIONS[route.id];
 $('travel-title').textContent=next.name;
 $('travel-description').textContent=next.description;
 $('travel-tier').textContent='THREAT '+next.tier+' · '+next.enemyCount+' SHIPS · '+next.enemies.length+(next.enemies.length===1?' TYPE':' TYPES');
 $('travel-stats').replaceChildren(...readiness(next,progress,player.hp).map(stat=>{
  const row=document.createElement('div');row.className='route-stat '+(stat.actual>=stat.recommended?'ready':'under');
  const label=document.createElement('strong');label.textContent=stat.label;
  const value=document.createElement('span');value.textContent=stat.actual+' / '+stat.recommended+' '+stat.unit;
  const verdict=document.createElement('small');verdict.textContent=stat.actual>=stat.recommended?'Ready':'Below recommendation';
  row.append(label,value,verdict);return row;
 }));
 $('travel-enemies').replaceChildren(...next.enemies.map(kind=>{
  const card=document.createElement('div');card.className='route-enemy';card.style.borderLeftColor='#'+kind.color.toString(16).padStart(6,'0');
  const title=document.createElement('strong');title.textContent=kind.name;
  const copy=document.createElement('small');copy.textContent=kind.role+' · '+kind.stats.maxHp+' hull · '+Math.round(kind.stats.maxSpeed*1.94)+' knots · '+kind.layout.armament.port*kind.stats.damage+' broadside damage';
  card.append(title,copy);return card;
 }));
 $('travel-confirm').textContent='Sail to '+next.name;
 travelDialog.showModal();$('travel-cancel').focus();
}
function closeTravel(){
 if(!travelDialog.open)return;
 travelDialog.close();pendingTravel=null;resume();
}
function confirmTravel(){
 const route=pendingTravel;
 if(!travelDialog.open||!route||dead||graphicsLost)return;
 // Revalidate the actual boundary before any destructive scene work.
 const available=destination(currentRegion(),player);
 if(!available||available.id!==route.id||available.edge!==route.edge){closeTravel();return;}
 travelDialog.close();pendingTravel=null;
 const arrival=arrivalFrom(route.edge);
 clearRegionEntities(true);
 installRegion(route.id);
 player.x=arrival.x;player.z=arrival.z;player.yaw=arrival.yaw;player.speed=0;player.vy=0;
 player.group.position.set(player.x,waveHeight(player.x,player.z,time),player.z);
 player.group.rotation.set(0,player.yaw,0,'YXZ');
 seedEnemies();snapCamera();persistProgress();
 let regionSaved=false;try{regionSaved=saveRegionId(localStorage,regionId);}catch{}
 resume();hud();notice('Entered '+currentRegion().name+' · '+currentRegion().enemyCount+' hostile ships. Mini-port marked P.'+(regionSaved?'':' Region save unavailable.'));
}
// Release all old entity references BEFORE disposing the active region/template cache.
function clearRegionEntities(keepPlayer:boolean){
 for(const ship of ships)if(ship!==player||!keepPlayer)scene.remove(ship.group);
 if(!keepPlayer&&player)disposePlayerGeometry(player.group);
 ships.length=0;if(keepPlayer)ships.push(player);
 for(const shot of shots){shot.mesh.visible=false;shotPool.push(shot.mesh);}shots.length=0;
 for(const item of loot)scene.remove(item.mesh);loot.length=0;
 for(const effect of effects){effect.mesh.visible=false;effectPool.push(effect.mesh);}effects.length=0;
 enemyModels.dispose();
 islands=[];obstacles=[];shotObstacles=[];
}
function installRegion(id:RegionId){
 regionId=id;const region=currentRegion();
 const world=regionSlot.replace(()=>new RegionWorld(region));scene.add(world.root);
 islands=region.islands;obstacles=[...islands.map(i=>({...i,height:i.height+8})),...PORT_OBSTACLES];
 shotObstacles=[...obstacles,{x:HARBOUR.x,z:HARBOUR.z,r:HARBOUR.radius,height:Infinity}];
 (scene.background as T.Color).set(region.sky);(scene.fog as T.Fog).color.set(region.sky);
 waterMaterial.uniforms.uLow.value.set(region.waterLow);waterMaterial.uniforms.uHigh.value.set(region.waterHigh);waterMaterial.uniforms.uSky.value.set(region.sky);
 $('region-name').textContent=region.name.toUpperCase();$('region-threat').textContent='THREAT '+region.tier;
 $('route-guide').textContent=EDGES.filter(edge=>region.routes[edge]).map(edge=>edge[0].toUpperCase()+': '+REGIONS[region.routes[edge]!].name).join(' · ');
 enemySequence=0;spawnTimer=0;
}
function safePosition(x:number,z:number,radius=24){
 return !inHarbour({x,z},radius+10)&&obstacles.every(i=>Math.hypot(x-i.x,z-i.z)>i.r+radius);
}
function spawnEnemy(){
 const region=currentRegion(),kind=region.enemies[enemySequence%region.enemies.length],radius=kind.layout.collisionRadius*kind.scale;
 const clear=(x:number,z:number)=>safePosition(x,z,radius+8)&&Math.hypot(x-player.x,z-player.z)>150&&ships.every(s=>Math.hypot(s.x-x,s.z-z)>s.layout.collisionRadius*s.scale+radius+10);
 let position:{x:number,z:number}|undefined;
 for(let tries=0;tries<80;tries++){const x=(Math.random()-.5)*1000,z=(Math.random()-.5)*1000;if(clear(x,z)){position={x,z};break;}}
 // Deterministic fallback prevents a crowded map from silently losing a variant.
 if(!position)for(let x=-460;x<=460&&!position;x+=80)for(let z=-460;z<=460;z+=80)if(clear(x,z)){position={x,z};break;}
 if(!position)return false;
 spawnShip(position.x,position.z,true,kind.scale,kind.layout,kind);enemySequence++;return true;
}
function seedEnemies(){for(let i=0;i<currentRegion().enemyCount;i++)spawnEnemy();}
function snapCamera(){
 const f=direction(player.yaw);
 camera.position.copy(player.group.position).addScaledVector(f,-50);camera.position.y+=30;
 look.copy(player.group.position);look.y+=4;camera.lookAt(look);
 accumulator=0;
}
function reset(){
 clearRegionEntities(false);installRegion(regionId);
 score=0;kills=0;dead=false;time=0;elevation=START_ELEVATION;spawnTimer=0;
 player=spawnShip(HARBOUR.spawnX,HARBOUR.spawnZ,false,1,layoutFor(progress));seedEnemies();snapCamera();
}
// Forward is +Z at yaw=0; right is yaw-PI/2. Port=-1, starboard=+1.
function direction(yaw:number){return new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));}
function shotData(s:Ship,broadside:number,angle:number,mount:Readonly<CannonMount>){const f=direction(s.yaw),r=direction(s.yaw-Math.PI/2);const origin=s.group.position.clone().addScaledVector(r,-mount.x*s.scale).addScaledVector(f,mount.z*s.scale);origin.y+=mount.y*s.scale;const velocity=r.multiplyScalar(broadside*s.stats.muzzleSpeed*Math.cos(angle)).addScaledVector(f,s.speed);velocity.y=s.stats.muzzleSpeed*Math.sin(angle);return{origin,velocity};}
function fire(s:Ship,broadside:number,angle:number){
 const idx=broadside<0?0:1,mounts=s.layout.mounts(broadside);
 // Reserve a complete row volley: upgrades must not overrun the original 93-shot cap.
 if(!mounts.length||protectedShip(s)||(s.enemy&&protectedShip(player))||s.cool[idx]>0||shots.length+mounts.length>93)return;
 s.cool[idx]=s.stats.reload;
 for(const mount of mounts){const data=shotData(s,broadside,angle,mount);const m=shotPool.pop()||mesh(ballGeo,dark);m.position.copy(data.origin);m.visible=true;scene.add(m);shots.push({mesh:m,...data,age:0,launchTime:time,damage:s.stats.damage,owner:s});}
 burst(shotData(s,broadside,angle,mounts[Math.floor(mounts.length/2)]).origin,true);if(!s.enemy)tone(85,.32,.16);
}
function firePlayer(){for(const broadside of firingSides(aimSide()))fire(player,broadside,elevation*Math.PI/180);}
function sink(s:Ship){burst(s.group.position.clone(),true);scene.remove(s.group);ships.splice(ships.indexOf(s),1);if(s.enemy){kills++;notice('Ship sunk. Collect the floating crates!');for(let j=0;j<3;j++){if(loot.length>=60){scene.remove(loot.shift()!.mesh);}const m=crateTemplate.clone();scene.add(m);loot.push({mesh:m,x:s.x+(Math.random()-.5)*14,z:s.z+(Math.random()-.5)*14,age:0});}}else{dead=true;running=false;clearInput();document.body.classList.add('paused');$('overlay').classList.remove('hidden');$('overlay-copy').textContent=`Voyage ended: ${score} earned · ${kills} ships sunk. Your ${progress.wallet} doubloons and upgrades are safe. Sail again?`;$('start').innerHTML='Sail again <span>↗</span>';tone(90,.7);}}
// A shared local ballistic shape is translated to each cannon; sea clipping stays live.
const maxBroadsideGuns=SHIP_LIMITS.decks*SHIP_LIMITS.cannonsPerRow;
const arcPoints=new Float32Array(maxBroadsideGuns*(ARC_SAMPLE_COUNT-1)*2*3),arcGeo=new T.BufferGeometry();arcGeo.setAttribute('position',new T.BufferAttribute(arcPoints,3));
const arc=new T.LineSegments(arcGeo,new T.LineBasicMaterial({color:0xffe8a7,transparent:true,opacity:.65}));arc.frustumCulled=false;scene.add(arc);
const targets=new T.InstancedMesh(new T.TorusGeometry(2.2,.14,5,24),new T.MeshBasicMaterial({color:0xffe8a7}),maxBroadsideGuns);targets.frustumCulled=false;scene.add(targets);
const targetTransform=new T.Object3D();targetTransform.rotation.x=Math.PI/2;
let arcAngle=NaN,arcSpeed=NaN,arcSamples:ReturnType<typeof trajectorySamples>=[];
function updateArc(){
 arc.visible=targets.visible=running&&side!==0&&!protectedShip(player);if(!arc.visible)return;
 if(arcAngle!==elevation||arcSpeed!==player.stats.muzzleSpeed){arcAngle=elevation;arcSpeed=player.stats.muzzleSpeed;arcSamples=trajectorySamples(elevation*Math.PI/180,arcSpeed);}
 const f=direction(player.yaw),r=direction(player.yaw-Math.PI/2),mounts=player.layout.mounts(side);let n=0;
 for(let i=0;i<mounts.length;i++){
   const data=shotData(player,side,elevation*Math.PI/180,mounts[i]),origin=data.origin;
   let x=origin.x,y=origin.y,z=origin.z;
   for(let j=1;j<arcSamples.length;j++){
     const p=arcSamples[j],px=x,py=y,pz=z;
     const hit=trajectoryImpact(origin,data.velocity,arcSamples[j-1].t,p.t,time,shotObstacles);
     x=origin.x+r.x*side*p.x+f.x*player.speed*p.t;y=origin.y+p.y;z=origin.z+r.z*side*p.x+f.z*player.speed*p.t;
     if(hit){x=hit.point.x;y=hit.point.y;z=hit.point.z;}
     arcPoints[n++]=px;arcPoints[n++]=py;arcPoints[n++]=pz;arcPoints[n++]=x;arcPoints[n++]=y;arcPoints[n++]=z;
     if(hit)break;
   }
   targetTransform.position.set(x,y+.15,z);targetTransform.updateMatrix();targets.setMatrixAt(i,targetTransform.matrix);
 }
 targets.count=mounts.length;targets.instanceMatrix.needsUpdate=true;arcGeo.setDrawRange(0,n/3);arcGeo.attributes.position.needsUpdate=true;
}
// Scratch vectors never escape a simulation step or become entity-owned.
const previousShotPosition=new T.Vector3(),collisionCenter=new T.Vector3();
// Fixed-step order is gameplay-sensitive; see docs/dutchman.md before reordering.
function simulate(dt:number){time+=dt;waterUniform.value=time;side=aimSide();if(keys.has('ArrowUp'))elevation=Math.min(55,elevation+24*dt);if(keys.has('ArrowDown'))elevation=Math.max(5,elevation-24*dt);
 if(mouseFire||keys.has('Space'))firePlayer();
 for(const s of ships){s.cool[0]=Math.max(0,s.cool[0]-dt);s.cool[1]=Math.max(0,s.cool[1]-dt);let steer=0,desired=0;
 if(!s.enemy){desired=keys.has('KeyW')?s.stats.maxSpeed:keys.has('KeyS')?0:Math.max(0,s.speed-2*dt);steer=(keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0);}else{const dx=player.x-s.x,dz=player.z-s.z,dist=Math.hypot(dx,dz);const heading=Math.atan2(dx,dz);s.state=!protectedShip(player)&&!protectedShip(s)&&dist<210?'engage':'patrol';let wanted=s.yaw+Math.sin(time*.12+s.phase)*.4;desired=s.stats.maxSpeed*2/3;
 if(s.state==='engage'){wanted=heading+(dist<145?Math.PI/2:0);desired=s.stats.maxSpeed*(dist<100?7/12:1);const rel=angleDelta(heading,s.yaw);const bs=rel>0?-1:1;const error=Math.abs(Math.abs(rel)-Math.PI/2);if(dist<185&&dist>30&&error<.22){const angle=Math.asin(Math.min(.95,dist*9.81/(s.stats.muzzleSpeed*s.stats.muzzleSpeed)))/2;fire(s,bs,angle);}}
 for(const i of islands){if(Math.hypot(s.x-i.x,s.z-i.z)<i.r+65){wanted=Math.atan2(s.x-i.x,s.z-i.z);desired=7;}}
 if(inHarbour(s,65)){wanted=Math.atan2(s.x-HARBOUR.x,s.z-HARBOUR.z);desired=8;}
 if(Math.max(Math.abs(s.x),Math.abs(s.z))>530)wanted=Math.atan2(-s.x,-s.z);steer=T.MathUtils.clamp(angleDelta(wanted,s.yaw)*2,-1,1);}
 s.speed=T.MathUtils.damp(s.speed,desired,keys.has('KeyS')&&!s.enemy?s.stats.braking:s.stats.acceleration,dt);s.yaw+=steer*s.stats.turnRate*dt*(.3+.7*Math.min(1,s.speed/10));s.x+=Math.sin(s.yaw)*s.speed*dt;s.z+=Math.cos(s.yaw)*s.speed*dt;
 for(const i of obstacles){let dx=s.x-i.x,dz=s.z-i.z;const dist=Math.hypot(dx,dz),min=i.r+s.layout.collisionRadius*s.scale;if(dist<min){dx=dist?dx/dist:1;dz=dist?dz/dist:0;s.x=i.x+dx*min;s.z=i.z+dz*min;s.speed*=.97;}}
 if(s.enemy){const safe=outsideHarbour(s,s.layout.collisionRadius*s.scale+1);s.x=safe.x;s.z=safe.z;}
 const edge=s.layout.collisionRadius*s.scale+2;
 if(Math.abs(s.x)>WORLD-edge||Math.abs(s.z)>WORLD-edge){s.x=T.MathUtils.clamp(s.x,-WORLD+edge,WORLD-edge);s.z=T.MathUtils.clamp(s.z,-WORLD+edge,WORLD-edge);s.speed*=.97;if(!s.enemy&&noticeTimer<=0)notice(destination(currentRegion(),player)?'Route buoys · press F to inspect the next region.':'Uncharted water. Use the marked route to return.');}
 const f=direction(s.yaw),r=direction(s.yaw-Math.PI/2);const h=waveHeight(s.x,s.z,time);const fl=s.layout.floatLength,fw=s.layout.floatWidth;const front=waveHeight(s.x+f.x*fl,s.z+f.z*fl,time),back=waveHeight(s.x-f.x*fl,s.z-f.z*fl,time),left=waveHeight(s.x-r.x*fw,s.z-r.z*fw,time),right=waveHeight(s.x+r.x*fw,s.z+r.z*fw,time);s.vy+=(h-s.group.position.y)*16*dt;s.vy*=Math.exp(-6*dt);s.group.position.set(s.x,s.group.position.y+s.vy*dt,s.z);s.group.rotation.order='YXZ';s.group.rotation.y=s.yaw;s.group.rotation.x=T.MathUtils.damp(s.group.rotation.x,-Math.atan2(front-back,fl*2),5,dt);s.group.rotation.z=T.MathUtils.damp(s.group.rotation.z,-Math.atan2(right-left,fw*2)-steer*.06,5,dt);
 }
 for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++){const a=ships[i],b=ships[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),min=a.layout.collisionRadius*a.scale+b.layout.collisionRadius*b.scale;if(d<min){const push=(min-d)/2,ux=d?dx/d:1,uz=d?dz/d:0;a.x-=ux*push;a.z-=uz*push;b.x+=ux*push;b.z+=uz*push;a.speed*=.98;b.speed*=.98;}}
 // Separation can push a hull; reapply the protected perimeter before projectile tests.
 for(const s of ships){if(s.enemy){const safe=outsideHarbour(s,s.layout.collisionRadius*s.scale+1);s.x=safe.x;s.z=safe.z;if(protectedShip(player))s.state='patrol';}s.group.position.x=s.x;s.group.position.z=s.z;}
 for(let j=shots.length-1;j>=0;j--){
   const shot=shots[j],old=previousShotPosition.copy(shot.mesh.position),previous=shot.age;shot.age=time-shot.launchTime;
   const p=ballistic(shot.origin,shot.velocity,shot.age),hit=trajectoryImpact(shot.origin,shot.velocity,previous,shot.age,shot.launchTime,shotObstacles);
   shot.mesh.position.copy(hit?hit.point:p);let remove=crossesHarbour(old,shot.mesh.position);
   if(!remove)for(const ship of ships){if(ship===shot.owner||protectedShip(ship))continue;const center=collisionCenter.copy(ship.group.position);center.y+=(2.5+ship.layout.deckRise/2)*ship.scale;
     if(segmentSphere(old,shot.mesh.position,center,Math.max(5*ship.layout.collisionRadius/7,2.5+ship.layout.deckRise/2)*ship.scale)){ship.hp-=shot.damage;burst(shot.mesh.position,true);if(ship===player)notice('Incoming fire! Keep moving.');if(ship.hp<=0)sink(ship);remove=true;break;}}
   if(!remove&&hit){burst(shot.mesh.position);remove=true;}
   if(shot.age>SHOT_LIFETIME||Math.abs(p.x)>750||Math.abs(p.z)>750)remove=true;
   if(remove){shot.mesh.visible=false;shotPool.push(shot.mesh);shots.splice(j,1);}
 }
 for(let j=loot.length-1;j>=0;j--){const l=loot[j];l.age+=dt;l.mesh.position.set(l.x,waveHeight(l.x,l.z,time)+1,l.z);l.mesh.rotation.set(Math.sin(time+l.x)*.1,time*.15,Math.cos(time+l.z)*.1);if(Math.hypot(player.x-l.x,player.z-l.z)<13&&!dead){score+=100;progress={...progress,wallet:Math.min(1_000_000_000,progress.wallet+100)};persistProgress();player.hp=Math.min(player.stats.maxHp,player.hp+5);if(score>best){best=score;try{localStorage.setItem('dutchman-best',String(best));}catch{}}notice('+100 doubloons · +5 hull');tone(660,.16);scene.remove(l.mesh);loot.splice(j,1);}else if(l.age>180){scene.remove(l.mesh);loot.splice(j,1);}}
 for(let j=effects.length-1;j>=0;j--){const e=effects[j];e.life-=dt;e.velocity.y-=18*dt;e.mesh.position.addScaledVector(e.velocity,dt);e.mesh.scale.setScalar(Math.max(0,e.life/e.max));if(e.life<=0){e.mesh.visible=false;effectPool.push(e.mesh);effects.splice(j,1);}}
 regionSlot.value?.animate(time);spawnTimer+=dt;if(spawnTimer>9){spawnTimer=0;if(ships.length<currentRegion().enemyCount+1&&!dead)spawnEnemy();}noticeTimer-=dt;if(noticeTimer<=0)$('notice').textContent=destination(currentRegion(),player)?'Route buoys · F to inspect '+REGIONS[destination(currentRegion(),player)!.id].name:protectedShip(player)?'Safe harbour · weapons secured · F near the dock':ships.some(s=>s.enemy&&s.state==='engage')?'Hostile waters. Watch your broadsides.':'Explore the shallows. Hunt. Collect. Repeat.';
}
// HUD and chart read module state directly; IDs belong to the source index.html.
const map=$('map') as HTMLCanvasElement,ctx=map.getContext('2d')!;
function drawMap(){ctx.clearRect(0,0,180,180);ctx.strokeStyle='#729c9430';ctx.lineWidth=1;for(let i=0;i<=180;i+=30){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,180);ctx.moveTo(0,i);ctx.lineTo(180,i);ctx.stroke();}const point=(x:number,z:number)=>chartPoint(x,z,WORLD);const [hx,hy]=point(HARBOUR.x,HARBOUR.z);ctx.fillStyle='#a9dab62b';ctx.strokeStyle='#a9dab6';ctx.beginPath();ctx.arc(hx,hy,HARBOUR.radius/WORLD*85,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff3cc';ctx.font='10px sans-serif';ctx.fillText('P',hx-3,hy+3);for(const i of islands){const [x,y]=point(i.x,i.z);ctx.fillStyle='#7d9c78';ctx.beginPath();ctx.arc(x,y,i.r/WORLD*85,0,Math.PI*2);ctx.fill();}for(const l of loot){const[x,y]=point(l.x,l.z);ctx.fillStyle='#ffd078';ctx.fillRect(x-1.5,y-1.5,3,3);}for(const s of ships){const[x,y]=point(s.x,s.z);ctx.save();ctx.translate(x,y);ctx.rotate(chartHeading(s.yaw));ctx.fillStyle=s.enemy?'#f38770':'#fff3cc';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(-3,3);ctx.lineTo(3,3);ctx.closePath();ctx.fill();ctx.restore();}ctx.fillStyle='#ffe0a2';ctx.font='bold 10px sans-serif';ctx.textAlign='center';
 for(const edge of EDGES){const to=currentRegion().routes[edge];if(!to)continue;const p=edgePoint(edge,WORLD-55),[x,y]=point(p.x,p.z);ctx.fillText(edge[0].toUpperCase()+REGIONS[to].tier,x,y+3);}ctx.textAlign='start';
 ctx.strokeStyle='#94b7a65c';ctx.strokeRect(5,5,170,170);}
function hud(){ $('health').style.width=`${Math.max(0,player.hp/player.stats.maxHp*100)}%`;$('health-label').textContent=`${Math.max(0,Math.ceil(player.hp))} / ${player.stats.maxHp}`;$('score').textContent=String(progress.wallet).padStart(4,'0');$('kills').textContent=String(kills);$('best').textContent=String(best);$('angle').textContent=String(Math.round(elevation));$('speed').textContent=`${Math.round(player.speed*1.94)} KNOTS`;$('view-label').textContent=side<0?'PORT VIEW':side>0?'STARBOARD VIEW':'CHASE VIEW';for(const [idx,id] of ['port','starboard'].entries()){const c=player.cool[idx];$(id+'-bar').style.width=`${100*(1-c/player.stats.reload)}%`;$(id+'-label').textContent=c>0?`RELOADING ${c.toFixed(1)}s`:'READY';$(id).classList.toggle('active',side===(idx?1:-1));}$('gun-count').textContent=`${progress.guns.port} port / ${progress.guns.starboard} starboard`;$('enter-port').hidden=!running||!canDock(player);
 const route=destination(currentRegion(),player);$('travel-route').hidden=!running||!route;
 if(route)$('travel-route').textContent='F · '+REGIONS[route.id].name;
 if(!$('ship-details').hidden)renderShipStats(progress,player.hp,score);drawMap();}
// Rendering continues during pause; only running voyages advance fixed-step combat.
let last=performance.now(),accumulator=0,uiClock=0;const look=new T.Vector3(),cameraDesired=new T.Vector3(),cameraAim=new T.Vector3();
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min(.08,(now-last)/1000);last=now;if(running){accumulator+=dt;while(accumulator>=1/60&&running){simulate(1/60);accumulator-=1/60;}}else accumulator=0;
 if(!started){time+=dt;waterUniform.value=time;regionSlot.value?.animate(time);for(const s of ships){s.group.position.set(s.x,waveHeight(s.x,s.z,time),s.z);s.group.rotation.y=s.yaw;}const a=.5+Math.sin(time*.08)*.12;camera.position.set(player.x+Math.sin(a)*60,29,player.z-Math.cos(a)*60);camera.lookAt(player.x,5,player.z+10);}else{const f=direction(player.yaw),r=direction(player.yaw-Math.PI/2);const desired=cameraDesired.copy(player.group.position).addScaledVector(f,side?-player.layout.length*1.4:-35-(player.layout.length-16)*1.2).addScaledVector(r,side?-side*(24+player.layout.width):0);desired.y+=side?48+player.layout.deckRise:23+player.layout.deckRise+progress.upgrades.sails*1.5;camera.position.lerp(desired,1-Math.exp(-5*dt));const aim=cameraAim.copy(player.group.position).addScaledVector(side?r:f,side?side*22:18);aim.y+=side?2+player.layout.deckRise*.5:2+player.layout.deckRise*.5;look.lerp(aim,1-Math.exp(-7*dt));camera.lookAt(look);}playerSail.opacity=T.MathUtils.damp(playerSail.opacity,running&&side!==0?.2:1,8,dt);updateArc();uiClock+=dt;if(uiClock>.1){hud();uiClock=0;}renderer.render(scene,camera);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();graphicsLost=true;if(travelDialog.open){travelDialog.close();pendingTravel=null;}if(shipyard.dialog.open)shipyard.close();pause();$('overlay-copy').textContent='The graphics connection was interrupted. Reload this page to sail again.';($('start') as HTMLButtonElement).disabled=true;});
reset();
requestAnimationFrame(frame);
