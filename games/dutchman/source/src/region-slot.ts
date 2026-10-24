// The old region must release its resources before the next factory runs.
// Descriptors may be retained; scenes, materials, NPCs and collision arrays may not.
export class RegionSlot<T extends {dispose():void}>{
 private current:T|undefined;
 get value(){return this.current;}
 replace(create:()=>T):T{
  this.clear();
  this.current=create();
  return this.current;
 }
 clear(){const old=this.current;this.current=undefined;old?.dispose();}
}
