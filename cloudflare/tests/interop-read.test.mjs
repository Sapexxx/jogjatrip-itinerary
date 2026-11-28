import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker from '../src/index.ts';
import {createInteropJournal} from '../src/interop-journal.ts';
import {createInternalCheckoutBridge} from '../src/interop-checkout-bridge.ts';
import {createInteropPlanPreparation,PreparationError} from '../src/interop-plan-preparation.ts';
import {createPlan,updatePlan} from '../src/plans.ts';
import {mockProvider,TOKEN} from './fixtures/interop-provider.mjs';

const key='checkout_read_only_fixture_0001',token='a'.repeat(64);
const item={type:'transport',vehicleId:'R-01',startDate:'2026-12-12',endDate:'2026-12-14',withDriver:false};
const intent={customer:{name:'PRIVATE CUSTOMER',phone:'0800000000'},consent:true,source:{kind:'cart'},items:[{item,expectedTotal:10000}]};
const offer={provider:'transport',entityType:'vehicle_rental',resourceId:'R-01',offerId:'opaque-test',quantity:1,period:{startDate:'2026-12-12',endDate:'2026-12-14'},totalPrice:10000,currency:'IDR',generatedAt:'2026-12-01T03:00:00Z'};
const read=n=>readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8');
async function fixture(t){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',d1Databases:{DB:'read-only-i5'}}));
 t.after(()=>mf.dispose());
 const DB=await mf.getD1Database('DB');
 for(const n of ['0001_init.sql','0002_interop_holds.sql'])
  for(const sql of read(n).replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await DB.prepare(sql).run();
 const journal=createInteropJournal(DB,{now:()=>Date.parse('2026-12-01T03:00:00Z')});
 const {checkout}=await journal.reserveCheckout(key,token,intent,[offer]);
 const env={DB,INTEROP_HOLDS:'true',BOOKING_ENABLED:'false',ASSETS:{fetch:async()=>new Response('assets')}};
 const get=(id=checkout.orderId,secret=token,e=env,method='GET')=>worker.fetch(new Request('https://fixture.test/api/interop/checkouts/'+encodeURIComponent(id),{method,headers:{'X-Interop-Token':secret}}),e);
 return {journal,checkout,env,get};
}
test('I4/I5: authenticated read returns redacted D1 truth and no-cache',async t=>{
 const f=await fixture(t),response=await f.get(),data=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(data.status,'NOT_STARTED');assert.equal(data.items[0].state,'NOT_STARTED');
 assert.equal(data.paymentVerified,false);assert.equal(data.bookingsAtomic,false);
 assert.equal(data.verifiedBy,'D1_JOURNAL');
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE CUSTOMER|0800000000|opaque-test|a{64}|idempotencyKey|secretHash|requestHash/);
 const lock=await f.journal.claimLock(f.checkout.orderId,token);
 const started=await f.journal.beginOperation(lock,0,'HOLD');
 const inflight=await (await f.get()).json();assert.equal(inflight.status,'IN_FLIGHT');
 await f.journal.recordOutcome(lock,0,'HOLD',started.operation.revision,{state:'SUCCEEDED',result:{holdId:'H-1',offerId:offer.offerId,externalRef:f.checkout.orderId,reservationState:'awaiting_payment',paymentState:'unpaid',totalPrice:10000,currency:'IDR',expiresAt:'2026-12-01T03:15:00Z'}});
 const held=await (await f.get()).json();assert.equal(held.status,'AWAITING_CONFIRMATION');assert.equal(held.items[0].state,'HELD');assert.equal(held.items[0].reservationState,'awaiting_payment');assert.equal(held.items[0].paymentState,'unpaid');
});
test('I4/I5: wrong/missing token, unknown ID and malformed token do not disclose checkout',async t=>{
 const f=await fixture(t);
 for(const [id,secret] of [[f.checkout.orderId,'b'.repeat(64)],[f.checkout.orderId,''],['JT-'+'c'.repeat(32),token],[f.checkout.orderId,'not-a-token']]){
  const r=await f.get(id,secret),body=await r.text();assert.equal(r.status,404);
  assert.doesNotMatch(body,/PRIVATE CUSTOMER|opaque-test|requestHash|checkout_read_only_fixture/);
 }
});
test('I4/I5: explicit flag required; GET only and no production booking',async t=>{
 const f=await fixture(t);
 assert.equal((await f.get(f.checkout.orderId,token,{...f.env,INTEROP_HOLDS:'false'})).status,404);
 assert.equal((await f.get(f.checkout.orderId,token,f.env,'POST')).status,404);
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jt_interop_operations').first()).n,0);
 assert.equal(f.env.BOOKING_ENABLED,'false');
});

