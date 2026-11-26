import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createInteropJournal} from '../src/interop-journal.ts';
import {createHoldSaga} from '../src/interop-saga.ts';
import {InteropError,createInteropClient} from '../src/interop.ts';
import {mockProvider,TOKEN} from './fixtures/interop-provider.mjs';

const access='c'.repeat(64),time=Date.parse('2026-12-01T03:00:00Z');
const items={
 transport:{type:'transport',vehicleId:'R-01',startDate:'2026-12-12',endDate:'2026-12-14',withDriver:false},
 wisata:{type:'wisata',destinationId:101,visitDate:'2026-12-13',quantity:1,tier:'base'}
};
const wanted=(types)=>({customer:{name:'Synthetic I4 Customer',phone:'0800000000'},consent:true,source:{kind:'cart'},
 items:types.map(kind=>({item:items[kind],expectedTotal:10000}))});
function offered(kind,id='opaque-fixture'){
 return {provider:kind,entityType:kind==='transport'?'vehicle_rental':'tourist_attraction',resourceId:'R-01',offerId:id,
 quantity:1,period:{startDate:kind==='transport'?'2026-12-12':'2026-12-13',endDate:kind==='transport'?'2026-12-14':'2026-12-13'},
 totalPrice:10000,currency:'IDR',generatedAt:'2026-12-01T03:00:00Z'};
}
const sql=n=>readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8');
async function fixture(t,types=['transport']){
 let clock=time;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
  script:'export default {fetch(){return new Response("fixture")}}',d1Databases:{DB:'i4-local'}}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 for(const n of ['0001_init.sql','0002_interop_holds.sql']){
  for(const s of sql(n).replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(s).run();
 }
 const journal=createInteropJournal(db,{now:()=>clock,leaseMs:1000});
 const key='checkout_i4_'+types.join('_')+'_0001';
 const created=await journal.reserveCheckout(key,access,wanted(types),types.map(k=>offered(k)));
 return {db,journal,id:created.checkout.orderId,token:access,advance:ms=>{clock+=ms},now:()=>clock};
}
function fake(kind,opts={}){
 const calls={hold:0,confirm:0,release:0,getHold:0,keys:[]};
 let state='awaiting_payment';
 const holdId='H-'+kind;
 const client={
  async hold(body,key){
   calls.hold++;calls.keys.push(key);
   if(opts.holdError)throw opts.holdError;
   return {holdId,offerId:body.offerId,externalRef:body.externalRef,reservationState:'awaiting_payment',
    paymentState:'unpaid',totalPrice:opts.price??10000,currency:'IDR',
    expiresAt:new Date(time+(opts.ttlMs??15*60000)).toISOString()};
  },
  async confirm(id,key){
   calls.confirm++;calls.keys.push(key);
   if(opts.confirmError){if(opts.remoteConfirmed)state='reserved';throw opts.confirmError}
   assert.equal(id,holdId);state='reserved';
   return {holdId,reservationState:'reserved',paymentState:'unpaid',voucher:{code:'V-'+kind,note:'fixture'}};
  },
  async release(id,key){
   calls.release++;calls.keys.push(key);
   if(opts.releaseError)throw opts.releaseError;
   assert.equal(id,holdId);state='cancelled';
   return {holdId,reservationState:'cancelled'};
  },
  async getHold(id){
   calls.getHold++;assert.equal(id,holdId);
   return {holdId,reservationState:state,paymentState:'unpaid',
    ...(state==='reserved'?{voucher:{code:'V-'+kind,note:'fixture'}}:{})};
  }
 };
 return {client,calls};
}
const error=(provider,operation,status,code,unknown=true)=>new InteropError(provider,operation,status,code,unknown);
const run=(f,clients,minTtlMs=60000)=>createHoldSaga(f.journal,clients,{now:f.now,minTtlMs,authorizeRecovery:async()=>true,authorizeHold:async()=>true,authorizeConfirm:async()=>true});
async function operations(f){return (await f.journal.readJournal(f.id,f.token)).operations}

