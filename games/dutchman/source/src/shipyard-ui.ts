import {UPGRADES,quoteUpgrade,statsFor,layoutFor} from './progression.ts';
import type {Progress,UpgradeId} from './progression.ts';

const get=(id:string)=>document.getElementById(id)!;
export function statSummary(p:Progress){const s=statsFor(p),l=layoutFor(p);return `${s.maxHp} hull · ${(s.maxSpeed*1.94).toFixed(0)} knots · ${p.guns.port} port / ${p.guns.starboard} starboard · ${s.damage} damage · ${l.length} × ${l.width} hull`;}
function upgradeEffect(p:Progress,next:Progress,id:UpgradeId){
  const a=statsFor(p),b=statsFor(next),before=layoutFor(p),after=layoutFor(next);
  switch(id){
    case 'lengthExtensions':return `Length ${before.length} → ${after.length}; slots/side ${before.rowCapacity*p.upgrades.decks} → ${after.rowCapacity*next.upgrades.decks}`;
    case 'widthUpgrades':return `Width ${before.width} → ${after.width}; hull ${a.maxHp} → ${b.maxHp}`;
    case 'decks':return `Decks ${p.upgrades.decks} → ${next.upgrades.decks}; slots/side ${before.rowCapacity*p.upgrades.decks} → ${after.rowCapacity*next.upgrades.decks}`;
    case 'cannons':return `Port ${p.guns.port} → ${next.guns.port}; starboard ${p.guns.starboard} → ${next.guns.starboard}`;
    case 'cannonQuality':return `Damage ${a.damage} → ${b.damage} per shot`;
    case 'sails':return `Top speed ${(a.maxSpeed*1.94).toFixed(1)} → ${(b.maxSpeed*1.94).toFixed(1)} knots`;
    case 'helm':return `Turning ${(a.turnRate*180/Math.PI).toFixed(0)} → ${(b.turnRate*180/Math.PI).toFixed(0)}°/s`;
    case 'anchor':return `Braking ${(a.braking/2.8*100).toFixed(0)} → ${(b.braking/2.8*100).toFixed(0)}% of base`;
    case 'reinforcement':return `Maximum hull ${a.maxHp} → ${b.maxHp}`;
  }
}
export function renderShipStats(p:Progress,hp:number,voyage:number){
  const s=statsFor(p),l=layoutFor(p);
  get('ship-details').innerHTML=`<dl><dt>Hull</dt><dd>${Math.ceil(hp)} / ${s.maxHp}</dd><dt>Top speed</dt><dd>${Math.round(s.maxSpeed*1.94)} knots</dd><dt>Cannons · port / starboard</dt><dd>${p.guns.port} / ${p.guns.starboard}</dd><dt>Slots per side</dt><dd>${l.rowCapacity*p.upgrades.decks}</dd><dt>Damage / reload</dt><dd>${s.damage} / ${s.reload.toFixed(1)}s</dd><dt>Turning</dt><dd>${Math.round(s.turnRate*180/Math.PI)}°/s</dd><dt>Braking</dt><dd>${Math.round(s.braking/2.8*100)}% of base</dd><dt>Hull length × width</dt><dd>${l.length} × ${l.width}</dd><dt>Gun decks</dt><dd>${p.upgrades.decks}</dd><dt>This voyage</dt><dd>${voyage} doubloons earned</dd></dl>`;
}
export class ShipyardUI {
  readonly dialog=get('shipyard') as HTMLDialogElement;
  constructor(onBuy:(id:UpgradeId)=>void,onClose:()=>void){
    get('upgrade-list').addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-upgrade]');if(button&&!button.disabled)onBuy(button.dataset.upgrade as UpgradeId);});
    get('leave-port').onclick=onClose;
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();onClose();});
  }
  render(p:Progress){
    const focused=(document.activeElement as HTMLElement)?.dataset?.upgrade;
    get('port-wallet').textContent=`${p.wallet} doubloons`;
    get('port-summary').textContent=statSummary(p);
    get('upgrade-list').innerHTML=UPGRADES.map(item=>{
      const q=quoteUpgrade(p,item.id),preview=quoteUpgrade({...p,wallet:1_000_000_000},item.id).next,level=item.id==='cannons'?`${p.guns.port}P · ${p.guns.starboard}S`:`${p.upgrades[item.id]} / ${item.cap}`;
      return `<article class="upgrade-card"><div class="upgrade-title"><h3>${item.label}</h3><span>${level}</span></div><p>${item.description}</p><small>${item.appearance}</small>${preview?`<span class="upgrade-preview">${upgradeEffect(p,preview,item.id)}</span>`:''}<button data-upgrade="${item.id}" ${q.next?'':'disabled'}>Buy · ${q.price} doubloons</button><span class="upgrade-reason">${q.reason||'Ready to fit'}</span></article>`;
    }).join('');
    if(focused)get('upgrade-list').querySelector<HTMLButtonElement>(`[data-upgrade="${focused}"]:not(:disabled)`)?.focus();
  }
  open(p:Progress){this.render(p);this.dialog.showModal();get('leave-port').focus();}
  close(){this.dialog.close();}
}