async function planSetup(t){
 const f=await fixture(t);
 const env={...f.env,TRANSPORT_API_URL:'https://fixture.invalid',TRANSPORT_PARTNER_TOKEN:TOKEN};
 const created=await createPlan(env,{title:'Protected saved plan',startDate:'2026-12-12',endDate:'2026-12-14',
  activities:[{type:'transport',title:'Rental',date:'2026-12-12',startTime:'09:00',endTime:'11:00',sourceItem:item}]});
 const id=created.itinerary.id,auth=new Request('https://fixture.test/api/interop/itineraries/'+id+'/prepare',{
  method:'POST',headers:{'X-Plan-Token':created.accessToken}});
 const input={key:'checkout_i5_plan_test_0001',accessToken:'c'.repeat(64),consent:true,approvedTotal:10000,customer:{name:'Synthetic Plan',phone:'0800000000',email:'test@example.test'}};
 return {...f,env,id,auth,input,ownerToken:created.accessToken};
}
test('I5: trusted plan-only preparation persists immutable D1 snapshot and never books',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const gateway=createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true});
 const first=await gateway.prepare(f.id,f.auth,f.input);
 assert.equal(first.created,true);assert.equal(first.state,'NOT_STARTED');assert.equal(first.bookingPerformed,false);
 const view=await f.journal.readJournal(first.orderId,f.input.accessToken);
 assert.equal(view.checkout.intent.source.kind,'plan');assert.equal(view.checkout.intent.source.id,f.id);
 assert.equal(view.checkout.offers.length,1);assert.equal(view.checkout.intent.items[0].expectedTotal,10000);
 assert.equal(view.operations.length,0);assert.ok(remote.calls.length>=2);
 assert.ok(remote.calls.every(c=>c.method==='GET'));
 const again=await gateway.prepare(f.id,f.auth,f.input);
 assert.equal(again.orderId,first.orderId);assert.equal(again.created,false);
 assert.equal(remote.calls.filter(c=>c.method==='POST').length,0);
 const row=await f.env.DB.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first();
 assert.ok(row.order_lock);
});
test('I5: no verifier fails closed without source lock or provider calls',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 await assert.rejects(createInteropPlanPreparation(f.env,remote.fetcher).prepare(f.id,f.auth,f.input),e=>e instanceof PreparationError&&e.code==='TRUSTED_SELECTION_VERIFIER_REQUIRED');
 assert.equal(remote.calls.length,0);
 assert.equal((await f.env.DB.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,null);
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jt_checkout_requests').first()).n,1); // original cart fixture only
});
test('I5: wrong plan token blocks before any trusted preflight',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const wrong=new Request(f.auth.url,{method:'POST',headers:{'X-Plan-Token':'wrong'}});
 await assert.rejects(createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true}).prepare(f.id,wrong,f.input));
 assert.equal(remote.calls.length,0);
});
test('I5: unverified material selection does not create D1 checkout and releases mutex',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 await assert.rejects(createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>false}).prepare(f.id,f.auth,f.input),
  e=>e instanceof PreparationError&&e.code==='PREFLIGHT_NOT_VERIFIED');
 assert.ok(remote.calls.every(c=>c.method==='GET'));
 assert.equal((await f.env.DB.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,null);
});
test('I5: public preparation endpoint denies when server trusted verifier unavailable',async t=>{
 const f=await planSetup(t);
 const response=await worker.fetch(new Request(f.auth.url,{method:'POST',headers:{'X-Plan-Token':f.ownerToken,'Content-Type':'application/json'},body:JSON.stringify(f.input)}),f.env);
 assert.equal(response.status,503);
 const data=await response.json();
 assert.equal(data.error,'TRUSTED_SELECTION_VERIFIER_REQUIRED');
 assert.equal((await f.env.DB.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,null);
});

test('I5: changed customer or approved price cannot reuse original checkout',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const gateway=createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true});
 const first=await gateway.prepare(f.id,f.auth,f.input);
 assert.equal(first.created,true);
 for(const changed of [
  {...f.input,customer:{...f.input.customer,name:'Different Customer'}},
  {...f.input,approvedTotal:11000}
 ]){
  await assert.rejects(gateway.prepare(f.id,f.auth,changed),e=>e instanceof PreparationError&&e.code==='IDEMPOTENCY_CONFLICT');
 }
 const persisted=await f.journal.loadCheckout(first.orderId,f.input.accessToken);
 assert.equal(persisted.intent.customer.name,'Synthetic Plan');
 assert.equal(persisted.intent.items[0].expectedTotal,10000);
 assert.equal(remote.calls.filter(c=>c.method==='POST').length,0);
});
test('I5: changed provider price fails closed before D1 checkout and releases plan lock',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const gateway=createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true});
 await assert.rejects(gateway.prepare(f.id,f.auth,{...f.input,approvedTotal:9000}),
  e=>e instanceof PreparationError&&e.code==='PRICE_CHANGED');
 assert.equal((await f.env.DB.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,null);
 const count=await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jt_checkout_requests').first();
 assert.equal(count.n,1); // the initial cart fixture, no plan checkout
 assert.equal(remote.calls.filter(c=>c.method==='POST').length,0);
});
test('I5: explicit approved price is required before any network call',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const gateway=createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true});
 await assert.rejects(gateway.prepare(f.id,f.auth,{...f.input,approvedTotal:undefined}),
  e=>e instanceof PreparationError&&e.code==='INVALID_CHECKOUT_INPUT');
 assert.equal(remote.calls.length,0);
});

