export const HARBOUR=Object.freeze({x:0,z:-400,radius:95,dockX:0,dockZ:-427,dockRadius:32,spawnX:0,spawnZ:-417});
export const PORT_OBSTACLES=Object.freeze([{x:0,z:-473,r:25,height:15},{x:-27,z:-439,r:6,height:4}]);
type Point={x:number,z:number};
// Any overlap protects the hull. Enemies keep their entire hull outside the boundary.
export function inHarbour(p:Point,radius=0){return Math.hypot(p.x-HARBOUR.x,p.z-HARBOUR.z)<=HARBOUR.radius+radius;}
export function canDock(p:Point){return inHarbour(p)&&Math.hypot(p.x-HARBOUR.dockX,p.z-HARBOUR.dockZ)<=HARBOUR.dockRadius;}
export function crossesHarbour(a:Point,b:Point){const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;const t=den?Math.max(0,Math.min(1,((HARBOUR.x-a.x)*dx+(HARBOUR.z-a.z)*dz)/den)):0;return inHarbour({x:a.x+dx*t,z:a.z+dz*t});}
export function outsideHarbour(p:Point,clearance:number){const dx=p.x-HARBOUR.x,dz=p.z-HARBOUR.z,d=Math.hypot(dx,dz),r=HARBOUR.radius+clearance;return d>=r?p:{x:HARBOUR.x+(d?dx/d:0)*r,z:HARBOUR.z+(d?dz/d:1)*r};}
