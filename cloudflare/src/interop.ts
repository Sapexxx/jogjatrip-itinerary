/** Contract 0.2.0 draft consumer. I1: isolated module, not wired into any Worker route.
 * Master: 01_KONTRAK_INTEROP_0.2.md sections 2–10; CRS 0.1.1.
 * A provider response is not proof of payment or atomic cross-provider reservation.
 */
import type { ProviderKind } from './types.ts';
import vocabulary from '../crs-vocabulary.json' with { type: 'json' };

export type InteropEntity = 'lodging' | 'tourist_attraction' | 'vehicle_rental';
export type HoldState = 'awaiting_payment' | 'reserved' | 'cancelled' | 'expired';
export type PaymentState = 'unpaid' | 'paid' | 'refunded' | 'partially_refunded' | 'expired' | 'not_applicable';
export type CustomerField='name'|'phone'|'email';
export interface Capabilities {
 contract: '0.2.0'; provider: ProviderKind; entityTypes: string[]; holds: boolean;
 holdTtlMinutes: number; durableStorage: boolean; location: 'point'|'region';
 requiredCustomerFields: CustomerField[]; optionalCustomerFields: CustomerField[]; maxQuantity:number;
 paymentSupported?:boolean; paymentMode?:'none'|'simulated';
}
export interface OfferQuery {
 startDate: string; endDate?: string; regionId?: string; lat?: number; lng?: number;
 radiusKm?: number; quantity?: number; limit?: number; withDriver?:boolean;
}
export interface CanonicalOffer {
 offerId: string; provider: ProviderKind; entityType: InteropEntity; resourceId: string;
 regionId: string|null; name: string; description: string; imageUrl: string|null;
 price: number; priceUnit: 'night'|'ticket'|'day'|'trip'|'person'; currency: 'IDR';
 period: {startDate: string; endDate: string}; totalPrice: number;
 available: boolean; remaining: number; location: {lat: number|null; lng: number|null}|null;
 attributes: Record<string,unknown>;
 expiresAt?:string; quantity?:number; priceType?:'SIMULATED'; simulation?:true;
}
export interface Offers {provider: ProviderKind; generatedAt: string; offers: CanonicalOffer[]}
export interface HoldRequest {
 offerId: string; quantity: number; customer: {name:string;phone:string;email?:string};
 externalRef: string; consent: true; notes?: string;
}
export interface HoldCreated {
 holdId: string; offerId: string; reservationState: 'awaiting_payment'; paymentState: PaymentState;
 totalPrice: number; currency: 'IDR'; expiresAt: string; externalRef: string;
}
export interface Voucher {code:string; note:string}
export interface HoldConfirmed {holdId:string; reservationState:'reserved'; paymentState:PaymentState; voucher:Voucher}
export interface HoldReleased {holdId:string; reservationState:'cancelled'}
export interface HoldSnapshot {
 holdId:string; reservationState:HoldState; paymentState?:PaymentState; voucher?:Voucher;
 expiresAt:string|null; externalRef:string; offerId:string; totalPrice:number; currency:'IDR';
}
type Fetcher = (url:string, init:RequestInit)=>Promise<Response>;
export interface InteropConfig {
 provider:ProviderKind; baseUrl:string; token:string; fetcher:Fetcher;
 timeoutMs?:number; capabilitiesTimeoutMs?:number;
}
export type Operation = 'capabilities'|'offers'|'hold'|'confirm'|'release'|'getHold';
const entityByProvider:Record<ProviderKind,InteropEntity>={hotel:'lodging',wisata:'tourist_attraction',transport:'vehicle_rental'};
const regions=new Set(vocabulary.regions.map(r=>r.conceptId));
const paymentStates=new Set<string>(vocabulary.statusMappings.paymentState.values);
const states=new Set<string>(['awaiting_payment','reserved','cancelled','expired']);
const priceUnits=new Set<string>(['night','ticket','day','trip','person']);
const stableCodes=new Set(['CONSENT_REQUIRED','IDEMPOTENCY_CONFLICT','NOT_AVAILABLE','INVALID_OFFER','HOLD_EXPIRED','HOLD_RELEASED','ALREADY_CONFIRMED','UNAUTHORIZED','INVALID_TOKEN','NOT_FOUND','VALIDATION_ERROR','INVALID_REQUEST','INVALID_IDEMPOTENCY_KEY','INVALID_EXTERNAL_REF','INVALID_HOLD','INVALID_CUSTOMER','INVALID_QUANTITY','BAD_JSON','IDEMPOTENCY_REQUIRED','UNSUPPORTED_MEDIA_TYPE','HOLD_NOT_ACTIVE','INTEROP_NOT_CONFIGURED']);
const idemPattern=/^[A-Za-z0-9_-]{16,100}$/;
const externalPattern=/^[A-Za-z0-9_-]{1,64}$/;
const maxBody=2_000_000;
const isMutation=(op:Operation)=>op==='hold'||op==='confirm'||op==='release';
export class InteropError extends Error {
 readonly operation:Operation; readonly provider:ProviderKind; readonly status:number;
 readonly code:string; readonly outcomeUnknown:boolean;
 constructor(provider:ProviderKind,operation:Operation,status:number,code:string,outcomeUnknown=false){
  super('Interop '+provider+' '+operation+': '+code+' (HTTP '+status+')');
  this.name='InteropError';this.provider=provider;this.operation=operation;this.status=status;this.code=code;this.outcomeUnknown=outcomeUnknown;
 }
}
function requireShape(condition:unknown): asserts condition {if(!condition)throw new Error('invalid contract shape')}
function record(x:unknown):Record<string,unknown>{requireShape(x!==null&&typeof x==='object'&&!Array.isArray(x));return x as Record<string,unknown>}
function str(x:unknown,empty=false):string{requireShape(typeof x==='string'&&(empty||x.trim().length>0));return x as string}
function bool(x:unknown):boolean{requireShape(typeof x==='boolean');return x as boolean}
function integer(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number{requireShape(typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max);return x as number}
function number(x:unknown,min:number,max:number):number{requireShape(typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max);return x as number}
function oneOf<T extends string>(x:unknown,values:Set<string>):T{const s=str(x);requireShape(values.has(s));return s as T}
function date(x:unknown):string{
 const s=str(x);requireShape(/^\d{4}-\d{2}-\d{2}$/.test(s));
 const t=Date.parse(s+'T00:00:00Z');requireShape(Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s);return s;
}
function utc(x:unknown):string{
 const s=str(x);requireShape(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(s));
 date(s.slice(0,10));requireShape(Number.isFinite(Date.parse(s)));return s;
}
function idr(x:unknown):'IDR'{requireShape(x==='IDR');return 'IDR'}
function external(x:unknown):string{const s=str(x);requireShape(externalPattern.test(s));return s}
function payment(x:unknown):PaymentState{return oneOf<PaymentState>(x,paymentStates)}
function voucher(x:unknown):Voucher{const o=record(x);return {code:str(o.code),note:str(o.note,true)}}
function validPeriod(entity:InteropEntity,start:string,end:string){
 const delta=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
 requireShape(entity==='lodging'?delta>0:entity==='vehicle_rental'?delta>=0&&delta<30:delta===0);
}
function queryParams(entity:InteropEntity,input:OfferQuery):URLSearchParams{
 const o=record(input),start=date(o.startDate);
 const p=new URLSearchParams({startDate:start});
 if(entity!=='tourist_attraction'){
  const end=date(o.endDate);validPeriod(entity,start,end);p.set('endDate',end);
 }else if(o.endDate!==undefined){date(o.endDate)} // contract: endDate ignored for attractions
 if(o.regionId!==undefined){const r=str(o.regionId);requireShape(regions.has(r));p.set('regionId',r)}
 if(o.lat!==undefined)p.set('lat',String(number(o.lat,-90,90)));
 if(o.lng!==undefined)p.set('lng',String(number(o.lng,-180,180)));
 if(o.radiusKm!==undefined)p.set('radiusKm',String(number(o.radiusKm,Number.MIN_VALUE,Number.MAX_VALUE)));
 if(o.withDriver!==undefined){requireShape(entity==='vehicle_rental');p.set('withDriver',String(bool(o.withDriver)))}
 p.set('quantity',String(o.quantity===undefined?1:integer(o.quantity,1)));
 p.set('limit',String(o.limit===undefined?20:integer(o.limit,1,20)));
 return p;
}
function parseCapabilities(x:unknown,provider:ProviderKind):Capabilities{
 const o=record(x);requireShape(o.contract==='0.2.0'&&o.provider===provider&&Array.isArray(o.entityTypes)&&o.entityTypes.length>0);
 const fields=new Set(['name','phone','email']);
 function customerFields(value:unknown,fallback:CustomerField[]):CustomerField[]{
  if(value===undefined)return fallback;
  requireShape(Array.isArray(value));
  return [...new Set(value.map(v=>oneOf<CustomerField>(v,fields)))];
 }
 return {contract:'0.2.0',provider,entityTypes:(o.entityTypes as unknown[]).map(v=>oneOf<InteropEntity>(v,new Set(Object.values(entityByProvider)))),holds:bool(o.holds),
 holdTtlMinutes:integer(o.holdTtlMinutes,1),durableStorage:bool(o.durableStorage),location:oneOf<'point'|'region'>(o.location,new Set(['point','region'])),
 requiredCustomerFields:customerFields(o.requiredCustomerFields,['name','phone']),optionalCustomerFields:customerFields(o.optionalCustomerFields,[]),
 maxQuantity:o.maxQuantity===undefined?1:integer(o.maxQuantity,1),
 ...(o.paymentSupported===undefined?{}:{paymentSupported:bool(o.paymentSupported)}),
 ...(o.paymentMode===undefined?{}:{paymentMode:oneOf<'none'|'simulated'>(o.paymentMode,new Set(['none','simulated']))})};
}
function parseOffers(x:unknown,provider:ProviderKind,query:URLSearchParams):Offers{
 const o=record(x),entity=entityByProvider[provider];
 requireShape(o.provider===provider&&Array.isArray(o.offers)&&o.offers.length<=Number(query.get('limit')));
 const offers=(o.offers as unknown[]).map((v):CanonicalOffer=>{
  const a=record(v);requireShape(a.provider===provider&&a.entityType===entity);
  const p=record(a.period),start=date(p.startDate),end=entity==='tourist_attraction'&&(p.endDate===null||p.endDate===undefined)?start:date(p.endDate);
  validPeriod(entity,start,end);requireShape(start===query.get('startDate')&&(entity==='tourist_attraction'||end===query.get('endDate')));
  const region=a.regionId===null?null:str(a.regionId);requireShape(region===null?entity==='vehicle_rental':regions.has(region));
  const image=a.imageUrl===null?null:str(a.imageUrl);if(image!==null){const u=new URL(image);requireShape(u.protocol==='https:'&&!u.username&&!u.password)}
  const loc=record(a.location);
  const location={lat:loc.lat===null?null:number(loc.lat,-90,90),lng:loc.lng===null?null:number(loc.lng,-180,180)};
  const available=bool(a.available),remaining=integer(a.remaining);
  requireShape(!available||remaining>=Number(query.get('quantity')));
  const offerId=str(a.offerId);requireShape(offerId.length<=400);
  if(a.quantity!==undefined)requireShape(integer(a.quantity,1)===Number(query.get('quantity')));
  if(a.priceType!==undefined)requireShape(a.priceType==='SIMULATED');
  if(a.simulation!==undefined)requireShape(a.simulation===true);
  return {offerId,provider,entityType:entity,resourceId:str(a.resourceId),regionId:region,
   name:str(a.name),description:str(a.description,true),imageUrl:image,price:integer(a.price),
   priceUnit:oneOf<CanonicalOffer['priceUnit']>(a.priceUnit,priceUnits),currency:idr(a.currency),
   period:{startDate:start,endDate:end},totalPrice:integer(a.totalPrice),available,remaining,location,attributes:record(a.attributes),
   ...(a.expiresAt===undefined?{}:{expiresAt:utc(a.expiresAt)}),...(a.quantity===undefined?{}:{quantity:integer(a.quantity,1)}),
   ...(a.priceType===undefined?{}:{priceType:'SIMULATED' as const}),...(a.simulation===undefined?{}:{simulation:true as const})};
 });
 requireShape(new Set(offers.map(a=>a.offerId)).size===offers.length);
 return {provider,generatedAt:utc(o.generatedAt),offers};
}
function holdIdentifier(x:unknown):string{const s=str(x);requireShape(/^[A-Za-z0-9_-]{1,100}$/.test(s));return s}
function holdBody(input:HoldRequest):HoldRequest{
 const o=record(input),c=record(o.customer);requireShape(o.consent===true);
 const customer:HoldRequest['customer']={name:str(c.name),phone:str(c.phone)};
 requireShape(customer.name.length>=2&&customer.name.length<=100&&/^[0-9+\- ]{9,20}$/.test(customer.phone));
 if(c.email!==undefined){customer.email=str(c.email);requireShape(customer.email.length<=120)}
 const offerId=str(o.offerId);requireShape(offerId.length<=400);
 const notes=o.notes===undefined?undefined:str(o.notes,true);requireShape(notes===undefined||notes.length<=500);
 return {offerId,quantity:integer(o.quantity===undefined?1:o.quantity,1),customer,externalRef:external(o.externalRef),consent:true,
 ...(notes===undefined?{}:{notes})};
}
function parseCreated(x:unknown,request:HoldRequest):HoldCreated{
 const o=record(x);requireShape(o.offerId===request.offerId&&o.externalRef===request.externalRef&&o.reservationState==='awaiting_payment');
 return {holdId:holdIdentifier(o.holdId),offerId:request.offerId,externalRef:request.externalRef,reservationState:'awaiting_payment',
 paymentState:payment(o.paymentState),totalPrice:integer(o.totalPrice),currency:idr(o.currency),expiresAt:utc(o.expiresAt)};
}
function matching(x:unknown,id:string):Record<string,unknown>{const o=record(x);requireShape(o.holdId===id);return o}
function parseConfirmed(x:unknown,id:string):HoldConfirmed{
 const o=matching(x,id);requireShape(o.reservationState==='reserved');
 return {holdId:id,reservationState:'reserved',paymentState:payment(o.paymentState),voucher:voucher(o.voucher)};
}
function parseReleased(x:unknown,id:string):HoldReleased{
 const o=matching(x,id);requireShape(o.reservationState==='cancelled');return {holdId:id,reservationState:'cancelled'};
}
function parseSnapshot(x:unknown,id:string):HoldSnapshot{
 const o=matching(x,id),state=oneOf<HoldState>(o.reservationState,states);
 const expiresAt=o.expiresAt===null?null:utc(o.expiresAt);
 requireShape(state!=='awaiting_payment'||expiresAt!==null);
 const result:HoldSnapshot={holdId:holdIdentifier(id),reservationState:state,paymentState:payment(o.paymentState),
  externalRef:external(o.externalRef),offerId:str(o.offerId),totalPrice:integer(o.totalPrice),currency:idr(o.currency),expiresAt};
 if(o.voucher!==undefined)result.voucher=voucher(o.voucher);
 requireShape(state!=='reserved'||result.voucher!==undefined);
 return result;
}
async function boundedJson(response:Response):Promise<unknown>{
 const size=response.headers.get('content-length');if(size!==null&&Number(size)>maxBody)throw Error('oversize');
 if(!response.body)throw Error('missing body');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,body='';
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBody){void reader.cancel().catch(()=>{});throw Error('oversize')}body+=decoder.decode(value,{stream:true})}
  body+=decoder.decode();return JSON.parse(body);
 }finally{reader.releaseLock()}
}
function errorCode(x:unknown):string{
 try{const o=record(x);const candidate=typeof o.code==='string'?o.code:record(o.error).code;
 return typeof candidate==='string'&&stableCodes.has(candidate)?candidate:'UPSTREAM_HTTP_ERROR'}catch{return 'UPSTREAM_HTTP_ERROR'}
}
/** Explicit fetch injection is required: I1 tests use fixture HTTP only. No retry or legacy fallback here. */
export function createInteropClient(config:InteropConfig){
 const provider=config.provider,token=config.token,fetcher=config.fetcher;
 if(!Object.hasOwn(entityByProvider,provider))throw Error('Invalid provider configuration');
 let origin:string;try{const u=new URL(config.baseUrl);requireShape(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash);origin=u.origin}catch{throw Error('Invalid HTTPS provider origin')}
 const timeout=config.timeoutMs??12000,capTimeout=config.capabilitiesTimeoutMs??3000;
 if(typeof fetcher!=='function'||!Number.isSafeInteger(timeout)||timeout<1||timeout>60000||!Number.isSafeInteger(capTimeout)||capTimeout<1||capTimeout>60000)throw Error('Invalid client configuration');
 function local<T>(op:Operation,fn:()=>T):T{try{return fn()}catch{throw new InteropError(provider,op,400,'INVALID_REQUEST')}}
 async function call<T>(op:Operation,path:string,method:'GET'|'POST',allowed:number[],parse:(x:unknown)=>T,body?:HoldRequest,key?:string):Promise<T>{
  if(typeof token!=='string'||token.length<24||!/^[-A-Za-z0-9._~+/]+=*$/.test(token))throw new InteropError(provider,op,401,'UNAUTHORIZED');
  const mut=isMutation(op),headers:Record<string,string>={Accept:'application/json',Authorization:'Bearer '+token};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(key!==undefined)headers['Idempotency-Key']=key;
  const ctrl=new AbortController();
  let timer:ReturnType<typeof setTimeout>;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{ctrl.abort();reject(new InteropError(provider,op,504,'UPSTREAM_TIMEOUT',mut))},op==='capabilities'?capTimeout:timeout)});
  const work=async()=>{
   let response:Response;
   try{response=await fetcher(origin+'/api/v1/interop'+path,{method,headers,redirect:'error',signal:ctrl.signal,...(body===undefined?{}:{body:JSON.stringify(body)})})}
   catch{throw new InteropError(provider,op,ctrl.signal.aborted?504:502,ctrl.signal.aborted?'UPSTREAM_TIMEOUT':'UPSTREAM_UNREACHABLE',mut)}
   if(!response.ok){
    let code='UPSTREAM_HTTP_ERROR';try{code=errorCode(await boundedJson(response))}catch{}
    // An unknown/malformed rejection or conflicting existing key needs reconciliation.
    const definite=response.status===401||(response.status===400&&['CONSENT_REQUIRED','VALIDATION_ERROR','INVALID_REQUEST','INVALID_IDEMPOTENCY_KEY','INVALID_EXTERNAL_REF','INVALID_HOLD','INVALID_CUSTOMER','INVALID_QUANTITY','BAD_JSON','IDEMPOTENCY_REQUIRED'].includes(code))||(response.status===409&&['NOT_AVAILABLE','HOLD_EXPIRED','HOLD_RELEASED','ALREADY_CONFIRMED','HOLD_NOT_ACTIVE'].includes(code))||(response.status===415&&code==='UNSUPPORTED_MEDIA_TYPE')||(response.status===503&&code==='INTEROP_NOT_CONFIGURED')||(response.status===422&&code==='INVALID_OFFER');
    throw new InteropError(provider,op,response.status,code,mut&&!definite);
   }
   try{requireShape(allowed.includes(response.status));return parse(await boundedJson(response))}
   catch{throw new InteropError(provider,op,502,'INVALID_PROVIDER_RESPONSE',mut)}
  };
  try{return await Promise.race([work(),deadline])}finally{clearTimeout(timer!);ctrl.abort()}
 }
 function pathFor(op:Operation,id:string,suffix=''){return local(op,()=>{const s=holdIdentifier(id);return '/holds/'+encodeURIComponent(s)+suffix})}
 function optionalKey(op:Operation,key?:string){if(key!==undefined)local(op,()=>requireShape(typeof key==='string'&&idemPattern.test(key)));return key}
 return Object.freeze({
  capabilities:()=>call('capabilities','/capabilities','GET',[200],x=>parseCapabilities(x,provider)),
  offers:(input:OfferQuery)=>{const params=local('offers',()=>queryParams(entityByProvider[provider],input));return call('offers','/offers?'+params.toString(),'GET',[200],x=>parseOffers(x,provider,params))},
  hold:(input:HoldRequest,key:string)=>{if(input?.consent!==true)throw new InteropError(provider,'hold',400,'CONSENT_REQUIRED');
   const body=local('hold',()=>holdBody(input));local('hold',()=>requireShape(typeof key==='string'&&idemPattern.test(key)));
   return call('hold','/holds','POST',[201,200],x=>parseCreated(x,body),body,key)},
  confirm:(id:string,key?:string)=>call('confirm',pathFor('confirm',id,'/confirm'),'POST',[200],x=>parseConfirmed(x,id),undefined,optionalKey('confirm',key)),
  release:(id:string,key?:string)=>call('release',pathFor('release',id,'/release'),'POST',[200],x=>parseReleased(x,id),undefined,optionalKey('release',key)),
  getHold:(id:string)=>call('getHold',pathFor('getHold',id),'GET',[200],x=>parseSnapshot(x,id))
 });
}
