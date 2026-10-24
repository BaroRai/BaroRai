import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ballistic,segmentSphere,waveHeight,WAVES,angleDelta} from '../src/physics.ts';
test('ballistic projectile returns to launch height after its flight time',()=>{const t=20/9.81;const p=ballistic({x:0,y:3,z:0},{x:30,y:10,z:0},t);assert.ok(Math.abs(p.y-3)<1e-8);assert.ok(Math.abs(p.x-30*t)<1e-8);});
test('swept collision catches a projectile crossing a hull between frames',()=>{assert.equal(segmentSphere({x:-20,y:0,z:0},{x:20,y:0,z:0},{x:0,y:0,z:0},5),true);assert.equal(segmentSphere({x:-20,y:6,z:0},{x:20,y:6,z:0},{x:0,y:0,z:0},5),false);});
test('float samples match horizontally displaced GPU wave vertices',()=>{for(let t=0;t<20;t+=.3){const u=t*7,v=t*-5;let x=u,z=v,y=0;for(const w of WAVES){const p=w.k*(u*w.dx+v*w.dz-w.speed*t);x+=w.steep*w.a*w.dx*Math.cos(p);z+=w.steep*w.a*w.dz*Math.cos(p);y+=w.a*Math.sin(p);}assert.ok(Math.abs(waveHeight(x,z,t)-y)<.001);}});
test('steering wraps across the angular seam using the shortest turn',()=>assert.ok(Math.abs(angleDelta(-Math.PI+.1,Math.PI-.1)-.2)<1e-9));
