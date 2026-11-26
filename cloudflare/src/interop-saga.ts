/** I4 — isolated, conservative hold-based saga for Contract 0.2.
 * No HTTP routes, secrets, real providers or production wiring.
 * Journal writes precede remote mutations. No blind retries, payment inference or
 * cross-provider atomicity claims. UNKNOWN requires explicit reconciliation.
 */
import {InteropError,createInteropClient} from './interop.ts';
import type {HoldCreated} from './interop.ts';
import {createInteropJournal} from './interop-journal.ts';
import type {ProviderKind} from './types.ts';

type Journal=ReturnType<typeof createInteropJournal>;
type Client=Pick<ReturnType<typeof createInteropClient>,'hold'|'confirm'|'release'|'getHold'>;
type Clients=Partial<Record<ProviderKind,Client>>;
type Step='HOLD'|'CONFIRM'|'RELEASE';
export type SagaStatus='AWAITING_CONFIRMATION'|'CONFIRMED'|'COMPENSATED'|'PARTIAL'|'UNKNOWN'|'BLOCKED';
export interface SagaResult {
 orderId:string;status:SagaStatus;reason:string;completed:number;total:number;
}
/** Client I1 classifies documented HTTP-status/code pairs; never reclassify
 * unknown remote mutations or idempotency conflicts in the saga. */
function verifiedReject(e:unknown):e is InteropError {
 return e instanceof InteropError&&!e.outcomeUnknown;
}

