/** Server-owned material selection policy. Independent provider availability
 * response + canonical offer, not display attributes or browser proof.
 * Reviewed provider implementations bind their signed offer to resource, dates
 * and quantity/options. Never decode or manufacture the opaque offer ID.
 * Do not wire into public checkout until reviewed in the staging gate.
 */
import type {AdapterPolicy} from './interop-adapter.ts';
import type {WorkerEnv,ServiceItem} from './types.ts';
import type {CanonicalOffer} from './interop.ts';
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
const bindings={hotel:['HOTEL_API_URL','HOTEL_PARTNER_TOKEN'],wisata:['WISATA_API_URL','WISATA_PARTNER_TOKEN'],transport:['TRANSPORT_API_URL','TRANSPORT_PARTNER_TOKEN']} as const;
const safeId=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(s);
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const object=(x:unknown):Record<string,unknown>|null=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:null;
function identity(item:Readonly<ServiceItem>):string|undefined{
 if(item.type==='hotel')return safeId(item.hotelId)&&safeId(item.roomId)?item.roomId:undefined;
 if(item.type==='wisata')return integer(item.destinationId,1)&&item.tier==='base'?String(item.destinationId):undefined;
 return safeId(item.vehicleId)&&typeof item.withDriver==='boolean'?item.vehicleId:undefined;
}
export function createMaterialSelectionPolicy(env:WorkerEnv,fetcher:Fetcher):AdapterPolicy{
 const config={...env};
 async function get(kind:ServiceItem['type'],path:string,params:Record<string,string>):Promise<Record<string,unknown>|null>{
  const [urlKey,tokenKey]=bindings[kind],base=config[urlKey],token=config[tokenKey];
  if(typeof base!=='string'||typeof token!=='string'||token.length<24||!/^[-A-Za-z0-9._~+/]+=*$/.test(token))return null;
  const origin=new URL(base);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)return null;
  const u=new URL(path,origin);if(u.origin!==origin.origin)return null;
  u.search=new URLSearchParams(params).toString();
  const ctrl=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const work=async()=>{
    const r=await fetcher(u.toString(),{method:'GET',redirect:'error',cache:'no-store',headers:{Accept:'application/json',Authorization:'Bearer '+token},signal:ctrl.signal});
    if(!r.ok||!r.body||Number(r.headers.get('content-length')||0)>2000000)return null;
    const reader=r.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,body='';
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){void reader.cancel().catch(()=>{});return null}body+=decoder.decode(value,{stream:true})}body+=decoder.decode();return object(JSON.parse(body))}
    finally{reader.releaseLock()}
   };
   const deadline=new Promise<null>(resolve=>{timer=setTimeout(()=>{ctrl.abort();resolve(null)},5000)});
   return await Promise.race([work(),deadline]);
  }catch{return null}finally{if(timer!==undefined)clearTimeout(timer);ctrl.abort()}
 }
 return Object.freeze({
  resolveResourceId:identity,
  async verifySelection(item:Readonly<ServiceItem>,offer:Readonly<CanonicalOffer>):Promise<boolean>{
   try{
    const id=identity(item);
    if(!id||offer.provider!==item.type||offer.resourceId!==id||!offer.available||offer.currency!=='IDR'||!integer(offer.totalPrice))return false;
    if(item.type==='hotel'){
     if(offer.entityType!=='lodging'||offer.period.startDate!==item.checkIn||offer.period.endDate!==item.checkOut||!integer(item.guests,1)||offer.remaining<1)return false;
     const d=await get('hotel','/api/v1/hotels/'+encodeURIComponent(item.hotelId)+'/availability',{checkIn:item.checkIn,checkOut:item.checkOut});
     if(!d||!Array.isArray(d.rooms))return false;
     if(d.hotelId!==undefined&&d.hotelId!==item.hotelId||d.checkIn!==undefined&&d.checkIn!==item.checkIn||d.checkOut!==undefined&&d.checkOut!==item.checkOut)return false;
     const matches=d.rooms.map(object).filter(r=>r?.roomId===id);
     const r=matches[0];return matches.length===1&&!!r&&integer(r.capacity,item.guests)&&integer(r.unitsAvailable,1)&&r.totalPrice===offer.totalPrice;
    }
    if(item.type==='wisata'){
     if(offer.entityType!=='tourist_attraction'||offer.period.startDate!==item.visitDate||offer.period.endDate!==item.visitDate||!integer(item.quantity,1)||offer.remaining<item.quantity)return false;
     const d=await get('wisata','/api/v1/destinations/'+encodeURIComponent(id)+'/availability',{date:item.visitDate,qty:String(item.quantity),tier:'base'});
     return !!d&&d.destination_id===item.destinationId&&d.date===item.visitDate&&d.qty===item.quantity&&d.available===true&&integer(d.remaining,item.quantity)&&d.currency==='IDR'&&d.total===offer.totalPrice;
    }
    if(offer.entityType!=='vehicle_rental'||offer.period.startDate!==item.startDate||offer.period.endDate!==item.endDate||offer.remaining<1)return false;
    const d=await get('transport','/api/v1/rentals/vehicles',{startDate:item.startDate,endDate:item.endDate,withDriver:String(item.withDriver),type:'all',category:'all'});
    if(!d||d.startDate!==item.startDate||d.endDate!==item.endDate||!Array.isArray(d.vehicles))return false;
    if(d.withDriver!==undefined&&d.withDriver!==item.withDriver)return false;
    const matches=d.vehicles.map(object).filter(r=>r?.id===id);
    const r=matches[0];
    return matches.length===1&&!!r&&r.available===true&&integer(r.unitsAvailable,1)&&r.totalPrice===offer.totalPrice&&(r.withDriver===undefined||r.withDriver===item.withDriver);
   }catch{return false}
  }
 });
}
