// Geometry and weapon layout only. Upgrade purchasing/saving is deliberately separate.
export const SHIP_LIMITS = Object.freeze({lengthExtensions:3,widthUpgrades:2,decks:3,cannonsPerRow:6});
export type ShipUpgrades = {lengthExtensions:number,widthUpgrades:number,decks:number,cannonsPerRow:number};
export type CannonMount = {side:-1|1,deck:number,x:number,y:number,z:number};
const bounded = (value:number,min:number,max:number) => Number.isFinite(value)?Math.max(min,Math.min(max,Math.floor(value))):min;

export class ShipLayout {
  readonly upgrades:Readonly<ShipUpgrades>;
  readonly length:number;
  readonly width:number;
  readonly deckRise:number;
  readonly rows:ReadonlyArray<ReadonlyArray<Readonly<CannonMount>>>;
  private readonly port:ReadonlyArray<Readonly<CannonMount>>;
  private readonly starboard:ReadonlyArray<Readonly<CannonMount>>;

  constructor(upgrades:Partial<ShipUpgrades> = {}) {
    const lengthExtensions=bounded(upgrades.lengthExtensions??0,0,SHIP_LIMITS.lengthExtensions);
    const widthUpgrades=bounded(upgrades.widthUpgrades??0,0,SHIP_LIMITS.widthUpgrades);
    const decks=bounded(upgrades.decks??1,1,SHIP_LIMITS.decks);
    // One extra gun fits per length extension, with three-unit spacing between guns.
    const cannonsPerRow=bounded(upgrades.cannonsPerRow??3,1,Math.min(SHIP_LIMITS.cannonsPerRow,3+lengthExtensions));
    this.upgrades=Object.freeze({lengthExtensions,widthUpgrades,decks,cannonsPerRow});
    this.length=16+lengthExtensions*3;
    this.width=7+widthUpgrades*2;
    this.deckRise=(decks-1)*3;
    const rows:CannonMount[][]=[];
    for(const side of [-1,1] as const)for(let deck=0;deck<decks;deck++){
      rows.push(Array.from({length:cannonsPerRow},(_,i)=>Object.freeze({side,deck,x:-side*(this.width/2+1.25),y:3.6+deck*3,z:(i-(cannonsPerRow-1)/2)*3})));
    }
    this.rows=Object.freeze(rows.map(row=>Object.freeze(row)));
    this.port=Object.freeze(rows.filter(row=>row[0].side===-1).flat());
    this.starboard=Object.freeze(rows.filter(row=>row[0].side===1).flat());
  }

  mounts(side:number) { return side<0?this.port:this.starboard; }
  get floatLength() { return 6*this.length/16; }
  get floatWidth() { return 3*this.width/7; }
  get collisionRadius() { return 7*Math.max(this.length/16,this.width/7); }
}

export const BASE_SHIP = new ShipLayout();
export function firingSides(aimSide:number):readonly number[] { return aimSide===0?[-1,1]:[aimSide]; }

// North is +Z; +X is left when looking forward from the stern.
export function chartPoint(x:number,z:number,world:number) { return [90-x/world*85,90-z/world*85]; }
export function chartHeading(yaw:number) { return -yaw; }
