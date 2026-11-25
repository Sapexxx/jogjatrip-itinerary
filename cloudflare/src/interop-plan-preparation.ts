/** I5 trusted PLAN-only checkout preparation. No provider mutations or payments.
 * Only server-owned saved plan selection may be snapshotted. Provider identity and
 * material options require injected authoritative verifier; default Worker has none
 * and MUST fail closed. Claim the legacy plan mutex before capability/offer preflight.
 */
import {authorizedPlan,claimPlan,releasePlan} from './db.ts';
import {bookable} from './plans.ts';
import {createProviderAdapter} from './interop-adapter.ts';
import type {AdapterPolicy,PreparedOffer} from './interop-adapter.ts';
import {createInteropJournal,JournalError} from './interop-journal.ts';
import type {CheckoutIntent} from './interop-journal.ts';
import {accessToken as newLockToken} from './core.ts';
import type {WorkerEnv,ServiceItem} from './types.ts';

export class PreparationError extends Error {
 readonly status:number;readonly code:string;
 constructor(code:string,status=409){super(code);this.name='PreparationError';this.code=code;this.status=status}
}
type PreparedInput={key:string;accessToken:string;consent:true;approvedTotal:number;customer:{name:string;phone:string;email?:string}};
const keyPattern=/^[A-Za-z0-9_-]{16,100}$/;
const tokenPattern=/^[a-f0-9]{64}$/;
export function createInteropPlanPreparation(
 env:WorkerEnv,
 fetcher:(url:string,init:RequestInit)=>Promise<Response>,
 trustedPolicy:AdapterPolicy={}
){
 const journal=createInteropJournal(env.DB);
 return Object.freeze({
  async prepare(planId:string,request:Request,input:PreparedInput){
   if(env.INTEROP_HOLDS!=='true')throw new PreparationError('FEATURE_DISABLED',404);
   // Owner authentication precedes any lookup, provider request or mutation.
   const owner=await authorizedPlan(env,planId,request);
   if(!input||!keyPattern.test(input.key)||!tokenPattern.test(input.accessToken)||
      input.consent!==true||!Number.isSafeInteger(input.approvedTotal)||input.approvedTotal<0||!input.customer||typeof input.customer!=='object')
    throw new PreparationError('INVALID_CHECKOUT_INPUT',400);
   // Original key/token lets the owner recover an ID after a lost HTTP response,
   // without repeating preflight or creating a second logical order.
   let prior;
   try{prior=await journal.lookupCheckoutByKey(input.key,input.accessToken)}
   catch(e){if(!(e instanceof JournalError&&e.status===404))throw e}
   if(prior){
    // A successful replay must not silently accept changed customer/consent.
    // Recovery uses the original credential pair, but may not rewrite the
    // durable checkout or disclose its data to a changed request.
    const original=prior.intent.customer;
    if(prior.intent.source.kind!=='plan'||prior.intent.source.id!==planId)
     throw new PreparationError('SOURCE_CONFLICT',409);
    if(original.name!==input.customer.name||original.phone!==input.customer.phone||
       (original.email??undefined)!==(input.customer.email??undefined)||
       prior.intent.items.reduce((sum,i)=>sum+i.expectedTotal,0)!==input.approvedTotal)
     throw new PreparationError('IDEMPOTENCY_CONFLICT',409);
    return {orderId:prior.orderId,created:false,state:'NOT_STARTED' as const,bookingPerformed:false};
   }
   if(owner.orderLock)throw new PreparationError('PLAN_LOCKED',409);
   // Neither display metadata nor client-supplied "verified" flags may authorize
   // material hotel room, ticket tier or rental option selections.
   if(typeof trustedPolicy.verifySelection!=='function')
    throw new PreparationError('TRUSTED_SELECTION_VERIFIER_REQUIRED',503);
   if(typeof fetcher!=='function')throw new PreparationError('FETCHER_NOT_CONFIGURED',503);
   const lock='I5_'+newLockToken();
   await claimPlan(env,planId,lock);
   let persisted=false;
   try{
    // Reload after SQL claim. The UI might have edited the plan between auth and lock.
    const plan=await authorizedPlan(env,planId,request);
    if(plan.orderLock!==lock)throw new PreparationError('PLAN_LOCK_CONFLICT',409);
    const selected=bookable(plan);
    if(selected.length>3)throw new PreparationError('TOO_MANY_PROVIDERS',409);
    const items:ServiceItem[]=selected.map((idx:number)=>plan.activities[idx].sourceItem as ServiceItem);
    if(new Set(items.map(item=>item.type)).size!==items.length)
     throw new PreparationError('DUPLICATE_PROVIDER',409);
    const adapter=createProviderAdapter(env,fetcher,trustedPolicy);
    const preflight=await adapter.prepareCheckout({items,requestedMode:'CONTRACT_0_2'});
    if(preflight.decision.mode!=='CONTRACT_0_2'||!preflight.preflightComplete)
     throw new PreparationError('PREFLIGHT_NOT_VERIFIED',409);
    const offers:PreparedOffer[]=preflight.offers.map(o=>{
     if(!o.ok)throw new PreparationError('PREFLIGHT_NOT_VERIFIED',409);
     return o.offer;
    });
    // Explicit customer price acceptance is mandatory. Browser quote is not
    // an authority; exact fresh provider total must match the accepted amount.
    const actualTotal=offers.reduce((sum,offer)=>sum+offer.totalPrice,0);
    if(!Number.isSafeInteger(actualTotal)||actualTotal!==input.approvedTotal)
     throw new PreparationError('PRICE_CHANGED',409);
    const intent:CheckoutIntent={
     source:{kind:'plan',id:planId},customer:input.customer,consent:true,
     items:items.map((item,i)=>({item,expectedTotal:offers[i].totalPrice}))
    };
    const saved=await journal.reserveCheckout(input.key,input.accessToken,intent,offers);
    persisted=true; // Keep source locked against edits and legacy double booking.
    return {orderId:saved.checkout.orderId,created:saved.created,state:'NOT_STARTED' as const,bookingPerformed:false};
   }finally{
    if(!persisted)await releasePlan(env,planId,lock);
   }
  }
 });
}
