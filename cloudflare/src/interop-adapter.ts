/** I2: read-only capability/offer preflight for Contract 0.2.
 * Not connected to HTTP routes, legacy booking or D1. Never performs POST.
 */
import {createInteropClient,InteropError} from './interop.ts';
import type {Capabilities,CanonicalOffer,InteropEntity,OfferQuery} from './interop.ts';
import type {ProviderKind,ServiceItem,WorkerEnv} from './types.ts';
import {validateItem} from './core.ts';

type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Config=Pick<WorkerEnv,'HOTEL_API_URL'|'WISATA_API_URL'|'TRANSPORT_API_URL'|'HOTEL_PARTNER_TOKEN'|'WISATA_PARTNER_TOKEN'|'TRANSPORT_PARTNER_TOKEN'|'BOOKING_ENABLED'|'INTEROP_HOLDS'>;
const bindings={
 hotel:{url:'HOTEL_API_URL',token:'HOTEL_PARTNER_TOKEN',entity:'lodging'},
 wisata:{url:'WISATA_API_URL',token:'WISATA_PARTNER_TOKEN',entity:'tourist_attraction'},
 transport:{url:'TRANSPORT_API_URL',token:'TRANSPORT_PARTNER_TOKEN',entity:'vehicle_rental'}
} as const;
export type CapabilityReason='READY'|'FEATURE_DISABLED'|'MISSING_CONFIGURATION'|'MISSING_TOKEN'|'AUTH_FAILED'|'UNSUPPORTED_ENDPOINT'|'INVALID_CAPABILITIES'|'PROVIDER_UNAVAILABLE'|'HOLDS_UNSUPPORTED'|'DURABILITY_UNVERIFIED'|'ENTITY_UNSUPPORTED'|'INVALID_TTL';
export interface CapabilityResult {
 provider:ProviderKind; eligible:boolean; reason:CapabilityReason;
 capabilities?:Capabilities; httpStatus?:number;
}
export type ExecutionMode='CONTRACT_0_2'|'LEGACY'|'BLOCKED';
export type ModeReason='CAPABILITIES_READY'|'LEGACY_EXPLICIT'|'INVALID_ITEMS'|'MUTATION_ALREADY_STARTED'|'LEGACY_NOT_ALLOWED'|'LEGACY_NOT_CONFIGURED'|'FEATURE_DISABLED'|'DUPLICATE_PROVIDER'|'PROVIDER_NOT_READY';
export interface ModeDecision {
 mode:ExecutionMode; reason:ModeReason; bookingEnabled:boolean; capabilities:CapabilityResult[];
}
export interface PreflightRequest {
 items:readonly ServiceItem[];
 requestedMode:'CONTRACT_0_2'|'LEGACY';
 /** Only trusted orchestration may set this; persist mode/journal in I3. */
 mutationStarted?:boolean;
}
export interface ItemQuery {provider:ProviderKind;entityType:InteropEntity;query:OfferQuery}
export type OfferFailure='IDENTITY_UNVERIFIED'|'OFFER_NOT_FOUND'|'OFFER_UNAVAILABLE'|'SELECTION_UNVERIFIED'|'AMBIGUOUS_OFFER'|'OFFER_REQUEST_FAILED'|'INVALID_ITEMS';
export interface PreparedOffer {
 provider:ProviderKind;entityType:InteropEntity;resourceId:string;offerId:string;
 quantity:number;period:{startDate:string;endDate:string};totalPrice:number;currency:'IDR';generatedAt:string;
}
export type OfferResult={ok:true;offer:PreparedOffer}|{ok:false;reason:OfferFailure;httpStatus?:number};
export type PreparedCheckout={decision:ModeDecision;offers:OfferResult[];preflightComplete:boolean;bookingEnabled:boolean};
export interface AdapterPolicy {
 /** Server-owned explicit policy, default false. Existing legacy routes are unchanged. */
 allowLegacy?:boolean;
 /** Trusted, synchronous server-side mapping. NEVER supply this from client input.
  * Needed for hotel: master does not define whether lodging.resourceId is hotel or room.
  * For other providers the conservative candidate ID defaults to legacy destination/vehicle ID.
  */
 resolveResourceId?:(item:Readonly<ServiceItem>)=>string|undefined;
 /** Trusted verification of material choices (room + guest capacity, ticket tier, driver option).
  * Must use authoritative provider evidence, not display-only attributes or a user assertion.
  * No production verifier exists in I2; absent/false/throw always blocks.
  */
 verifySelection?:(item:Readonly<ServiceItem>,offer:Readonly<CanonicalOffer>)=>boolean;
 capabilitiesTimeoutMs?:number;
}
const validKind=(x:unknown):x is ProviderKind=>typeof x==='string'&&Object.hasOwn(bindings,x);
function configuredOrigin(value:unknown):boolean{
 try{if(typeof value!=='string')return false;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash}catch{return false}
}
function configuredToken(value:unknown):value is string{return typeof value==='string'&&value.length>=24&&/^[-A-Za-z0-9._~+/]+=*$/.test(value)}
function validId(value:unknown):value is string{return typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=512}
function validatedItem(input:ServiceItem):ServiceItem{
 validateItem(input);
 // Existing legacy validator accepts some coercions; this adapter never does.
 if(input.type==='hotel'){
  if(!validId(input.hotelId)||!validId(input.roomId)||!Number.isSafeInteger(input.guests)||input.guests<1||input.guests>20)throw Error('invalid item');
  return {type:'hotel',hotelId:input.hotelId,roomId:input.roomId,checkIn:input.checkIn,checkOut:input.checkOut,guests:input.guests};
 }
 if(input.type==='wisata'){
  if(!Number.isSafeInteger(input.destinationId)||input.destinationId<1||!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>20)throw Error('invalid item');
  return {type:'wisata',destinationId:input.destinationId,visitDate:input.visitDate,quantity:input.quantity,tier:input.tier};
 }
 if(!validId(input.vehicleId))throw Error('invalid item');
 return {type:'transport',vehicleId:input.vehicleId,startDate:input.startDate,endDate:input.endDate,withDriver:input.withDriver};
}
export function itemToOfferQuery(input:ServiceItem):ItemQuery{
 const item=validatedItem(input);
 if(item.type==='hotel')return {provider:'hotel',entityType:'lodging',query:{startDate:item.checkIn,endDate:item.checkOut,quantity:1,limit:20}};
 if(item.type==='wisata')return {provider:'wisata',entityType:'tourist_attraction',query:{startDate:item.visitDate,quantity:item.quantity,limit:20}};
 return {provider:'transport',entityType:'vehicle_rental',query:{startDate:item.startDate,endDate:item.endDate,quantity:1,limit:20}};
}
function snapshotItems(input:readonly ServiceItem[]):ServiceItem[]{
 if(!Array.isArray(input)||input.length===0||input.length>5)throw Error('invalid items');
 return input.map(validatedItem);
}
function failure(provider:ProviderKind,reason:CapabilityReason,capabilities?:Capabilities,httpStatus?:number):CapabilityResult{
 return {provider,eligible:false,reason,...(capabilities?{capabilities}:{}),...(httpStatus===undefined?{}:{httpStatus})};
}
export function createProviderAdapter(env:Config,fetcher:Fetcher,policy:AdapterPolicy={}){
 // Snapshot scalar configuration and trusted policy once; no runtime config mutation.
 const config={...env},opts={...policy};
 const enabled=config.INTEROP_HOLDS==='true',bookingEnabled=config.BOOKING_ENABLED==='true';
 const client=(kind:ProviderKind)=>createInteropClient({
  provider:kind,baseUrl:config[bindings[kind].url]!,token:config[bindings[kind].token]!,
  fetcher,capabilitiesTimeoutMs:opts.capabilitiesTimeoutMs
 });
 async function detect(kind:ProviderKind):Promise<CapabilityResult>{
  if(!validKind(kind))throw Error('Invalid provider kind');
  if(!enabled)return failure(kind,'FEATURE_DISABLED');
  if(!configuredOrigin(config[bindings[kind].url]))return failure(kind,'MISSING_CONFIGURATION');
  if(!configuredToken(config[bindings[kind].token]))return failure(kind,'MISSING_TOKEN');
  try{
   const cap=await client(kind).capabilities();
   if(!cap.holds)return failure(kind,'HOLDS_UNSUPPORTED',cap);
   if(!cap.durableStorage)return failure(kind,'DURABILITY_UNVERIFIED',cap);
   if(!cap.entityTypes.includes(bindings[kind].entity))return failure(kind,'ENTITY_UNSUPPORTED',cap);
   if(cap.holdTtlMinutes<=0)return failure(kind,'INVALID_TTL',cap);
   return {provider:kind,eligible:true,reason:'READY',capabilities:cap};
  }catch(e){
   if(e instanceof InteropError){
    const reason:CapabilityReason=e.status===401||e.status===403?'AUTH_FAILED':e.status===404||e.status===405||e.status===501?'UNSUPPORTED_ENDPOINT':e.code==='INVALID_PROVIDER_RESPONSE'?'INVALID_CAPABILITIES':'PROVIDER_UNAVAILABLE';
    return failure(kind,reason,undefined,e.status);
   }
   return failure(kind,'INVALID_CAPABILITIES');
  }
 }
 function legacyConfigured(kind:ProviderKind):boolean{
  // Legacy transport does not require a partner token; preserve legacy auth semantics.
  const token=config[bindings[kind].token];
  return configuredOrigin(config[bindings[kind].url])&&(kind==='transport'||(typeof token==='string'&&token.trim().length>0));
 }
 const decision=(mode:ExecutionMode,reason:ModeReason,capabilities:CapabilityResult[]=[]):ModeDecision=>({mode,reason,bookingEnabled,capabilities});
 async function chooseMode(request:PreflightRequest):Promise<ModeDecision>{
  // This is only a pre-mutation selector; recovery is a separate I3/I4 path.
  if(request?.mutationStarted!==undefined&&request.mutationStarted!==false)return decision('BLOCKED','MUTATION_ALREADY_STARTED');
  let items:ServiceItem[];
  try{items=snapshotItems(request?.items)}catch{return decision('BLOCKED','INVALID_ITEMS')}
  const required=[...new Set(items.map(x=>x.type))];
  if(request.requestedMode==='LEGACY'){
   if(opts.allowLegacy!==true)return decision('BLOCKED','LEGACY_NOT_ALLOWED');
   if(!required.every(legacyConfigured))return decision('BLOCKED','LEGACY_NOT_CONFIGURED');
   return decision('LEGACY','LEGACY_EXPLICIT'); // configuration only; not a health or availability claim
  }
  if(request.requestedMode!=='CONTRACT_0_2')return decision('BLOCKED','INVALID_ITEMS');
  if(!enabled)return decision('BLOCKED','FEATURE_DISABLED');
  // Shared externalRef can currently conflict per provider. No silent truncation or split.
  if(required.length!==items.length)return decision('BLOCKED','DUPLICATE_PROVIDER');
  const caps=await Promise.all(required.map(detect));
  return caps.every(c=>c.eligible)?decision('CONTRACT_0_2','CAPABILITIES_READY',caps):decision('BLOCKED','PROVIDER_NOT_READY',caps);
 }
 async function prepareOffer(item:ServiceItem):Promise<OfferResult>{
  const mapped=itemToOfferQuery(item),kind=mapped.provider;
  let resourceId:string|undefined;
  try{
   resourceId=opts.resolveResourceId?opts.resolveResourceId(Object.freeze({...item})):item.type==='wisata'?String(item.destinationId):item.type==='transport'?item.vehicleId:undefined;
  }catch{return {ok:false,reason:'IDENTITY_UNVERIFIED'}}
  if(!validId(resourceId))return {ok:false,reason:'IDENTITY_UNVERIFIED'};
  let response;
  try{response=await client(kind).offers(mapped.query)}catch(e){return {ok:false,reason:'OFFER_REQUEST_FAILED',...(e instanceof InteropError?{httpStatus:e.status}:{})}}
  const candidates=response.offers.filter(o=>o.resourceId===resourceId);
  if(!candidates.length)return {ok:false,reason:'OFFER_NOT_FOUND'};
  const available=candidates.filter(o=>o.available&&o.remaining>=mapped.query.quantity!);
  if(!available.length)return {ok:false,reason:'OFFER_UNAVAILABLE'};
  // Attributes are display-only; verification is an explicitly injected trusted dependency.
  // Freeze only the input item. Copy the result fields from the original validated offer,
  // not from a mapping returned by the verifier.
  if(!opts.verifySelection)return {ok:false,reason:'SELECTION_UNVERIFIED'};
  const verified:CanonicalOffer[]=[];
  for(const offer of available){
   try{
    const copy=structuredClone(offer);
    if(opts.verifySelection(Object.freeze({...item}),Object.freeze(copy))===true)verified.push(offer);
   }catch{return {ok:false,reason:'SELECTION_UNVERIFIED'}}
  }
  if(!verified.length)return {ok:false,reason:'SELECTION_UNVERIFIED'};
  if(verified.length!==1)return {ok:false,reason:'AMBIGUOUS_OFFER'};
  const o=verified[0];
  return {ok:true,offer:{provider:o.provider,entityType:o.entityType,resourceId:o.resourceId,offerId:o.offerId,
   quantity:mapped.query.quantity!,period:{...o.period},totalPrice:o.totalPrice,currency:o.currency,generatedAt:response.generatedAt}};
 }
 async function prepareCheckout(request:PreflightRequest):Promise<PreparedCheckout>{
  // Copy before any await; a mutable caller object cannot change choices mid-preflight.
  let items:ServiceItem[];
  try{items=snapshotItems(request?.items)}catch{return {decision:decision('BLOCKED','INVALID_ITEMS'),offers:[],preflightComplete:false,bookingEnabled}}
  const selected=await chooseMode({items,requestedMode:request.requestedMode,mutationStarted:request.mutationStarted});
  if(selected.mode!=='CONTRACT_0_2')return {decision:selected,offers:[],preflightComplete:false,bookingEnabled};
  const offers=await Promise.all(items.map(prepareOffer));
  // A successful preflight means offers are eligible, not that any hold/booking occurred.
  // The booking flag remains separate and I3/I4 must enforce it before mutation.
  return {decision:selected,offers,preflightComplete:offers.every(x=>x.ok),bookingEnabled};
 }
 return Object.freeze({detect,chooseMode,prepareCheckout});
}