function codeOf(e:unknown){return e instanceof InteropError?e.code:'UPSTREAM_HTTP_ERROR'}
function httpOf(e:unknown){return e instanceof InteropError?e.status:502}
export function createHoldSaga(journal:Journal,clients:Clients,options:{now?:()=>number;minTtlMs?:number;authorizeRecovery?:(orderId:string)=>boolean|Promise<boolean>;authorizeHold?:(orderId:string)=>boolean|Promise<boolean>;authorizeConfirm?:(orderId:string)=>boolean|Promise<boolean>}={}){
 const now=options.now??Date.now,minimum=options.minTtlMs??120000;
 if(!Number.isSafeInteger(minimum)||minimum<0||minimum>900000)throw Error('Invalid minimum hold TTL');
 const client=(provider:ProviderKind):Client=>{
  const c=clients[provider];if(!c)throw Error('Missing trusted provider client '+provider);
  return c;
 };
 const result=(orderId:string,status:SagaStatus,reason:string,completed:number,total:number):SagaResult=>({orderId,status,reason,completed,total});
 const expiryOk=(hold:HoldCreated)=>Number.isFinite(Date.parse(hold.expiresAt))&&Date.parse(hold.expiresAt)>now()+minimum;
 async function releaseSaved(proof:Awaited<ReturnType<Journal['claimLock']>>,holds:{index:number;provider:ProviderKind;holdId:string}[]){
  for(const h of [...holds].reverse()){
   const started=await journal.beginOperation(proof,h.index,'RELEASE');
   // A previously persisted operation never authorizes a second POST.
   if(!started.created)return false;
   try{
    const released=await client(h.provider).release(h.holdId,started.operation.idempotencyKey);
    await journal.recordOutcome(proof,h.index,'RELEASE',started.operation.revision,{state:'SUCCEEDED',result:released});
   }catch(e){
    // Even a 409 can reflect an already-mutated state. Never blindly retry a RELEASE.
    await journal.recordOutcome(proof,h.index,'RELEASE',started.operation.revision,{state:'UNKNOWN',code:codeOf(e),httpStatus:httpOf(e)});
    return false;
   }
  }
  return true;
 }
 async function hold(orderId:string,token:string):Promise<SagaResult>{
  // Only trusted orchestration may open remote provider holds.
  if(!options.authorizeHold||await options.authorizeHold(orderId)!==true)
   throw Error('HOLD_POLICY_REQUIRED');
  const proof=await journal.claimLock(orderId,token);
  let total=0,done=0;
  try{
   const checkout=await journal.loadCheckout(orderId,token);
   total=checkout.offers.length;
   // Resolve all trusted clients before creating any intent or external mutation.
   checkout.offers.forEach(o=>client(o.provider));
   const held:{index:number;provider:ProviderKind;holdId:string}[]=[];
   for(let i=0;i<total;i++){
    const o=checkout.offers[i],started=await journal.beginOperation(proof,i,'HOLD');
    if(!started.created)return result(orderId,'BLOCKED','OPERATION_ALREADY_EXISTS',done,total);
    const request=await journal.getOperationRequest(proof,i,'HOLD');
    if(!request.body)throw Error('Missing immutable hold body');
    let remote:HoldCreated;
    try{remote=await client(o.provider).hold(request.body,request.idempotencyKey)}
    catch(e){
     const definitive=verifiedReject(e);
     await journal.recordOutcome(proof,i,'HOLD',started.operation.revision,{state:definitive?'REJECTED':'UNKNOWN',code:codeOf(e),httpStatus:httpOf(e)});
     if(!definitive)return result(orderId,'UNKNOWN','HOLD_RESULT_UNCERTAIN',done,total);
     const compensated=await releaseSaved(proof,held);
     return result(orderId,compensated?'COMPENSATED':'UNKNOWN',compensated?'HOLD_REJECTED_AND_COMPENSATED':'COMPENSATION_UNCERTAIN',done,total);
    }
    // Persist the provider truth before checking price/TTL, so compensation can
    // release a successful but unusable hold instead of hiding it.
    await journal.recordOutcome(proof,i,'HOLD',started.operation.revision,{state:'SUCCEEDED',result:remote});
    done++;held.push({index:i,provider:o.provider,holdId:remote.holdId});
    if(remote.totalPrice!==o.totalPrice||!expiryOk(remote)){
     const compensated=await releaseSaved(proof,held);
     return result(orderId,compensated?'COMPENSATED':'UNKNOWN',compensated?'PRICE_OR_TTL_UNACCEPTABLE':'COMPENSATION_UNCERTAIN',done,total);
    }
   }
   return result(orderId,'AWAITING_CONFIRMATION','ALL_HOLDS_RECORDED_NO_PAYMENT_ASSUMED',done,total);
  }finally{
   // UNKNOWN/IN_FLIGHT deliberately prevent unlock in I3. Do not mask original results.
   try{await journal.releaseLock(proof)}catch{}
  }
 }
 async function confirm(orderId:string,token:string):Promise<SagaResult>{
  // Confirmation requires explicit server policy, not a browser assertion or
  // an inference that a successful HOLD means customer payment.
  if(!options.authorizeConfirm||await options.authorizeConfirm(orderId)!==true)
   throw Error('CONFIRM_POLICY_REQUIRED');
  const proof=await journal.claimLock(orderId,token);
  let total=0,done=0;
  try{
   const view=await journal.readJournal(orderId,token);
   total=view.checkout.offers.length;
   view.checkout.offers.forEach(o=>client(o.provider));
   // Strict all-holds and no-compensation gate before the first CONFIRM.
   if(view.operations.some(o=>o.operation==='RELEASE'||o.state==='UNKNOWN'||o.state==='IN_FLIGHT'))
    return result(orderId,'BLOCKED','UNRESOLVED_OR_COMPENSATING',0,total);
   for(let i=0;i<total;i++){
    const h=view.operations.find(o=>o.itemIndex===i&&o.operation==='HOLD');
    const offer=view.checkout.offers[i];
    if(h?.state!=='SUCCEEDED'||!h.holdId||!h.result||!('expiresAt' in h.result)||
       !('totalPrice' in h.result)||h.result.totalPrice!==offer.totalPrice||
       Date.parse(h.result.expiresAt)<=now()+minimum)
      return result(orderId,'BLOCKED','HOLD_MISSING_PRICE_CHANGED_OR_TTL_UNSAFE',0,total);
   }
   for(let i=0;i<total;i++){
    const offer=view.checkout.offers[i],started=await journal.beginOperation(proof,i,'CONFIRM');
    if(!started.created)return result(orderId,'BLOCKED','CONFIRM_ALREADY_EXISTS',done,total);
    const request=await journal.getOperationRequest(proof,i,'CONFIRM');
    if(!request.holdId)throw Error('Missing hold ID');
    try{
     const confirmed=await client(offer.provider).confirm(request.holdId,request.idempotencyKey);
     await journal.recordOutcome(proof,i,'CONFIRM',started.operation.revision,{state:'SUCCEEDED',result:confirmed});
     done++;
    }catch(e){
     const definitive=verifiedReject(e);
     await journal.recordOutcome(proof,i,'CONFIRM',started.operation.revision,{state:definitive?'REJECTED':'UNKNOWN',code:codeOf(e),httpStatus:httpOf(e)});
     return result(orderId,definitive?'PARTIAL':'UNKNOWN',definitive?'CONFIRM_REJECTED_MANUAL_REVIEW':'CONFIRM_UNCERTAIN_RECONCILE',done,total);
    }
   }
   return result(orderId,'CONFIRMED','ALL_PROVIDER_CONFIRMATIONS_RECORDED_PAYMENT_NOT_INFERRED',done,total);
  }finally{try{await journal.releaseLock(proof)}catch{}}
 }
 /** Recovery is operator-only. Requires positive, externally established quiescence.
  * No replay of HOLD (no known hold ID), no remote mutation and no automatic takeover.
  */
 async function reconcile(orderId:string,token:string,expectedFence:number,quiescenceConfirmed:boolean):Promise<SagaResult>{
  // Caller-controlled booleans do not grant operator access. A trusted server
  // authorization callback must be injected before recovering a fenced lock.
  if(!options.authorizeRecovery||await options.authorizeRecovery(orderId)!==true)
   throw Error('OPERATOR_AUTH_REQUIRED');
  const proof=await journal.recoverExpiredLock(orderId,token,expectedFence,quiescenceConfirmed);
  let total=0,done=0;
  try{
   const view=await journal.readJournal(orderId,token);
   total=view.checkout.offers.length;
   const pending=view.operations.filter(o=>o.state==='IN_FLIGHT'||o.state==='UNKNOWN');
   if(!pending.length)return result(orderId,'BLOCKED','NO_UNRESOLVED_OPERATION',0,total);
   for(const op of pending){
    // No known hold id means the remote mutation cannot be safely queried.
    if(!op.holdId)return result(orderId,'UNKNOWN','HOLD_ID_UNKNOWN_MANUAL_PROVIDER_RECONCILIATION',done,total);
    const request=await journal.getOperationRequest(proof,op.itemIndex,op.operation);
    try{
     const snapshot=await client(op.provider).getHold(op.holdId);
     if(snapshot.holdId!==op.holdId)continue;
     if(op.operation==='CONFIRM'&&snapshot.reservationState==='reserved'&&snapshot.voucher){
      await journal.recordOutcome(proof,op.itemIndex,'CONFIRM',request.operation.revision,
       {state:'SUCCEEDED',result:{holdId:op.holdId,reservationState:'reserved',paymentState:snapshot.paymentState??'unpaid',voucher:snapshot.voucher}});
      done++;
     }else if(op.operation==='RELEASE'&&snapshot.reservationState==='cancelled'){
      await journal.recordOutcome(proof,op.itemIndex,'RELEASE',request.operation.revision,
       {state:'SUCCEEDED',result:{holdId:op.holdId,reservationState:'cancelled'}});
      done++;
     }
    }catch{
     // Preserve UNKNOWN; a failed GET is not proof of remote failure.
    }
   }
   return result(orderId,done===pending.length?'PARTIAL':'UNKNOWN',done===pending.length?'RECONCILED_VERIFY_FINAL_ORDER':'RECONCILIATION_INCOMPLETE',done,total);
  }finally{try{await journal.releaseLock(proof)}catch{}}
 }
 return Object.freeze({hold,confirm,reconcile});
}