test('I5: provider-required email is verified before creating checkout and releases lock on rejection',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const fetcher=async(u,i)=>{const r=await remote.fetcher(u,i);if(!u.endsWith('/capabilities'))return r;return new Response(JSON.stringify({...await r.json(),requiredCustomerFields:['name','phone','email']}),{status:r.status})};
 const gateway=createInteropPlanPreparation(f.env,fetcher,{verifySelection:()=>true});
 await assert.rejects(gateway.prepare(f.id,f.auth,{...f.input,customer:{name:f.input.customer.name,phone:f.input.customer.phone}}),e=>e instanceof PreparationError&&e.code==='REQUIRED_CUSTOMER_FIELD_MISSING');
 assert.equal((await f.env.DB.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,null);assert.ok(remote.calls.every(c=>c.method==='GET'));
});

test('I5 consent: changed material selection or absent consent blocks before any provider call',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const gateway=createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true});
 await assert.rejects(gateway.prepare(f.id,f.auth,{...f.input,consent:false}),e=>e.code==='INVALID_CHECKOUT_INPUT');
 await assert.rejects(gateway.prepare(f.id,f.auth,{...f.input,approvedItems:[{...item,withDriver:true}]}),e=>e.code==='APPROVED_SELECTION_MISMATCH');
 assert.equal(remote.calls.length,0);assert.equal((await f.env.DB.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,null);
});
test('I5 preparation opt-in requires explicit separate flag, disabled booking, approved selection and same origin',async t=>{
 const f=await planSetup(t),env={...f.env,INTEROP_PREPARE_ENABLED:'true'};
 const health=async e=>await (await worker.fetch(new Request('https://fixture.test/api/health'),e)).json();
 assert.equal((await health(f.env)).interopPreparationEnabled,false);
 assert.equal((await health(env)).interopPreparationEnabled,true);
 assert.equal((await health({...env,BOOKING_ENABLED:'true'})).interopPreparationEnabled,false);
 const req=(body,origin='https://fixture.test')=>new Request(f.auth.url,{method:'POST',headers:{'X-Plan-Token':f.ownerToken,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
 assert.equal((await worker.fetch(req(f.input),env)).status,400);
 assert.equal((await worker.fetch(req({...f.input,approvedItems:[item]},'https://wrong.test'),env)).status,403);
 assert.equal((await worker.fetch(req({...f.input,approvedItems:[item],consent:false}),env)).status,400);
 const book=await worker.fetch(new Request('https://fixture.test/api/book',{method:'POST',body:'{}'}),env);
 assert.equal(book.status,503);
});

test('I5 token recovery endpoint authenticates original plan, key and checkout token; no provider call or second row',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const prepared=await createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true}).prepare(f.id,f.auth,f.input);
 const count=remote.calls.length;
 const recover=(headers)=>worker.fetch(new Request(f.auth.url,{method:'GET',headers:{'X-Plan-Token':f.ownerToken,'X-Checkout-Key':f.input.key,'X-Interop-Token':f.input.accessToken,...headers}}),f.env);
 const r=await recover({});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const data=await r.json();assert.equal(data.orderId,prepared.orderId);assert.equal(data.status,'NOT_STARTED');assert.doesNotMatch(JSON.stringify(data),/Synthetic Plan|0800000000|opaque-fixture/);
 assert.equal((await recover({'X-Interop-Token':'d'.repeat(64)})).status,404);
 assert.equal((await recover({'X-Checkout-Key':'other_key_000000000'})).status,404);
 assert.equal((await recover({'X-Plan-Token':'wrong'})).status,403);
 assert.equal(remote.calls.length,count);assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jt_checkout_requests').first()).n,2);
});

