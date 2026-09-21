export const WORLD=600;
export const WAVES=[{dx:1,dz:.25,a:.65,length:65,speed:7,steep:.3},{dx:-.6,dz:1,a:.4,length:39,speed:5,steep:.24},{dx:.7,dz:-1,a:.23,length:19,speed:3.5,steep:.2}].map(w=>{const n=Math.hypot(w.dx,w.dz);return {...w,dx:w.dx/n,dz:w.dz/n,k:Math.PI*2/w.length};});
// Invert horizontal Gerstner displacement so CPU float samples match the rendered surface.
export function waveHeight(x:number,z:number,t:number){let u=x,v=z;for(let j=0;j<3;j++){let ox=0,oz=0;for(const w of WAVES){const p=w.k*(u*w.dx+v*w.dz-w.speed*t);ox+=w.steep*w.a*w.dx*Math.cos(p);oz+=w.steep*w.a*w.dz*Math.cos(p);}u=x-ox;v=z-oz;}let h=0;for(const w of WAVES)h+=w.a*Math.sin(w.k*(u*w.dx+v*w.dz-w.speed*t));return h;}
export function ballistic(origin:{x:number,y:number,z:number},velocity:{x:number,y:number,z:number},t:number){return{x:origin.x+velocity.x*t,y:origin.y+velocity.y*t-4.905*t*t,z:origin.z+velocity.z*t};}
export function angleDelta(a:number,b:number){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
export function segmentSphere(a:{x:number,y:number,z:number},b:{x:number,y:number,z:number},c:{x:number,y:number,z:number},r:number){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;const den=dx*dx+dy*dy+dz*dz;const t=den?Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.y-a.y)*dy+(c.z-a.z)*dz)/den)):0;return Math.hypot(a.x+t*dx-c.x,a.y+t*dy-c.y,a.z+t*dz-c.z)<=r;}
