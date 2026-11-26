/** I4/I5 trusted read model for Contract 0.2 checkout journals.
 * No provider calls, no PII disclosure, no reservation writes.
 * Never derive a confirmation from browser state or the existence of a HOLD.
 */
import {createInteropJournal} from './interop-journal.ts';
import type {JournalRecord,CheckoutRecord} from './interop-journal.ts';
import {JournalError} from './interop-journal.ts';
import type {D1Binding} from './types.ts';

export type ReadStatus='NOT_STARTED'|'IN_FLIGHT'|'UNKNOWN'|'AWAITING_CONFIRMATION'|'CONFIRMED'|'COMPENSATED'|'PARTIAL'|'BLOCKED';
export interface PublicItemStatus {
 index:number;provider:string;state:'NOT_STARTED'|'IN_FLIGHT'|'UNKNOWN'|'HELD'|'CONFIRMED'|'RELEASED'|'REJECTED';
}
export interface PublicCheckoutStatus {
 orderId:string;status:ReadStatus;totalItems:number;items:PublicItemStatus[];
 paymentVerified:false;bookingsAtomic:false;verifiedBy:'D1_JOURNAL';
}
type View={checkout:CheckoutRecord;operations:JournalRecord[]};
export function projectCheckout(view:View):PublicCheckoutStatus {
 const {checkout,operations}=view,items:PublicItemStatus[]=checkout.offers.map((offer,index)=>{
  const ops=operations.filter(o=>o.itemIndex===index);
  const current=(step:string)=>ops.find(o=>o.operation===step);
  const hold=current('HOLD'),confirm=current('CONFIRM'),release=current('RELEASE');
  let state:PublicItemStatus['state']='NOT_STARTED';
  if([hold,confirm,release].some(o=>o?.state==='UNKNOWN'))state='UNKNOWN';
  else if([hold,confirm,release].some(o=>o?.state==='IN_FLIGHT'))state='IN_FLIGHT';
  else if(confirm?.state==='SUCCEEDED')state='CONFIRMED';
  else if(release?.state==='SUCCEEDED')state='RELEASED';
  else if([hold,confirm,release].some(o=>o?.state==='REJECTED'))state='REJECTED';
  else if(hold?.state==='SUCCEEDED')state='HELD';
  return {index,provider:offer.provider,state};
 });
 const count=(s:PublicItemStatus['state'])=>items.filter(i=>i.state===s).length;
 let status:ReadStatus='BLOCKED';
 if(count('UNKNOWN')>0)status='UNKNOWN';
 else if(count('IN_FLIGHT')>0)status='IN_FLIGHT';
 else if(count('CONFIRMED')===items.length)status='CONFIRMED';
 else if(count('RELEASED')>0&&count('RELEASED')+count('REJECTED')===items.length)status='COMPENSATED';
 else if(count('CONFIRMED')>0)status='PARTIAL';
 else if(count('HELD')===items.length)status='AWAITING_CONFIRMATION';
 else if(count('NOT_STARTED')===items.length)status='NOT_STARTED';
 else if(count('HELD')>0&&count('REJECTED')===0&&count('RELEASED')===0)status='IN_FLIGHT';
 else if(count('RELEASED')>0)status='PARTIAL';
 return {orderId:checkout.orderId,status,totalItems:items.length,items,paymentVerified:false,bookingsAtomic:false,verifiedBy:'D1_JOURNAL'};
}
export function createInteropReadGateway(db:D1Binding){
 const journal=createInteropJournal(db);
 return Object.freeze({
  async lookup(orderId:string,token:string){
   if(!/^JT-[a-f0-9]{32}$/.test(orderId)||!/^([a-f0-9]{64})$/.test(token))
    throw new JournalError('NOT_FOUND',404);
   return projectCheckout(await journal.readJournal(orderId,token));
  }
 });
}