test('I5 internal bridge requires both credentials, bound plan lock, server authorization, then HOLD/CONFIRM separately',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 const prepared=await createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true}).prepare(f.id,f.auth,f.input);
 const env={...f.env,BOOKING_ENABLED:'true'},clock=()=>Date.parse('2026-12-01T03:00:00Z'),options={now:clock,authorize:()=>true};
 const args=[f.id,f.auth,f.input.key,f.input.accessToken];
 const before=remote.calls.length;
 await assert.rejects(createInternalCheckoutBridge(f.env,remote.fetcher,options).hold(...args),e=>e.code==='EXECUTION_DISABLED');
 await assert.rejects(createInternalCheckoutBridge(env,remote.fetcher,{now:clock}).hold(...args),e=>e.code==='EXECUTION_DISABLED');
 await assert.rejects(createInternalCheckoutBridge(env,remote.fetcher,{...options,authorize:()=>false}).hold(...args),e=>e.code==='EXECUTION_NOT_AUTHORIZED');
 await assert.rejects(createInternalCheckoutBridge(env,remote.fetcher,options).hold(f.id,f.auth,f.input.key,'d'.repeat(64)));
 assert.equal(remote.calls.length,before);
 const bridge=createInternalCheckoutBridge(env,remote.fetcher,{...options,authorize:(action,id)=>id===prepared.orderId&&action==='HOLD'});
 const h=await bridge.hold(...args);assert.equal(h.status,'AWAITING_CONFIRMATION');
 await assert.rejects(bridge.confirm(...args),e=>e.code==='EXECUTION_NOT_AUTHORIZED');
 assert.equal(remote.calls.filter(c=>c.path.endsWith('/confirm')).length,0);
 const confirmed=await createInternalCheckoutBridge(env,remote.fetcher,{...options,authorize:(action,id)=>id===prepared.orderId&&action==='CONFIRM'}).confirm(...args);
 assert.equal(confirmed.status,'CONFIRMED');assert.equal(remote.calls.filter(c=>c.method==='POST').length,2);
 const status=await (await worker.fetch(new Request('https://fixture.test/api/interop/checkouts/'+prepared.orderId,{headers:{'X-Interop-Token':f.input.accessToken}}),f.env)).json();
 assert.equal(status.status,'CONFIRMED');assert.equal(status.paymentVerified,false);
 await assert.rejects(createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true}).prepare(f.id,f.auth,f.input),e=>e.code==='CHECKOUT_ALREADY_STARTED');
 assert.equal(remote.calls.filter(c=>c.method==='POST').length,2);
});
test('I5 internal bridge refuses a checkout whose plan lock was lost or replaced',async t=>{
 const f=await planSetup(t),remote=mockProvider('transport');
 await createInteropPlanPreparation(f.env,remote.fetcher,{verifySelection:()=>true}).prepare(f.id,f.auth,f.input);
 await f.env.DB.prepare('UPDATE jt_plans SET order_lock=? WHERE id=?').bind('different-lock',f.id).run();
 const bridge=createInternalCheckoutBridge({...f.env,BOOKING_ENABLED:'true'},remote.fetcher,{authorize:()=>true});
 await assert.rejects(bridge.hold(f.id,f.auth,f.input.key,f.input.accessToken),e=>e.code==='SOURCE_LOCK_MISMATCH');
 assert.equal(remote.calls.filter(c=>c.method==='POST').length,0);
});
test('I5 internal bridge is not imported by Worker routes or legacy orders',()=>{
 for(const name of ['index.ts','orders.ts','plans.ts','packages.ts'])assert.doesNotMatch(readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),/from\s+['"][^'"]*interop-checkout-bridge/);
});
