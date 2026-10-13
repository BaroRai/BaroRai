import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {WORLD,WAVES,waveHeight,ballistic,angleDelta,segmentSphere,trajectorySamples} from './physics';
import {BASE_SHIP,SHIP_LIMITS,ShipLayout,firingSides,chartPoint,chartHeading} from './ship-layout';
import type {CannonMount} from './ship-layout';
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
function mesh(geo:T.BufferGeometry,m:T.Material,x=0,y=0,z=0){const v=new T.Mesh(geo,m);v.position.set(x,y,z);return v;}
function box(g:T.Group,m:T.Material,w:number,h:number,d:number,x:number,y:number,z:number){g.add(mesh(new T.BoxGeometry(w,h,d),m,x,y,z));}
function consolidate(g:T.Group){g.updateMatrixWorld(true);const batches=new Map<T.Material,T.BufferGeometry[]>();g.traverse(o=>{if(o instanceof T.Mesh){const geo=o.geometry.clone().applyMatrix4(o.matrixWorld);const m=o.material as T.Material;const a=batches.get(m)||[];a.push(geo);batches.set(m,a);}});const out=new T.Group();for(const [m,gs] of batches){out.add(mesh(mergeGeometries(gs.map(g=>g.index?g.toNonIndexed():g))!,m));for(const g of gs)g.dispose();}g.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});return out;}
function makeShip(enemy:boolean,layout:ShipLayout){
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
 for(const z of [-3-extension,3+extension]){g.add(mesh(new T.CylinderGeometry(.17,.25,13,6),wood,0,8+top,z));box(g,wood,10*w,.22,.22,0,12+top,z);const sail=new T.PlaneGeometry(9*w,6,4,3);const p=sail.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin((x/(9*w)+.5)*Math.PI)*1.1);p.setX(i,x*(.8+.2*(y/6+.5)));}sail.computeVertexNormals();g.add(mesh(sail,enemy?enemySail:playerSail,0,8.7+top,z));box(g,enemy?red:trim,2,.8,.08,1,14.3+top,z);}
 for(const row of layout.rows)for(const mount of row){const x=mount.x+mount.side*1.25;const cannon=mesh(new T.CylinderGeometry(.38,.48,2.5,7),dark,x,mount.y,mount.z);cannon.rotation.z=Math.PI/2;g.add(cannon);box(g,wood,1,1,1,x+mount.side*.9,mount.y-.4,mount.z);}
 return consolidate(g);
}
// Player-only sail material: fading must never affect enemy ships or hull trim.
const playerSail=cream.clone(),enemySail=red.clone();playerSail.side=enemySail.side=T.DoubleSide;
playerSail.transparent=true;playerSail.depthWrite=false;
const shipTemplates=new Map<string,T.Group>();
// Entity records share module state; player is also a member of ships.
type Ship={group:T.Group,layout:ShipLayout,x:number,z:number,yaw:number,speed:number,hp:number,scale:number,enemy:boolean,cool:number[],state:string,phase:number,vy:number};
const ships:Ship[]=[];let player:Ship;
function spawnShip(x:number,z:number,enemy:boolean,scale=1,layout=BASE_SHIP){
 const key=JSON.stringify([enemy,layout.upgrades]);let template=shipTemplates.get(key);
 if(!template){template=makeShip(enemy,layout);shipTemplates.set(key,template);}
 const group=template.clone();group.scale.setScalar(scale);scene.add(group);const s:Ship={group,layout,x,z,yaw:enemy?Math.random()*Math.PI*2:0,speed:0,hp:enemy?65:100,scale,enemy,cool:[0,0],state:'patrol',phase:Math.random()*100,vy:0};ships.push(s);return s;
}