test('I4: all holds recorded, explicit confirm, no payment inference',async t=>{
 const f=await fixture(t,['transport','wisata']),a=fake('transport'),b=fake('wisata'),s=run(f,{transport:a.client,wisata:b.client});
 const h=await s.hold(f.id,f.token);
 assert.equal(h.status,'AWAITING_CONFIRMATION');assert.equal(h.completed,2);
 const c=await s.confirm(f.id,f.token);assert.equal(c.status,'CONFIRMED');assert.equal(c.completed,2);
 assert.equal(a.calls.hold,1);assert.equal(b.calls.hold,1);assert.equal(a.calls.confirm,1);assert.equal(b.calls.confirm,1);
 assert.equal((await operations(f)).filter(o=>o.state==='SUCCEEDED').length,4);
 assert.equal((await s.confirm(f.id,f.token)).status,'BLOCKED');
});
test('I4: definitive second hold rejection reverses first hold',async t=>{
 const f=await fixture(t,['transport','wisata']),a=fake('transport'),b=fake('wisata',{holdError:error('wisata','hold',409,'NOT_AVAILABLE',false)});
 const r=await run(f,{transport:a.client,wisata:b.client}).hold(f.id,f.token);
 assert.equal(r.status,'COMPENSATED');assert.equal(a.calls.release,1);assert.equal(b.calls.release,0);
 assert.deepEqual((await operations(f)).map(o=>o.operation+':'+o.state),['HOLD:SUCCEEDED','RELEASE:SUCCEEDED','HOLD:REJECTED']);
});
test('I4: ambiguous second hold must not compensate or retry',async t=>{
 const f=await fixture(t,['transport','wisata']),a=fake('transport'),b=fake('wisata',{holdError:error('wisata','hold',504,'UPSTREAM_TIMEOUT')});
 const s=run(f,{transport:a.client,wisata:b.client});
 const r=await s.hold(f.id,f.token);
 assert.equal(r.status,'UNKNOWN');assert.equal(a.calls.release,0);assert.equal(b.calls.hold,1);
 assert.equal((await operations(f)).find(o=>o.provider==='wisata').state,'UNKNOWN');
 await assert.rejects(s.hold(f.id,f.token));
 assert.equal(b.calls.hold,1);
});
test('I4: changed provider price is recorded then compensated',async t=>{
 const f=await fixture(t),a=fake('transport',{price:12000}),s=run(f,{transport:a.client});
 const r=await s.hold(f.id,f.token);assert.equal(r.status,'COMPENSATED');
 assert.equal(a.calls.release,1);
 assert.equal((await operations(f)).find(o=>o.operation==='HOLD').result.totalPrice,12000);
});
test('I4: short hold TTL triggers compensation',async t=>{
 const f=await fixture(t),a=fake('transport',{ttlMs:30000});
 const r=await run(f,{transport:a.client}).hold(f.id,f.token);
 assert.equal(r.status,'COMPENSATED');assert.equal(a.calls.release,1);
});
test('I4: unknown compensation stops without claiming rollback',async t=>{
 const f=await fixture(t),a=fake('transport',{price:12000,releaseError:error('transport','release',504,'UPSTREAM_TIMEOUT')});
 const r=await run(f,{transport:a.client}).hold(f.id,f.token);
 assert.equal(r.status,'UNKNOWN');assert.equal(a.calls.release,1);
 assert.equal((await operations(f)).find(o=>o.operation==='RELEASE').state,'UNKNOWN');
});
test('I4: confirm blocked before hold and after inadequate remaining TTL',async t=>{
 const f=await fixture(t),a=fake('transport');
 const s=run(f,{transport:a.client});
 assert.equal((await s.confirm(f.id,f.token)).status,'BLOCKED');
 assert.equal(a.calls.confirm,0);
 await s.hold(f.id,f.token);f.advance(14*60000);
 assert.equal((await s.confirm(f.id,f.token)).status,'BLOCKED');
 assert.equal(a.calls.confirm,0);
});
test('I4: partial definitive confirm cannot be falsely reported confirmed',async t=>{
 const f=await fixture(t,['transport','wisata']),a=fake('transport'),b=fake('wisata',{confirmError:error('wisata','confirm',409,'HOLD_EXPIRED',false)});
 const s=run(f,{transport:a.client,wisata:b.client});
 assert.equal((await s.hold(f.id,f.token)).status,'AWAITING_CONFIRMATION');
 const r=await s.confirm(f.id,f.token);
 assert.equal(r.status,'PARTIAL');assert.equal(r.completed,1);
 assert.equal(a.calls.release,0);
 assert.equal((await operations(f)).find(o=>o.provider==='wisata'&&o.operation==='CONFIRM').state,'REJECTED');
});
test('I4: unknown confirm reconciles by read-only GET after quiescence',async t=>{
 const f=await fixture(t),a=fake('transport',{remoteConfirmed:true,confirmError:error('transport','confirm',504,'UPSTREAM_TIMEOUT')});
 const s=run(f,{transport:a.client});
 await s.hold(f.id,f.token);
 const r=await s.confirm(f.id,f.token);assert.equal(r.status,'UNKNOWN');
 const lock=await f.db.prepare('SELECT fence FROM jt_order_locks WHERE order_id=?').bind(f.id).first();
 f.advance(1001);
 const recovered=await s.reconcile(f.id,f.token,lock.fence,true);
 assert.equal(recovered.reason,'RECONCILED_VERIFY_FINAL_ORDER');
 assert.equal(a.calls.getHold,1);assert.equal(a.calls.confirm,1);
 assert.equal((await operations(f)).find(o=>o.operation==='CONFIRM').state,'SUCCEEDED');
});
test('I4: unresolved hold without known remote hold id stays manual',async t=>{
 const f=await fixture(t),a=fake('transport',{holdError:error('transport','hold',504,'UPSTREAM_TIMEOUT')});
 const s=run(f,{transport:a.client});
 assert.equal((await s.hold(f.id,f.token)).status,'UNKNOWN');
 const lock=await f.db.prepare('SELECT fence FROM jt_order_locks WHERE order_id=?').bind(f.id).first();
 f.advance(1001);
 await assert.rejects(s.reconcile(f.id,f.token,lock.fence,false));
 const r=await s.reconcile(f.id,f.token,lock.fence,true);
 assert.equal(r.status,'UNKNOWN');assert.equal(a.calls.getHold,0);
});
test('I4: real I1 client fixture executes exact-key hold then confirm without stock duplication',async t=>{
 const f=await fixture(t),mock=mockProvider('transport',2);
 const client=createInteropClient({provider:'transport',baseUrl:'https://fixture.invalid',token:TOKEN,fetcher:mock.fetcher});
 const offerResponse=await client.offers({startDate:'2026-12-12',endDate:'2026-12-14'});
 const id=offerResponse.offers[0].offerId;
 const checkout=await f.journal.reserveCheckout('checkout_i4_real_fixture_0001',access,wanted(['transport']),[offered('transport',id)]);
 const saga=run(f,{transport:client});
 assert.equal((await saga.hold(checkout.checkout.orderId,access)).status,'AWAITING_CONFIRMATION');
 assert.equal(mock.remaining(),1);
 assert.equal((await saga.confirm(checkout.checkout.orderId,access)).status,'CONFIRMED');
 assert.equal(mock.remaining(),1);
});
test('I4: module has no production route wiring and feature flag remains off',()=>{
 for(const p of ['index.ts','orders.ts','provider.ts','plans.ts','packages.ts','db.ts']){
  assert.doesNotMatch(readFileSync(new URL('../src/'+p,import.meta.url),'utf8'),/from\s+['"][^'"]*interop-saga\.ts/);
 }
 assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"BOOKING_ENABLED"\s*:\s*"false"/);
});

test('I4 recovery: operator authorization callback required before any D1 lock takeover',async t=>{
 const f=await fixture(t),a=fake('transport',{holdError:error('transport','hold',504,'UPSTREAM_TIMEOUT')});
 const ordinary=createHoldSaga(f.journal,{transport:a.client},{now:f.now,minTtlMs:60000,authorizeHold:async()=>true});
 assert.equal((await ordinary.hold(f.id,f.token)).status,'UNKNOWN');
 const lock=await f.db.prepare('SELECT fence FROM jt_order_locks WHERE order_id=?').bind(f.id).first();
 f.advance(1001);
 await assert.rejects(ordinary.reconcile(f.id,f.token,lock.fence,true),/OPERATOR_AUTH_REQUIRED/);
 const denied=createHoldSaga(f.journal,{transport:a.client},{now:f.now,authorizeRecovery:async()=>false});
 await assert.rejects(denied.reconcile(f.id,f.token,lock.fence,true),/OPERATOR_AUTH_REQUIRED/);
 assert.equal((await f.db.prepare('SELECT fence FROM jt_order_locks WHERE order_id=?').bind(f.id).first()).fence,lock.fence);
 assert.equal(a.calls.getHold,0);
});

test('I4 mutation policies: no trusted server approval means no remote call or D1 operation',async t=>{
 const f=await fixture(t),a=fake('transport');
 const defaultDenied=createHoldSaga(f.journal,{transport:a.client},{now:f.now});
 await assert.rejects(defaultDenied.hold(f.id,f.token),/HOLD_POLICY_REQUIRED/);
 assert.equal(a.calls.hold,0);
 const allowedHold=createHoldSaga(f.journal,{transport:a.client},{now:f.now,minTtlMs:60000,authorizeHold:async()=>true});
 assert.equal((await allowedHold.hold(f.id,f.token)).status,'AWAITING_CONFIRMATION');
 await assert.rejects(defaultDenied.confirm(f.id,f.token),/CONFIRM_POLICY_REQUIRED/);
 const deniedConfirm=createHoldSaga(f.journal,{transport:a.client},{now:f.now,authorizeConfirm:async()=>false});
 await assert.rejects(deniedConfirm.confirm(f.id,f.token),/CONFIRM_POLICY_REQUIRED/);
 assert.equal(a.calls.confirm,0);
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM jt_interop_operations WHERE operation='CONFIRM'").first()).n,0);
});

test('final PR: documented rejection after earlier HOLD compensates; unknown code must not release',async t=>{
 for(const [status,code,unknown] of [[400,'INVALID_CUSTOMER',false],[400,'INVALID_QUANTITY',false],[415,'UNSUPPORTED_MEDIA_TYPE',false],[503,'INTEROP_NOT_CONFIGURED',false],[503,'UPSTREAM_BUSY',true],[409,'IDEMPOTENCY_CONFLICT',true]]){
  const f=await fixture(t,['transport','wisata']);
  const a=fake('transport'),b=fake('wisata',{holdError:error('wisata','hold',status,code,unknown)});
  const r=await run(f,{transport:a.client,wisata:b.client}).hold(f.id,f.token);
  assert.equal(r.status,unknown?'UNKNOWN':'COMPENSATED',code);
  assert.equal(a.calls.release,unknown?0:1,code);
  assert.equal(b.calls.hold,1,code);
 }
});
