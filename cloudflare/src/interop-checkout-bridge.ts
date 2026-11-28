/** Internal checkout-to-saga orchestration. Not imported by Worker routes.
 * Caller must supply a server-owned staging/release authorization function.
 * No client-supplied approval flag is an authorization. No fallback to legacy.
 */
import type {WorkerEnv,ProviderKind} from './types.ts';
import {authorizedPlan} from './db.ts';
import {createInteropJournal,JournalError} from './interop-journal.ts';
import {createInteropClient} from './interop.ts';
import {createHoldSaga} from './interop-saga.ts';
import {preparationLockFor} from './interop-plan-preparation.ts';
type Action='HOLD'|'CONFIRM'|'RECONCILE';
type Auth=(action:Action,orderId:string)=>boolean|Promise<boolean>;
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Options={authorize?:Auth;now?:()=>number;leaseMs?:number;minTtlMs?:number};
const bindings={hotel:['HOTEL_API_URL','HOTEL_PARTNER_TOKEN'],transport:['TRANSPORT_API_URL','TRANSPORT_PARTNER_TOKEN'],wisata:['WISATA_API_URL','WISATA_PARTNER_TOKEN']} as const;
export function createInternalCheckoutBridge(env:WorkerEnv,fetcher:Fetcher,options:Options={}){
 const config={...env},journal=createInteropJournal(config.DB,{now:options.now,leaseMs:options.leaseMs});
 async function execute(action:Action,planId:string,req:Request,key:string,token:string,recovery?:{fence:number;quiescenceConfirmed:boolean}){
  if(config.INTEROP_HOLDS!=='true'||config.BOOKING_ENABLED!=='true'||typeof options.authorize!=='function')throw new JournalError('EXECUTION_DISABLED',503);
  const plan=await authorizedPlan(config,planId,req);
  const checkout=await journal.lookupCheckoutByKey(key,token);
  if(checkout.intent.source.kind!=='plan'||checkout.intent.source.id!==planId||checkout.intent.consent!==true)throw new JournalError('NOT_FOUND',404);
  if(plan.orderLock!==await preparationLockFor(key))throw new JournalError('SOURCE_LOCK_MISMATCH',409);
  if(await options.authorize(action,checkout.orderId)!==true)throw new JournalError('EXECUTION_NOT_AUTHORIZED',403);
  // Resolve all configured clients before any mutation.
  const clients:Partial<Record<ProviderKind,ReturnType<typeof createInteropClient>>>={};
  for(const offer of checkout.offers){
   const [urlKey,tokenKey]=bindings[offer.provider],baseUrl=config[urlKey],partnerToken=config[tokenKey];
   if(!baseUrl||typeof partnerToken!=='string'||partnerToken.length<24||!/^[-A-Za-z0-9._~+/]+=*$/.test(partnerToken))throw new JournalError('PROVIDER_NOT_CONFIGURED',503);
   clients[offer.provider]=createInteropClient({provider:offer.provider,baseUrl,token:partnerToken,fetcher});
  }
  const approved=(a:Action)=>(id:string)=>a===action&&id===checkout.orderId;
  const saga=createHoldSaga(journal,clients,{now:options.now,minTtlMs:options.minTtlMs,authorizeHold:approved('HOLD'),authorizeConfirm:approved('CONFIRM'),authorizeRecovery:approved('RECONCILE')});
  if(action==='HOLD')return saga.hold(checkout.orderId,token);
  if(action==='CONFIRM')return saga.confirm(checkout.orderId,token);
  if(!recovery||recovery.quiescenceConfirmed!==true)throw new JournalError('QUIESCENCE_REQUIRED',409);
  return saga.reconcile(checkout.orderId,token,recovery.fence,true);
 }
 return Object.freeze({
  hold:(planId:string,req:Request,key:string,token:string)=>execute('HOLD',planId,req,key,token),
  confirm:(planId:string,req:Request,key:string,token:string)=>execute('CONFIRM',planId,req,key,token),
  reconcile:(planId:string,req:Request,key:string,token:string,fence:number,quiescenceConfirmed:boolean)=>execute('RECONCILE',planId,req,key,token,{fence,quiescenceConfirmed})
 });
}
