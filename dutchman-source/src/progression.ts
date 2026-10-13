import {SHIP_LIMITS,ShipLayout} from './ship-layout.ts';
import type {Armament} from './ship-layout.ts';

export const SAVE_KEY='dutchman-progress-v1';
export const START_ELEVATION=10;
export const MUZZLE_SPEED=60;
export const EQUIPMENT_CAP=3;
export type Equipment={cannonQuality:number,sails:number,helm:number,anchor:number,reinforcement:number};
export type Upgrades=Equipment & {lengthExtensions:number,widthUpgrades:number,decks:number};
export type Progress={version:1,wallet:number,upgrades:Upgrades,guns:Armament};
export type ShipStats={maxHp:number,maxSpeed:number,acceleration:number,turnRate:number,braking:number,damage:number,reload:number,muzzleSpeed:number};
export const BASE_EQUIPMENT:Readonly<Equipment>=Object.freeze({cannonQuality:0,sails:0,helm:0,anchor:0,reinforcement:0});
export function freshProgress():Progress{return {version:1,wallet:0,upgrades:{...BASE_EQUIPMENT,lengthExtensions:0,widthUpgrades:0,decks:1},guns:{port:3,starboard:3}};}
const integer=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,Math.floor(value))):min;
export function normalizeProgress(value:unknown):Progress{
  const fresh=freshProgress();
  if(!value||typeof value!=='object'||(value as {version?:unknown}).version!==1)return fresh;
  const v=value as Partial<Progress>,u=v.upgrades;
  if(u&&typeof u==='object'){
    fresh.upgrades.lengthExtensions=integer(u.lengthExtensions,0,SHIP_LIMITS.lengthExtensions);
    fresh.upgrades.widthUpgrades=integer(u.widthUpgrades,0,SHIP_LIMITS.widthUpgrades);
    fresh.upgrades.decks=integer(u.decks,1,Math.min(SHIP_LIMITS.decks,1+fresh.upgrades.widthUpgrades));
    for(const key of Object.keys(BASE_EQUIPMENT) as (keyof Equipment)[])fresh.upgrades[key]=integer(u[key],0,EQUIPMENT_CAP);
  }
  const capacity=layoutFor(fresh).rowCapacity*fresh.upgrades.decks;
  if(v.guns&&typeof v.guns==='object')fresh.guns={port:integer(v.guns.port,0,capacity),starboard:integer(v.guns.starboard,0,capacity)};
  fresh.wallet=integer(v.wallet,0,1_000_000_000);return fresh;
}
export type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function loadProgress(storage:StorageLike):Progress{try{return normalizeProgress(JSON.parse(storage.getItem(SAVE_KEY)??'null'));}catch{return freshProgress();}}
export function saveProgress(storage:StorageLike,p:Progress){try{storage.setItem(SAVE_KEY,JSON.stringify(p));return true;}catch{return false;}}
export function layoutFor(p:Progress){return new ShipLayout(p.upgrades,p.guns);}
export function statsFor(p:Progress):ShipStats{
  const u=p.upgrades,weight=1+.035*u.lengthExtensions+.035*u.widthUpgrades+.06*(u.decks-1);
  return {maxHp:100+20*u.widthUpgrades+25*u.reinforcement,maxSpeed:22*(1+.12*u.sails)/weight,
    acceleration:.65*(1+.15*u.sails+.08*u.anchor)/weight,turnRate:.65*(1+.16*u.helm)/weight,
    braking:2.8*(1+.25*u.anchor),damage:25+6*u.cannonQuality,reload:2.8,muzzleSpeed:MUZZLE_SPEED};
}
export type UpgradeId=keyof Upgrades|'cannons';
type Upgrade={id:UpgradeId,label:string,description:string,appearance:string,basePrice:number,cap:number};
export const UPGRADES:readonly Upgrade[]=[
  {id:'lengthExtensions',label:'Hull length',description:'Adds one gun position per row. Slightly heavier handling.',appearance:'Longer hull and deck',basePrice:300,cap:SHIP_LIMITS.lengthExtensions},
  {id:'widthUpgrades',label:'Hull width',description:'+20 hull; supports another gun deck. Slightly heavier handling.',appearance:'Wider hull and deck',basePrice:300,cap:SHIP_LIMITS.widthUpgrades},
  {id:'decks',label:'Gun deck',description:'Adds an empty gun row on each side. Requires a wider hull.',appearance:'A supported deck with gunports',basePrice:500,cap:SHIP_LIMITS.decks},
  {id:'cannons',label:'Cannon pair',description:'Adds one port gun and one starboard gun. Requires a free slot on each side.',appearance:'Two new mounted cannons',basePrice:150,cap:SHIP_LIMITS.decks*SHIP_LIMITS.cannonsPerRow},
  {id:'cannonQuality',label:'Cannon quality',description:'+6 damage per cannonball.',appearance:'Heavier barrels and carriage bands',basePrice:250,cap:EQUIPMENT_CAP},
  {id:'sails',label:'Sails & rigging',description:'Improves top speed and acceleration.',appearance:'More canvas and reinforced yards',basePrice:200,cap:EQUIPMENT_CAP},
  {id:'helm',label:'Helm & rudder',description:'Improves turning response.',appearance:'Larger wheel and rudder',basePrice:150,cap:EQUIPMENT_CAP},
  {id:'anchor',label:'Anchor & capstan',description:'Stronger braking and quicker acceleration.',appearance:'Larger bow anchors and capstan',basePrice:150,cap:EQUIPMENT_CAP},
  {id:'reinforcement',label:'Hull reinforcement',description:'+25 maximum hull.',appearance:'Extra hull bands and strakes',basePrice:200,cap:EQUIPMENT_CAP},
];
export type Quote={price:number,reason:string,next:Progress|null};
// Side-specific transaction primitive. The current shop calls it with BOTH sides.
// Validation precedes payment, so a full side can never cause a half-purchase.
export function quoteCannons(p:Progress,sides:readonly (keyof Armament)[]=['port','starboard']):Quote{
  const unique=[...new Set(sides)],capacity=layoutFor(p).rowCapacity*p.upgrades.decks;
  const price=unique.reduce((sum,side)=>sum+75+25*Math.max(0,p.guns[side]-3),0);
  if(!unique.length)return {price:0,reason:'Choose a side',next:null};
  if(unique.some(side=>p.guns[side]>=capacity))return {price,reason:capacity===SHIP_LIMITS.decks*SHIP_LIMITS.cannonsPerRow?'All cannon positions filled':'Extend the hull or add a deck for more slots',next:null};
  if(p.wallet<price)return {price,reason:`Need ${price-p.wallet} more doubloons`,next:null};
  const next={...p,wallet:p.wallet-price,guns:{...p.guns}};for(const side of unique)next.guns[side]++;
  return {price,reason:'',next};
}
export function quoteUpgrade(p:Progress,id:UpgradeId):Quote{
  if(id==='cannons')return quoteCannons(p);
  const item=UPGRADES.find(u=>u.id===id);if(!item)return {price:0,reason:'Unknown upgrade',next:null};
  const level=p.upgrades[id],step=level-(id==='decks'?1:0),price=item.basePrice*(step+1);
  if(level>=item.cap)return {price,reason:'Fully upgraded',next:null};
  if(id==='decks'&&level>=p.upgrades.widthUpgrades+1)return {price,reason:'Upgrade hull width first',next:null};
  if(p.wallet<price)return {price,reason:`Need ${price-p.wallet} more doubloons`,next:null};
  return {price,reason:'',next:{...p,wallet:p.wallet-price,upgrades:{...p.upgrades,[id]:level+1},guns:{...p.guns}}};
}
