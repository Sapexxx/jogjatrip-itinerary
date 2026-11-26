/** I3 isolated D1 persistence. No provider calls, no production route wiring.
 * Caller owns the random checkout access token before sending the first request.
 * Durable intents precede mutations. A stale lock is never automatically stolen for execution.
 */
import type {D1Binding,ServiceItem,ProviderKind} from './types.ts';
import type {PreparedOffer} from './interop-adapter.ts';
import {itemToOfferQuery} from './interop-adapter.ts';
import type {HoldRequest,HoldCreated,HoldConfirmed,HoldReleased} from './interop.ts';
import {sha256,accessToken,hex,asDate,validTime} from './core.ts';

export type JournalOperation='HOLD'|'CONFIRM'|'RELEASE';
export type JournalState='IN_FLIGHT'|'SUCCEEDED'|'REJECTED'|'UNKNOWN';
type Purpose='EXECUTE'|'RECONCILE';
export type CheckoutIntent={
 customer:{name:string;phone:string;email?:string};consent:true;
 items:{item:ServiceItem;expectedTotal:number}[];
 source:{kind:'cart'|'plan'|'package';id?:string};
};
export interface CheckoutRecord {
 orderId:string;externalRef:string;mode:'CONTRACT_0_2';intent:CheckoutIntent;
 offers:PreparedOffer[];createdAt:string;
}
export interface LockProof {orderId:string;owner:string;fence:number;purpose:Purpose}
export interface JournalRecord {
 orderId:string;itemIndex:number;provider:ProviderKind;operation:JournalOperation;
 idempotencyKey:string;requestHash:string;holdId:string|null;state:JournalState;
 result:HoldCreated|HoldConfirmed|HoldReleased|null;errorCode:string|null;httpStatus:number|null;
 revision:number;createdAt:string;updatedAt:string;
}
export type Outcome={state:'SUCCEEDED';result:HoldCreated|HoldConfirmed|HoldReleased}
 |{state:'REJECTED'|'UNKNOWN';code:string;httpStatus?:number};