// GPU and CPU share the same wave coefficients and simulation clock.
const waterUniform={value:0};
const waveGLSL=WAVES.map(w=>`{float p=${w.k.toFixed(8)}*(dot(q,vec2(${w.dx.toFixed(8)},${w.dz.toFixed(8)}))-${w.speed.toFixed(4)}*uTime);pos.y+=${w.a.toFixed(4)}*sin(p);pos.xz+=vec2(${w.dx.toFixed(8)},${w.dz.toFixed(8)})*${(w.steep*w.a).toFixed(8)}*cos(p);}`).join('\n');
const waterMaterial=new T.ShaderMaterial({uniforms:{uTime:waterUniform},vertexShader:`uniform float uTime;varying vec3 world;void main(){vec3 pos=position;vec2 q=pos.xz;${waveGLSL}world=pos;gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);}`,fragmentShader:`varying vec3 world;void main(){vec3 n=normalize(cross(dFdx(world),dFdy(world)));float light=.5+.5*abs(dot(n,normalize(vec3(-.3,1.,-.5))));vec3 col=mix(vec3(.035,.39,.47),vec3(.13,.64,.65),light);float foam=smoothstep(.82,1.14,world.y);col=mix(col,vec3(.67,.87,.78),foam*.5);float fog=smoothstep(270.,1050.,distance(cameraPosition,world));gl_FragColor=vec4(mix(col,vec3(.65,.875,.847),fog),1.);}`});
const oceanGeo=new T.PlaneGeometry(2200,2200,230,230);oceanGeo.rotateX(-Math.PI/2);scene.add(mesh(oceanGeo,waterMaterial));
type Island={x:number,z:number,r:number};const islands:Island[]=[{x:-190,z:100,r:42},{x:165,z:200,r:48},{x:-340,z:-210,r:62},{x:320,z:-240,r:55},{x:35,z:430,r:50},{x:450,z:330,r:35},{x:-460,z:370,r:55}];
const sand=mat(0xe2c78f),grass=mat(0x639e75),rock=mat(0x648b85),leaf=mat(0x397a61);
for(const i of islands){const g=new T.Group();const base=mesh(new T.CylinderGeometry(i.r*.75,i.r,8,9),sand,0,1,0);g.add(base);g.add(mesh(new T.ConeGeometry(i.r*.8,18,7),grass,0,11,0));for(let j=0;j<5;j++){const a=j*2.4;const x=Math.sin(a)*i.r*.48,z=Math.cos(a)*i.r*.48;g.add(mesh(new T.DodecahedronGeometry(5+j%3,0),rock,x,6,z));g.add(mesh(new T.CylinderGeometry(.6,1,13,5),wood,x,12,z));for(let k=0;k<4;k++){const l=mesh(new T.ConeGeometry(3,11,4),leaf,x+Math.sin(k*1.57)*3,19,z+Math.cos(k*1.57)*3);l.rotation.z=Math.sin(k*1.57)*1.1;l.rotation.x=Math.cos(k*1.57)*1.1;g.add(l);}}const island=consolidate(g);island.position.set(i.x,0,i.z);scene.add(island);}
const buoyTemplate=new T.Group();buoyTemplate.add(mesh(new T.ConeGeometry(1.4,3,6),trim));buoyTemplate.add(mesh(new T.CylinderGeometry(.13,.13,5,5),dark,0,2,0));const buoys:T.Group[]=[];for(let j=0;j<80;j++){const side=Math.floor(j/20),a=(j%20)/20*1200-600;const b=buoyTemplate.clone();b.position.set(side===0?-600:side===1?600:a,0,side===2?-600:side===3?600:a);scene.add(b);buoys.push(b);}
// Dynamic entities and reusable mesh pools. Templates share geometry/materials.
type Shot={mesh:T.Mesh,origin:T.Vector3,velocity:T.Vector3,age:number,owner:Ship};const shots:Shot[]=[];const shotPool:T.Mesh[]=[];const ballGeo=new T.SphereGeometry(.48,7,5);
type Loot={mesh:T.Group,x:number,z:number,age:number};const loot:Loot[]=[];const crateTemplate=new T.Group();box(crateTemplate,deck,2.7,2.7,2.7,0,0,0);box(crateTemplate,trim,2.85,.35,2.85,0,.8,0);box(crateTemplate,trim,2.85,.35,2.85,0,-.8,0);box(crateTemplate,trim,.35,2.85,2.85,0,0,0);
type Effect={mesh:T.Mesh,velocity:T.Vector3,life:number,max:number};const effects:Effect[]=[];const effectPool:T.Mesh[]=[];const effectGeo=new T.IcosahedronGeometry(.6,0);const splashMat=mat(0xe4f5cd),hitMat=mat(0xffbd63);
function burst(p:T.Vector3,hit=false){for(let i=0;i<10&&effects.length<160;i++){const m=effectPool.pop()||mesh(effectGeo,splashMat);m.material=hit?hitMat:splashMat;m.position.copy(p);m.scale.setScalar(1);m.visible=true;scene.add(m);effects.push({mesh:m,velocity:new T.Vector3((Math.random()-.5)*12,Math.random()*9+2,(Math.random()-.5)*12),life:.7,max:.7});}}
// Synthesized audio and voyage state; only best score persists between page loads.
let audio:AudioContext|undefined,sound=false;function tone(freq:number,duration:number,volume=.1){if(!sound)return;audio??=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*.3),audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
let running=false,started=false,dead=false,time=0,score=0,kills=0,best=0,elevation=22,side=0,spawnTimer=0,noticeTimer=0;
try{best=Number(localStorage.getItem('dutchman-best'))||0;}catch{}$('best').textContent=String(best);
// Input has immediate press actions as well as held actions in simulate().
const keys=new Set<string>();let mouseFire=false;const controlled=['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','Space'];
function notice(t:string){$('notice').textContent=t;noticeTimer=4;}
function aimSide(){return keys.has('KeyQ')?-1:keys.has('KeyE')?1:0;}
window.addEventListener('keydown',e=>{if(controlled.includes(e.code)){if(running)e.preventDefault();keys.add(e.code);if(running&&!e.repeat){if(e.code==='Space')firePlayer();if(e.code==='ArrowUp')elevation=Math.min(55,elevation+1);if(e.code==='ArrowDown')elevation=Math.max(5,elevation-1);}}if(e.code==='Escape'&&!e.repeat&&started&&!dead)togglePause();});window.addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('pointerdown',e=>{if(e.button===0&&running){mouseFire=true;firePlayer();}});window.addEventListener('pointerup',()=>mouseFire=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{if(running){e.preventDefault();elevation=T.MathUtils.clamp(elevation-Math.sign(e.deltaY)*2,5,55);}},{passive:false});
function clearInput(){keys.clear();mouseFire=false;side=0;}
window.addEventListener('blur',()=>{clearInput();if(running)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound));tone(400,.15);};$('pause').onclick=()=>{if(started&&!dead)togglePause();};
function pause(){running=false;clearInput();document.body.classList.add('paused');$('overlay').classList.remove('hidden');$('overlay-copy').textContent='Your voyage is paused. The sea can wait.';$('start').innerHTML='Resume voyage <span>↗</span>';$('pause').textContent='Resume';}
function togglePause(){if(running)pause();else resume();}
function resume(){running=true;clearInput();document.body.classList.remove('paused');document.body.classList.add('playing');$('overlay').classList.add('hidden');$('pause').innerHTML='Pause <kbd>Esc</kbd>';}
$('start').onclick=()=>{if(!started||dead)reset();started=true;resume();tone(330,.2);notice('Click or Space: both sides. Hold Q or E: aim one side.');};
// Fleet lifecycle: reset seeds a voyage; the timer in simulate replenishes enemies.
function safePosition(x:number,z:number){return islands.every(i=>Math.hypot(x-i.x,z-i.z)>i.r+24);}
function spawnEnemy(){for(let tries=0;tries<50;tries++){const x=(Math.random()-.5)*1040,z=(Math.random()-.5)*1040;if(safePosition(x,z)&&Math.hypot(x-player.x,z-player.z)>150&&ships.every(s=>Math.hypot(s.x-x,s.z-z)>35)){spawnShip(x,z,true,.72+Math.random()*.25);break;}}}
function reset(){for(const s of ships)scene.remove(s.group);ships.length=0;for(const s of shots){s.mesh.visible=false;shotPool.push(s.mesh);}shots.length=0;for(const l of loot)scene.remove(l.mesh);loot.length=0;for(const e of effects){e.mesh.visible=false;effectPool.push(e.mesh);}effects.length=0;score=0;kills=0;dead=false;time=0;elevation=22;spawnTimer=0;player=spawnShip(0,-130,false);spawnShip(-85,15,true,.85);spawnShip(100,50,true,.76);for(let i=0;i<6;i++)spawnEnemy();camera.position.set(0,30,-180);}
reset();
// Forward is +Z at yaw=0; right is yaw-PI/2. Port=-1, starboard=+1.
function direction(yaw:number){return new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));}
const muzzleSpeed=46;
function shotData(s:Ship,broadside:number,angle:number,mount:Readonly<CannonMount>){const f=direction(s.yaw),r=direction(s.yaw-Math.PI/2);const origin=s.group.position.clone().addScaledVector(r,-mount.x*s.scale).addScaledVector(f,mount.z*s.scale);origin.y+=mount.y*s.scale;const velocity=r.multiplyScalar(broadside*muzzleSpeed*Math.cos(angle)).addScaledVector(f,s.speed);velocity.y=muzzleSpeed*Math.sin(angle);return{origin,velocity};}
function fire(s:Ship,broadside:number,angle:number){
 const idx=broadside<0?0:1,mounts=s.layout.mounts(broadside);
 // Reserve a complete row volley: upgrades must not overrun the original 93-shot cap.
 if(s.cool[idx]>0||shots.length+mounts.length>93)return;
 s.cool[idx]=s.enemy?4.5:2.8;
 for(const mount of mounts){const data=shotData(s,broadside,angle,mount);const m=shotPool.pop()||mesh(ballGeo,dark);m.position.copy(data.origin);m.visible=true;scene.add(m);shots.push({mesh:m,...data,age:0,owner:s});}
 burst(shotData(s,broadside,angle,mounts[Math.floor(mounts.length/2)]).origin,true);if(!s.enemy)tone(85,.32,.16);
}
function firePlayer(){for(const broadside of firingSides(aimSide()))fire(player,broadside,elevation*Math.PI/180);}
function sink(s:Ship){burst(s.group.position.clone(),true);scene.remove(s.group);ships.splice(ships.indexOf(s),1);if(s.enemy){kills++;notice('Ship sunk. Collect the floating crates!');for(let j=0;j<3;j++){if(loot.length>=60){scene.remove(loot.shift()!.mesh);}const m=crateTemplate.clone();scene.add(m);loot.push({mesh:m,x:s.x+(Math.random()-.5)*14,z:s.z+(Math.random()-.5)*14,age:0});}}else{dead=true;running=false;clearInput();document.body.classList.add('paused');$('overlay').classList.remove('hidden');$('overlay-copy').textContent=`Your voyage ends here. ${score} doubloons collected · ${kills} ships sunk. Ready for another?`;$('start').innerHTML='Sail again <span>↗</span>';tone(90,.7);}}
// A shared local ballistic shape is translated to each cannon; sea clipping stays live.
const maxBroadsideGuns=SHIP_LIMITS.decks*SHIP_LIMITS.cannonsPerRow;
const arcPoints=new Float32Array(maxBroadsideGuns*100*2*3),arcGeo=new T.BufferGeometry();arcGeo.setAttribute('position',new T.BufferAttribute(arcPoints,3));
const arc=new T.LineSegments(arcGeo,new T.LineBasicMaterial({color:0xffe8a7,transparent:true,opacity:.65}));arc.frustumCulled=false;scene.add(arc);
const targets=new T.InstancedMesh(new T.TorusGeometry(2.2,.14,5,24),new T.MeshBasicMaterial({color:0xffe8a7}),maxBroadsideGuns);targets.frustumCulled=false;scene.add(targets);
const targetTransform=new T.Object3D();targetTransform.rotation.x=Math.PI/2;
let arcAngle=NaN,arcSamples:ReturnType<typeof trajectorySamples>=[];
function updateArc(){
 arc.visible=targets.visible=running&&side!==0;if(!arc.visible)return;
 if(arcAngle!==elevation){arcAngle=elevation;arcSamples=trajectorySamples(elevation*Math.PI/180,muzzleSpeed);}
 const f=direction(player.yaw),r=direction(player.yaw-Math.PI/2),mounts=player.layout.mounts(side);let n=0;
 for(let i=0;i<mounts.length;i++){
   const origin=shotData(player,side,elevation*Math.PI/180,mounts[i]).origin;
   let x=origin.x,y=origin.y,z=origin.z;
   for(let j=1;j<arcSamples.length;j++){
     const p=arcSamples[j],px=x,py=y,pz=z;
     x=origin.x+r.x*side*p.x+f.x*player.speed*p.t;y=origin.y+p.y;z=origin.z+r.z*side*p.x+f.z*player.speed*p.t;
     arcPoints[n++]=px;arcPoints[n++]=py;arcPoints[n++]=pz;arcPoints[n++]=x;arcPoints[n++]=y;arcPoints[n++]=z;
     if(y<=waveHeight(x,z,time))break;
   }
   targetTransform.position.set(x,waveHeight(x,z,time)+.3,z);targetTransform.updateMatrix();targets.setMatrixAt(i,targetTransform.matrix);
 }
 targets.count=mounts.length;targets.instanceMatrix.needsUpdate=true;arcGeo.setDrawRange(0,n/3);arcGeo.attributes.position.needsUpdate=true;
}
// Fixed-step order is gameplay-sensitive; see docs/dutchman.md before reordering.
function simulate(dt:number){time+=dt;waterUniform.value=time;side=aimSide();if(keys.has('ArrowUp'))elevation=Math.min(55,elevation+24*dt);if(keys.has('ArrowDown'))elevation=Math.max(5,elevation-24*dt);
 if(mouseFire||keys.has('Space'))firePlayer();
 for(const s of [...ships]){s.cool=s.cool.map(c=>Math.max(0,c-dt));let steer=0,desired=0;
 if(!s.enemy){desired=keys.has('KeyW')?22:keys.has('KeyS')?0:Math.max(0,s.speed-2*dt);steer=(keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0);}else{const dx=player.x-s.x,dz=player.z-s.z,dist=Math.hypot(dx,dz);const heading=Math.atan2(dx,dz);s.state=dist<210?'engage':'patrol';let wanted=s.yaw+Math.sin(time*.12+s.phase)*.4;desired=8;
 if(s.state==='engage'){wanted=heading+(dist<145?Math.PI/2:0);desired=dist<100?7:12;const rel=angleDelta(heading,s.yaw);const bs=rel>0?-1:1;const error=Math.abs(Math.abs(rel)-Math.PI/2);if(dist<185&&dist>30&&error<.22){const angle=Math.asin(Math.min(.95,dist*9.81/(muzzleSpeed*muzzleSpeed)))/2;fire(s,bs,angle);}}
 for(const i of islands){if(Math.hypot(s.x-i.x,s.z-i.z)<i.r+65){wanted=Math.atan2(s.x-i.x,s.z-i.z);desired=7;}}
 if(Math.max(Math.abs(s.x),Math.abs(s.z))>530)wanted=Math.atan2(-s.x,-s.z);steer=T.MathUtils.clamp(angleDelta(wanted,s.yaw)*2,-1,1);}
 s.speed=T.MathUtils.damp(s.speed,desired,keys.has('KeyS')&&!s.enemy?2.8:.65,dt);s.yaw+=steer*.65*dt*(.3+.7*Math.min(1,s.speed/10));s.x+=Math.sin(s.yaw)*s.speed*dt;s.z+=Math.cos(s.yaw)*s.speed*dt;
 for(const i of islands){let dx=s.x-i.x,dz=s.z-i.z;const dist=Math.hypot(dx,dz),min=i.r+s.layout.collisionRadius*s.scale;if(dist<min){dx=dist?dx/dist:1;dz=dist?dz/dist:0;s.x=i.x+dx*min;s.z=i.z+dz*min;s.speed*=.97;}}
 if(Math.abs(s.x)>WORLD-8||Math.abs(s.z)>WORLD-8){s.x=T.MathUtils.clamp(s.x,-WORLD+8,WORLD-8);s.z=T.MathUtils.clamp(s.z,-WORLD+8,WORLD-8);s.speed*=.97;if(!s.enemy&&noticeTimer<=0)notice('Chart boundary. Turn back toward the islands.');}
 const f=direction(s.yaw),r=direction(s.yaw-Math.PI/2);const h=waveHeight(s.x,s.z,time);const fl=s.layout.floatLength,fw=s.layout.floatWidth;const front=waveHeight(s.x+f.x*fl,s.z+f.z*fl,time),back=waveHeight(s.x-f.x*fl,s.z-f.z*fl,time),left=waveHeight(s.x-r.x*fw,s.z-r.z*fw,time),right=waveHeight(s.x+r.x*fw,s.z+r.z*fw,time);s.vy+=(h-s.group.position.y)*16*dt;s.vy*=Math.exp(-6*dt);s.group.position.set(s.x,s.group.position.y+s.vy*dt,s.z);s.group.rotation.order='YXZ';s.group.rotation.y=s.yaw;s.group.rotation.x=T.MathUtils.damp(s.group.rotation.x,-Math.atan2(front-back,fl*2),5,dt);s.group.rotation.z=T.MathUtils.damp(s.group.rotation.z,-Math.atan2(right-left,fw*2)-steer*.06,5,dt);
 }
 for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++){const a=ships[i],b=ships[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),min=a.layout.collisionRadius*a.scale+b.layout.collisionRadius*b.scale;if(d<min){const push=(min-d)/2,ux=d?dx/d:1,uz=d?dz/d:0;a.x-=ux*push;a.z-=uz*push;b.x+=ux*push;b.z+=uz*push;a.speed*=.98;b.speed*=.98;}}
 for(let j=shots.length-1;j>=0;j--){const s=shots[j],old=s.mesh.position.clone();s.age+=dt;const p=ballistic(s.origin,s.velocity,s.age);s.mesh.position.set(p.x,p.y,p.z);let remove=false;for(const ship of [...ships]){if(ship===s.owner)continue;const center=ship.group.position.clone();center.y+=(2.5+ship.layout.deckRise/2)*ship.scale;if(segmentSphere(old,s.mesh.position,center,Math.max(5*ship.layout.collisionRadius/7,2.5+ship.layout.deckRise/2)*ship.scale)){ship.hp-=s.owner.enemy?9:25;burst(s.mesh.position,true);if(ship===player)notice('Incoming fire! Keep moving.');if(ship.hp<=0)sink(ship);remove=true;break;}}
 if(!remove&&(p.y<=waveHeight(p.x,p.z,time)||islands.some(i=>Math.hypot(p.x-i.x,p.z-i.z)<i.r&&p.y<12))){burst(s.mesh.position);remove=true;}if(s.age>9||Math.abs(p.x)>750||Math.abs(p.z)>750)remove=true;if(remove){s.mesh.visible=false;shotPool.push(s.mesh);shots.splice(j,1);}}
 for(let j=loot.length-1;j>=0;j--){const l=loot[j];l.age+=dt;l.mesh.position.set(l.x,waveHeight(l.x,l.z,time)+1,l.z);l.mesh.rotation.set(Math.sin(time+l.x)*.1,time*.15,Math.cos(time+l.z)*.1);if(Math.hypot(player.x-l.x,player.z-l.z)<13&&!dead){score+=100;player.hp=Math.min(100,player.hp+5);if(score>best){best=score;try{localStorage.setItem('dutchman-best',String(best));}catch{}}notice('+100 doubloons · +5 hull');tone(660,.16);scene.remove(l.mesh);loot.splice(j,1);}else if(l.age>180){scene.remove(l.mesh);loot.splice(j,1);}}
 for(let j=effects.length-1;j>=0;j--){const e=effects[j];e.life-=dt;e.velocity.y-=18*dt;e.mesh.position.addScaledVector(e.velocity,dt);e.mesh.scale.setScalar(Math.max(0,e.life/e.max));if(e.life<=0){e.mesh.visible=false;effectPool.push(e.mesh);effects.splice(j,1);}}
 for(const b of buoys)b.position.y=waveHeight(b.position.x,b.position.z,time)+1;spawnTimer+=dt;if(spawnTimer>9){spawnTimer=0;if(ships.length<9&&!dead)spawnEnemy();}noticeTimer-=dt;if(noticeTimer<=0)$('notice').textContent=ships.some(s=>s.enemy&&s.state==='engage')?'Hostile waters. Watch your broadsides.':'Explore the shallows. Hunt. Collect. Repeat.';
}
// HUD and chart read module state directly; IDs belong to the source index.html.
const map=$('map') as HTMLCanvasElement,ctx=map.getContext('2d')!;
function drawMap(){ctx.clearRect(0,0,180,180);ctx.strokeStyle='#729c9430';ctx.lineWidth=1;for(let i=0;i<=180;i+=30){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,180);ctx.moveTo(0,i);ctx.lineTo(180,i);ctx.stroke();}const point=(x:number,z:number)=>chartPoint(x,z,WORLD);for(const i of islands){const [x,y]=point(i.x,i.z);ctx.fillStyle='#7d9c78';ctx.beginPath();ctx.arc(x,y,i.r/WORLD*85,0,Math.PI*2);ctx.fill();}for(const l of loot){const[x,y]=point(l.x,l.z);ctx.fillStyle='#ffd078';ctx.fillRect(x-1.5,y-1.5,3,3);}for(const s of ships){const[x,y]=point(s.x,s.z);ctx.save();ctx.translate(x,y);ctx.rotate(chartHeading(s.yaw));ctx.fillStyle=s.enemy?'#f38770':'#fff3cc';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(-3,3);ctx.lineTo(3,3);ctx.closePath();ctx.fill();ctx.restore();}ctx.strokeStyle='#94b7a65c';ctx.strokeRect(5,5,170,170);}
function hud(){ $('health').style.width=`${Math.max(0,player.hp)}%`;$('health-label').textContent=`${Math.max(0,Math.ceil(player.hp))} / 100`;$('score').textContent=String(score).padStart(4,'0');$('kills').textContent=String(kills);$('best').textContent=String(best);$('angle').textContent=String(Math.round(elevation));$('speed').textContent=`${Math.round(player.speed*1.94)} KNOTS`;$('view-label').textContent=side<0?'PORT VIEW':side>0?'STARBOARD VIEW':'CHASE VIEW';for(const [idx,id] of ['port','starboard'].entries()){const c=player.cool[idx];$(id+'-bar').style.width=`${100*(1-c/2.8)}%`;$(id+'-label').textContent=c>0?`RELOADING ${c.toFixed(1)}s`:'READY';$(id).classList.toggle('active',side===(idx?1:-1));}drawMap();}
// Rendering continues during pause; only running voyages advance fixed-step combat.
let last=performance.now(),accumulator=0,uiClock=0;const look=new T.Vector3();
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min(.08,(now-last)/1000);last=now;if(running){accumulator+=dt;while(accumulator>=1/60&&running){simulate(1/60);accumulator-=1/60;}}else accumulator=0;
 if(!started){time+=dt;waterUniform.value=time;for(const s of ships){s.group.position.set(s.x,waveHeight(s.x,s.z,time),s.z);s.group.rotation.y=s.yaw;}const a=.5+Math.sin(time*.08)*.12;camera.position.set(player.x+Math.sin(a)*60,29,player.z-Math.cos(a)*60);camera.lookAt(player.x,5,player.z+10);}else{const f=direction(player.yaw),r=direction(player.yaw-Math.PI/2);const desired=player.group.position.clone().addScaledVector(f,side?-player.layout.length*.5:-35).addScaledVector(r,side?side*(player.layout.width*.5+1):0);desired.y+=side?10+player.layout.deckRise:23;camera.position.lerp(desired,1-Math.exp(-5*dt));const aim=player.group.position.clone().addScaledVector(side?r:f,side?side*65:18);aim.y+=side?5:2;look.lerp(aim,1-Math.exp(-7*dt));camera.lookAt(look);}playerSail.opacity=T.MathUtils.damp(playerSail.opacity,running&&side!==0?.2:1,8,dt);updateArc();uiClock+=dt;if(uiClock>.1){hud();uiClock=0;}renderer.render(scene,camera);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('overlay-copy').textContent='The graphics connection was interrupted. Reload this page to sail again.';($('start') as HTMLButtonElement).disabled=true;});
requestAnimationFrame(frame);