export class JournalError extends Error{
 readonly code:string;readonly status:number;
 constructor(code:string,status=409){super('Interop journal: '+code);this.name='JournalError';this.code=code;this.status=status}
}
function demand(v:unknown,code='INVALID_INPUT',status=400):asserts v{if(!v)throw new JournalError(code,status)}
const keyPattern=/^[A-Za-z0-9_-]{16,100}$/;
const accessPattern=/^[a-f0-9]{64}$/;
const orderPattern=/^JT-[a-f0-9]{32}$/;
const opNames=new Set(['HOLD','CONFIRM','RELEASE']);
const payment=new Set(['unpaid','paid','refunded','partially_refunded','expired','not_applicable']);
const errorCodes=new Set(['CONSENT_REQUIRED','IDEMPOTENCY_CONFLICT','NOT_AVAILABLE','INVALID_OFFER','HOLD_EXPIRED','HOLD_RELEASED','ALREADY_CONFIRMED','UNAUTHORIZED','INVALID_TOKEN','NOT_FOUND','VALIDATION_ERROR','INVALID_REQUEST','INVALID_IDEMPOTENCY_KEY','INVALID_EXTERNAL_REF','INVALID_HOLD','INVALID_CUSTOMER','INVALID_QUANTITY','BAD_JSON','IDEMPOTENCY_REQUIRED','UNSUPPORTED_MEDIA_TYPE','HOLD_NOT_ACTIVE','INTEROP_NOT_CONFIGURED','UPSTREAM_HTTP_ERROR','UPSTREAM_UNREACHABLE','UPSTREAM_TIMEOUT','INVALID_PROVIDER_RESPONSE']);
function text(v:unknown,max=512,empty=false):string{demand(typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0));return v as string}
function int(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number{demand(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);return v as number}
function utc(v:unknown):string{const s=text(v,40);demand(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(s)&&asDate(s.slice(0,10))&&Number.isFinite(Date.parse(s)));return s}
function canonical(v:unknown):string{
 if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 demand(typeof v==='object'&&v!==null);
 const o=v as Record<string,unknown>;
 return '{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+canonical(o[k])).join(',')+'}';
}
function normalizeItem(input:ServiceItem):ServiceItem{
 itemToOfferQuery(input); // strict date, quantity and ID validation from I2
 const it=input as ServiceItem&{plannedStartTime?:string;plannedEndTime?:string};
 const schedule=it.plannedStartTime!==undefined||it.plannedEndTime!==undefined?{plannedStartTime:text(it.plannedStartTime,5),plannedEndTime:text(it.plannedEndTime,5)}:{};
 demand(validTime(schedule.plannedStartTime,schedule.plannedEndTime));
 if(it.type==='hotel')return {type:'hotel',hotelId:it.hotelId,roomId:it.roomId,checkIn:it.checkIn,checkOut:it.checkOut,guests:it.guests,...schedule};
 if(it.type==='wisata')return {type:'wisata',destinationId:it.destinationId,visitDate:it.visitDate,quantity:it.quantity,tier:it.tier,...schedule};
 return {type:'transport',vehicleId:it.vehicleId,startDate:it.startDate,endDate:it.endDate,withDriver:it.withDriver,...schedule};
}
function normalizeIntent(input:CheckoutIntent):CheckoutIntent{
 demand(input&&input.consent===true,'CONSENT_REQUIRED');demand(input.customer&&input.source&&Array.isArray(input.items)&&input.items.length>=1&&input.items.length<=3);
 const customer={name:text(input.customer.name,200),phone:text(input.customer.phone,40),...(input.customer.email===undefined?{}:{email:text(input.customer.email,254)})};
 demand(['cart','plan','package'].includes(input.source.kind));
 const source={kind:input.source.kind,...(input.source.id===undefined?{}:{id:text(input.source.id,128)})};
 demand(source.kind==='cart'||'id' in source);
 const items=input.items.map(x=>({item:normalizeItem(x.item),expectedTotal:int(x.expectedTotal)}));
 demand(new Set(items.map(x=>x.item.type)).size===items.length,'DUPLICATE_PROVIDER',409);
 return {customer,consent:true,source,items};
}
function normalizeOffers(intent:CheckoutIntent,offers:readonly PreparedOffer[]|undefined):PreparedOffer[]{
 demand(Array.isArray(offers)&&offers.length===intent.items.length,'PREFLIGHT_REQUIRED',409);
 return offers.map((o,i)=>{
  const x=intent.items[i],m=itemToOfferQuery(x.item),period=o.period;
  demand(o.provider===m.provider&&o.entityType===m.entityType&&o.currency==='IDR'&&o.quantity===m.query.quantity&&period?.startDate===m.query.startDate&&period?.endDate===(m.query.endDate??m.query.startDate),'OFFER_MISMATCH',409);
  demand(o.totalPrice===x.expectedTotal,'PRICE_CHANGED',409);
  return {provider:o.provider,entityType:o.entityType,resourceId:text(o.resourceId),offerId:text(o.offerId,2048),quantity:int(o.quantity,1),period:{startDate:period.startDate,endDate:period.endDate},totalPrice:int(o.totalPrice),currency:'IDR',generatedAt:utc(o.generatedAt)};
 });
}
function rowCheckout(row:any):CheckoutRecord{return {orderId:row.order_id,externalRef:row.order_id,mode:row.execution_mode,intent:JSON.parse(row.intent_json),offers:JSON.parse(row.offers_json),createdAt:row.created_at}}
function rowOperation(row:any):JournalRecord{return {orderId:row.order_id,itemIndex:row.item_index,provider:row.provider,operation:row.operation,idempotencyKey:row.idempotency_key,requestHash:row.request_hash,holdId:row.hold_id,state:row.state,result:row.result_json?JSON.parse(row.result_json):null,errorCode:row.error_code,httpStatus:row.http_status,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}}
const changed=(r:{meta?:{changes?:number}})=>r.meta?.changes===1;
const unresolved="state IN ('IN_FLIGHT','UNKNOWN')";
/** Local clock injected in tests; production must use server time, never caller time. */
export function createInteropJournal(db:D1Binding,options:{now?:()=>number;leaseMs?:number}={}){
 const now=options.now??Date.now,leaseMs=options.leaseMs??60000;
 demand(Number.isSafeInteger(leaseMs)&&leaseMs>=1000&&leaseMs<=300000);
 const iso=()=>new Date(now()).toISOString();
 const read=async(id:string)=>db.prepare('SELECT * FROM jt_checkout_requests WHERE order_id=?').bind(id).first();
 const auth=async(id:string,token:string)=>{
  demand(orderPattern.test(id)&&typeof token==='string'&&accessPattern.test(token),'NOT_FOUND',404);
  const row=await read(id);demand(row&&row.access_hash===await sha256(token),'NOT_FOUND',404);return rowCheckout(row);
 };
 /** The client creates its own random 32-byte access token before first request. Store only hash.
  * Idempotency key is global and hashed; replay never leaks another customer's order or token.
  * Fingerprint excludes ephemeral offer IDs; a replay returns the original durable selection.
  * New checkout requires trusted I2 prepared offers; a replay need not call provider again.
  */
 async function reserveCheckout(key:string,token:string,intent:CheckoutIntent,offers?:readonly PreparedOffer[]):Promise<{created:boolean;checkout:CheckoutRecord}>{
  demand(typeof key==='string'&&keyPattern.test(key)&&typeof token==='string'&&accessPattern.test(token));
  const normalized=normalizeIntent(intent),keyHash=await sha256(key),accessHash=await sha256(token),requestHash=await sha256(canonical(normalized));
  const lookup=()=>db.prepare('SELECT * FROM jt_checkout_requests WHERE key_hash=?').bind(keyHash).first();
  const replay=(row:any)=>{demand(row.access_hash===accessHash,'CHECKOUT_KEY_CONFLICT',409);demand(row.request_hash===requestHash,'IDEMPOTENCY_CONFLICT',409);return {created:false,checkout:rowCheckout(row)}};
  const prior=await lookup();if(prior)return replay(prior);
  const prepared=normalizeOffers(normalized,offers),id='JT-'+hex(crypto.getRandomValues(new Uint8Array(16))),createdAt=iso();
  const result=await db.prepare('INSERT INTO jt_checkout_requests(order_id,key_hash,access_hash,request_hash,execution_mode,intent_json,offers_json,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(key_hash) DO NOTHING').bind(id,keyHash,accessHash,requestHash,'CONTRACT_0_2',canonical(normalized),canonical(prepared),createdAt).run();
  const row=await lookup();demand(row,'CHECKOUT_WRITE_UNVERIFIED',503);
  if(!changed(result))return replay(row);
  demand(row.order_id===id,'CHECKOUT_WRITE_UNVERIFIED',503);return {created:true,checkout:rowCheckout(row)};
 }
 /** Find an already-persisted checkout after a lost HTTP response. Never creates or retries a mutation. */
 async function lookupCheckoutByKey(key:string,token:string):Promise<CheckoutRecord>{
  demand(typeof key==='string'&&keyPattern.test(key)&&typeof token==='string'&&accessPattern.test(token),'NOT_FOUND',404);
  const row=await db.prepare('SELECT * FROM jt_checkout_requests WHERE key_hash=?').bind(await sha256(key)).first();
  demand(row&&row.access_hash===await sha256(token),'NOT_FOUND',404);
  return rowCheckout(row);
 }
 async function lockRow(id:string){return db.prepare('SELECT * FROM jt_order_locks WHERE order_id=?').bind(id).first()}
 async function claimLock(id:string,token:string):Promise<LockProof>{
  await auth(id,token);
  const owner=accessToken(),hash=await sha256(owner),expires=now()+leaseMs;
  // Never steal an expired owner. CAS via single SQL write, no read-then-write claim.
  await db.prepare('INSERT INTO jt_order_locks(order_id,owner_hash,fence,purpose,expires_ms) VALUES(?,?,1,?,?) ON CONFLICT(order_id) DO UPDATE SET owner_hash=excluded.owner_hash,fence=jt_order_locks.fence+1,purpose=excluded.purpose,expires_ms=excluded.expires_ms WHERE jt_order_locks.owner_hash IS NULL AND NOT EXISTS(SELECT 1 FROM jt_interop_operations WHERE order_id=excluded.order_id AND '+unresolved+')').bind(id,hash,'EXECUTE',expires).run();
  const row=await lockRow(id);demand(row&&row.owner_hash===hash,'ORDER_LOCKED',409);
  return {orderId:id,owner,fence:row.fence,purpose:'EXECUTE'};
 }
 async function proofHash(proof:LockProof){
  demand(proof&&orderPattern.test(proof.orderId)&&/^[a-f0-9]{48}$/.test(proof.owner)&&Number.isSafeInteger(proof.fence)&&proof.fence>0&&['EXECUTE','RECONCILE'].includes(proof.purpose),'LOCK_LOST',409);
  return sha256(proof.owner);
 }
 async function renewLock(proof:LockProof){
  const hash=await proofHash(proof),time=now();
  const r=await db.prepare('UPDATE jt_order_locks SET expires_ms=? WHERE order_id=? AND owner_hash=? AND fence=? AND purpose=? AND expires_ms>?').bind(time+leaseMs,proof.orderId,hash,proof.fence,proof.purpose,time).run();
  demand(changed(r),'LOCK_LOST',409);
 }
 /** Trusted operator only: must establish old executor cannot still issue provider calls.
  * The recovery lease cannot start new operations; it may only reconcile existing intents.
  * A local fence alone cannot fence a remote provider.
  */
 async function recoverExpiredLock(id:string,token:string,expectedFence:number,quiescenceConfirmed:boolean):Promise<LockProof>{
  await auth(id,token);demand(quiescenceConfirmed===true,'QUIESCENCE_REQUIRED',409);int(expectedFence,1);
  const owner=accessToken(),hash=await sha256(owner),time=now();
  const r=await db.prepare("UPDATE jt_order_locks SET owner_hash=?,fence=fence+1,purpose='RECONCILE',expires_ms=? WHERE order_id=? AND fence=? AND owner_hash IS NOT NULL AND expires_ms<=?").bind(hash,time+leaseMs,id,expectedFence,time).run();
  demand(changed(r),'RECOVERY_NOT_AVAILABLE',409);return {orderId:id,owner,fence:expectedFence+1,purpose:'RECONCILE'};
 }
 async function releaseLock(proof:LockProof){
  const hash=await proofHash(proof);
  const r=await db.prepare('UPDATE jt_order_locks SET owner_hash=NULL,purpose=NULL,expires_ms=NULL WHERE order_id=? AND owner_hash=? AND fence=? AND purpose=? AND expires_ms>? AND NOT EXISTS(SELECT 1 FROM jt_interop_operations WHERE order_id=? AND '+unresolved+')').bind(proof.orderId,hash,proof.fence,proof.purpose,now(),proof.orderId).run();
  demand(changed(r),'LOCK_LOST_OR_UNRESOLVED',409);
 }
 const readOp=(id:string,index:number,op:JournalOperation)=>db.prepare('SELECT * FROM jt_interop_operations WHERE order_id=? AND item_index=? AND operation=?').bind(id,index,op).first();
 const liveLock='EXISTS(SELECT 1 FROM jt_order_locks WHERE order_id=? AND owner_hash=? AND fence=? AND purpose=? AND expires_ms>?)';
 async function requireLock(proof:LockProof){
  const hash=await proofHash(proof),row=await lockRow(proof.orderId);
  demand(row&&row.owner_hash===hash&&row.fence===proof.fence&&row.purpose===proof.purpose&&row.expires_ms>now(),'LOCK_LOST',409);return hash;
 }
 async function operationRequest(proof:LockProof,index:number,operation:JournalOperation){
  await requireLock(proof);int(index);demand(opNames.has(operation));
  const row=await read(proof.orderId);demand(row,'NOT_FOUND',404);const c=rowCheckout(row),offer=c.offers[index];demand(offer,'INVALID_ITEM');
  const key='JT_'+await sha256(c.orderId+':'+index+':'+operation);
  let holdId:string|null=null,body:HoldRequest|undefined;
  if(operation==='HOLD')body={offerId:offer.offerId,quantity:offer.quantity,customer:c.intent.customer,externalRef:c.externalRef,consent:true};
  else{
   const h=await readOp(c.orderId,index,'HOLD');demand(h?.state==='SUCCEEDED'&&h.hold_id,'HOLD_NOT_RECORDED',409);holdId=h.hold_id;
  }
  return {provider:offer.provider,key,holdId,body,requestHash:await sha256(canonical({operation,holdId,body:body??null}))};
 }
 /** Call BEFORE any remote mutation. Only created=true may authorize a new send in I4.
  * Existing records, including IN_FLIGHT, never authorize retry; recover explicitly.
  */
 async function beginOperation(proof:LockProof,index:number,operation:JournalOperation):Promise<{created:boolean;operation:JournalRecord}>{
  const hash=await requireLock(proof);demand(proof.purpose==='EXECUTE','RECONCILE_ONLY',409);
  const req=await operationRequest(proof,index,operation),prior=await readOp(proof.orderId,index,operation);
  if(prior){demand(prior.request_hash===req.requestHash,'OPERATION_CONFLICT',409);return {created:false,operation:rowOperation(prior)}}
  // Prevent contradictory confirm/release for same item; I4 handles compensation of other items.
  // Confirm can start only when all holds have durable successes.
  const at=iso();
  const r=await db.prepare('INSERT INTO jt_interop_operations(order_id,item_index,provider,operation,idempotency_key,request_hash,hold_id,state,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?, ?,? WHERE '+liveLock+
   ' AND NOT EXISTS(SELECT 1 FROM jt_interop_operations WHERE order_id=? AND '+unresolved+')'+
   " AND (?='HOLD' OR EXISTS(SELECT 1 FROM jt_interop_operations WHERE order_id=? AND item_index=? AND operation='HOLD' AND state='SUCCEEDED'))"+
   " AND (?<>'CONFIRM' OR (SELECT COUNT(*) FROM jt_interop_operations WHERE order_id=? AND operation='HOLD' AND state='SUCCEEDED')=(SELECT json_array_length(offers_json) FROM jt_checkout_requests WHERE order_id=?))"+
   " AND (?<>'CONFIRM' OR NOT EXISTS(SELECT 1 FROM jt_interop_operations WHERE order_id=? AND operation='RELEASE'))"+
   " AND (?='HOLD' OR NOT EXISTS(SELECT 1 FROM jt_interop_operations WHERE order_id=? AND item_index=? AND operation IN ('CONFIRM','RELEASE') AND operation<>?))"+
   ' ON CONFLICT(order_id,item_index,operation) DO NOTHING').bind(proof.orderId,index,req.provider,operation,req.key,req.requestHash,req.holdId,'IN_FLIGHT',at,at,proof.orderId,hash,proof.fence,proof.purpose,now(),proof.orderId,operation,proof.orderId,index,operation,proof.orderId,proof.orderId,operation,proof.orderId,operation,proof.orderId,index,operation).run();
  const row=await readOp(proof.orderId,index,operation);
  demand(row&&row.request_hash===req.requestHash,'OPERATION_BLOCKED',409);return {created:changed(r),operation:rowOperation(row)};
 }
 /** Obtain exact original request for explicit I4 reconciliation/replay. Never sends HTTP. */
 async function getOperationRequest(proof:LockProof,index:number,operation:JournalOperation){
  const r=await operationRequest(proof,index,operation),row=await readOp(proof.orderId,index,operation);
  demand(row&&row.request_hash===r.requestHash&&row.idempotency_key===r.key,'OPERATION_NOT_RECORDED',409);
  return {operation:rowOperation(row),body:r.body,holdId:r.holdId,idempotencyKey:r.key};
 }
 function projectResult(op:JournalRecord,checkout:CheckoutRecord,input:any){
  demand(input&&typeof input==='object');
  const holdId=text(input.holdId);
  if(op.operation==='HOLD'){
   const offer=checkout.offers[op.itemIndex];
   demand(input.offerId===offer.offerId&&input.externalRef===checkout.externalRef&&input.reservationState==='awaiting_payment'&&input.currency==='IDR'&&payment.has(input.paymentState));
   // Preserve a changed price truthfully for I4 to compare and release; never hide a successful hold.
   return {holdId,offerId:offer.offerId,externalRef:checkout.externalRef,reservationState:'awaiting_payment',paymentState:input.paymentState,totalPrice:int(input.totalPrice),currency:'IDR',expiresAt:utc(input.expiresAt)};
  }
  demand(holdId===op.holdId);
  if(op.operation==='CONFIRM'){
   demand(input.reservationState==='reserved'&&payment.has(input.paymentState)&&input.voucher);
   return {holdId,reservationState:'reserved',paymentState:input.paymentState,voucher:{code:text(input.voucher.code),note:text(input.voucher.note,1024,true)}};
  }
  demand(input.reservationState==='cancelled');return {holdId,reservationState:'cancelled'};
 }
 /** Compare-and-swap outcome. Preserve unknown status when response cannot be verified.
  * Only server-trusted I1 responses or verified reconciliation evidence may be supplied.
  */
 async function recordOutcome(proof:LockProof,index:number,operation:JournalOperation,expectedRevision:number,outcome:Outcome):Promise<JournalRecord>{
  const hash=await requireLock(proof);int(expectedRevision);int(index);demand(opNames.has(operation));
  const raw=await readOp(proof.orderId,index,operation);demand(raw,'OPERATION_NOT_RECORDED',409);
  const op=rowOperation(raw);demand(op.revision===expectedRevision&&['IN_FLIGHT','UNKNOWN'].includes(op.state),'REVISION_CONFLICT',409);
  let resultJson:string|null=null,code:string|null=null,httpStatus:number|null=null,holdId=op.holdId;
  demand(outcome&&['SUCCEEDED','REJECTED','UNKNOWN'].includes(outcome.state));
  if(outcome.state==='SUCCEEDED'){
   const checkout=await read(proof.orderId);demand(checkout,'NOT_FOUND',404);
   const result=projectResult(op,rowCheckout(checkout),outcome.result);resultJson=canonical(result);holdId=result.holdId;
  }else{
   code=errorCodes.has(outcome.code)?outcome.code:'UPSTREAM_HTTP_ERROR';
   httpStatus=outcome.httpStatus===undefined?null:int(outcome.httpStatus,100,599);
   // Definitive rejection must be an explicit, known non-mutating contract response.
   if(outcome.state==='REJECTED')demand(httpStatus===401||(httpStatus===400&&['CONSENT_REQUIRED','VALIDATION_ERROR','INVALID_REQUEST','INVALID_IDEMPOTENCY_KEY','INVALID_EXTERNAL_REF','INVALID_HOLD','INVALID_CUSTOMER','INVALID_QUANTITY','BAD_JSON','IDEMPOTENCY_REQUIRED'].includes(code))||(httpStatus===409&&['NOT_AVAILABLE','HOLD_EXPIRED','HOLD_RELEASED','ALREADY_CONFIRMED','HOLD_NOT_ACTIVE'].includes(code))||(httpStatus===415&&code==='UNSUPPORTED_MEDIA_TYPE')||(httpStatus===503&&code==='INTEROP_NOT_CONFIGURED')||(httpStatus===422&&code==='INVALID_OFFER'),'AMBIGUOUS_OUTCOME',409);
  }
  const r=await db.prepare('UPDATE jt_interop_operations SET state=?,result_json=?,error_code=?,http_status=?,hold_id=?,revision=revision+1,updated_at=? WHERE order_id=? AND item_index=? AND operation=? AND revision=? AND '+unresolved+' AND '+liveLock).bind(outcome.state,resultJson,code,httpStatus,holdId,iso(),proof.orderId,index,operation,expectedRevision,proof.orderId,hash,proof.fence,proof.purpose,now()).run();
  demand(changed(r),'REVISION_OR_LOCK_CONFLICT',409);
  return rowOperation(await readOp(proof.orderId,index,operation));
 }
 async function readJournal(id:string,token:string){
  const checkout=await auth(id,token),operations:JournalRecord[]=[];
  for(let i=0;i<checkout.offers.length;i++)for(const op of ['HOLD','CONFIRM','RELEASE'] as const){const row=await readOp(id,i,op);if(row)operations.push(rowOperation(row))}
  return {checkout,operations};
 }
 return Object.freeze({reserveCheckout,lookupCheckoutByKey,loadCheckout:auth,claimLock,renewLock,recoverExpiredLock,releaseLock,beginOperation,getOperationRequest,recordOutcome,readJournal});
}
