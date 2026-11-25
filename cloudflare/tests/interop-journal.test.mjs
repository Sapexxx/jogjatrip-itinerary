import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {createInteropJournal,JournalError} from '../src/interop-journal.ts';
import {createInteropClient} from '../src/interop.ts';
import {mockProvider,TOKEN} from './fixtures/interop-provider.mjs';
const KEY='checkout_i3_fixture_0001',TOKEN_A='a'.repeat(64),TOKEN_B='b'.repeat(64);
const baseItem={type:'transport',vehicleId:'R-01',startDate:'2026-12-12',endDate:'2026-12-14',withDriver:false};
const mkIntent=(items=[{item:baseItem,expectedTotal:10000}])=>({customer:{name:'Synthetic Customer',phone:'0800000000'},consent:true,source:{kind:'cart'},items});
const offer=(item=baseItem)=>({provider:item.type,entityType:item.type==='hotel'?'lodging':item.type==='wisata'?'tourist_attraction':'vehicle_rental',resourceId:'R-01',offerId:'opaque-fixture',quantity:item.type==='wisata'?item.quantity:1,period:{startDate:item.type==='hotel'?item.checkIn:item.type==='wisata'?item.visitDate:item.startDate,endDate:item.type==='hotel'?item.checkOut:item.type==='wisata'?item.visitDate:item.endDate},totalPrice:10000,currency:'IDR',generatedAt:'2026-12-01T03:00:00Z'});
const error=code=>e=>e instanceof JournalError&&e.code===code;
const migration=n=>readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8');
async function fixture(t){
 let clock=Date.parse('2026-12-01T03:00:00Z');
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("fixture only")}}',d1Databases:['DB']});
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 const apply=async n=>{for(const s of migration(n).replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(s).run()};
 await apply('0001_init.sql');
 await db.prepare('INSERT INTO jt_orders VALUES(?,?,?,?,?)').bind('legacy','{"old":true}','hash','old','old').run();
 await db.prepare('INSERT INTO jt_plans VALUES(?,?,?,?,?)').bind('legacy-plan','{}','hash',null,'old').run();
 await db.prepare('INSERT INTO jt_packages VALUES(?,?,?)').bind('legacy-package','{}','old').run();
 await apply('0002_interop_holds.sql');
 const make=()=>createInteropJournal(db,{now:()=>clock,leaseMs:1000});
 return {db,j:make(),make,advance:ms=>{clock+=ms},apply};
}
async function start(f,intent=mkIntent(),offers=[offer()]){
 const r=await f.j.reserveCheckout(KEY,TOKEN_A,intent,offers);const lock=await f.j.claimLock(r.checkout.orderId,TOKEN_A);return {c:r.checkout,lock};
}
function held(c,id='H-1',i=0,extra={}){
 return {holdId:id,offerId:c.offers[i].offerId,externalRef:c.externalRef,reservationState:'awaiting_payment',paymentState:'unpaid',totalPrice:c.offers[i].totalPrice,currency:'IDR',expiresAt:'2026-12-01T03:15:00Z',...extra};
}
async function saveHold(f,c,lock,i=0){
 const a=await f.j.beginOperation(lock,i,'HOLD');assert.equal(a.created,true);
 return f.j.recordOutcome(lock,i,'HOLD',a.operation.revision,{state:'SUCCEEDED',result:held(c,'H-'+i,i)});
}
test('I3 D1: additive migration preserves old rows and can be applied twice',async t=>{
 const f=await fixture(t);await f.apply('0002_interop_holds.sql');
 assert.equal((await f.db.prepare('SELECT payload FROM jt_orders WHERE id=?').bind('legacy').first()).payload,'{"old":true}');
 assert.ok(await f.db.prepare('SELECT id FROM jt_plans WHERE id=?').bind('legacy-plan').first());
 assert.ok(await f.db.prepare('SELECT id FROM jt_packages WHERE id=?').bind('legacy-package').first());
});
test('I3 D1: concurrent same-key reserve is one order; token stored only hashed; replay without fresh offers',async t=>{
 const f=await fixture(t),results=await Promise.all(Array.from({length:8},()=>f.j.reserveCheckout(KEY,TOKEN_A,mkIntent(),[offer()])));
 assert.equal(results.filter(x=>x.created).length,1);assert.equal(new Set(results.map(x=>x.checkout.orderId)).size,1);
 const c=results[0].checkout;assert.equal(c.externalRef,c.orderId);assert.equal((await f.make().reserveCheckout(KEY,TOKEN_A,mkIntent())).checkout.orderId,c.orderId);
 const row=await f.db.prepare('SELECT * FROM jt_checkout_requests').first();assert.notEqual(row.access_hash,TOKEN_A);assert.notEqual(row.key_hash,KEY);assert.ok(!JSON.stringify(row).includes(TOKEN_A));assert.ok(!JSON.stringify(row).includes(KEY));
});
test('I3 D1: same key changed payload or wrong owner rejected without disclosure',async t=>{
 const f=await fixture(t),{checkout:c}=await f.j.reserveCheckout(KEY,TOKEN_A,mkIntent(),[offer()]);
 await assert.rejects(f.j.reserveCheckout(KEY,TOKEN_A,mkIntent([{item:{...baseItem,withDriver:true},expectedTotal:10000}])),error('IDEMPOTENCY_CONFLICT'));
 await assert.rejects(f.j.reserveCheckout(KEY,TOKEN_B,mkIntent()),error('CHECKOUT_KEY_CONFLICT'));
 await assert.rejects(f.j.loadCheckout(c.orderId,TOKEN_B),error('NOT_FOUND'));
});
test('I3 D1: changed ephemeral offer does not alter durable original, changed price rejected',async t=>{
 const f=await fixture(t);const a=await f.j.reserveCheckout(KEY,TOKEN_A,mkIntent(),[offer()]);
 const b=await f.j.reserveCheckout(KEY,TOKEN_A,mkIntent(),[{...offer(),offerId:'different'}]);assert.deepEqual(a.checkout,b.checkout);
 await assert.rejects(f.j.reserveCheckout('checkout_other_fixture_01',TOKEN_A,mkIntent(),[{...offer(),totalPrice:20000}]),error('PRICE_CHANGED'));
});
test('I3 D1: consent, missing preflight, mismatched date, duplicate provider fail before insert',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.j.reserveCheckout(KEY,TOKEN_A,{...mkIntent(),consent:false},[offer()]),error('CONSENT_REQUIRED'));
 await assert.rejects(f.j.reserveCheckout(KEY,TOKEN_A,mkIntent()),error('PREFLIGHT_REQUIRED'));
 await assert.rejects(f.j.reserveCheckout(KEY,TOKEN_A,mkIntent(),[{...offer(),period:{startDate:'2026-12-13',endDate:'2026-12-14'}}]),error('OFFER_MISMATCH'));
 await assert.rejects(f.j.reserveCheckout(KEY,TOKEN_A,mkIntent([{item:baseItem,expectedTotal:10000},{item:baseItem,expectedTotal:10000}]),[offer(),offer()]),error('DUPLICATE_PROVIDER'));
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM jt_checkout_requests').first()).n,0);
});
test('I3 D1: only one concurrent lock claim wins; release and next fence',async t=>{
 const f=await fixture(t),{checkout:c}=await f.j.reserveCheckout(KEY,TOKEN_A,mkIntent(),[offer()]);
 const r=await Promise.allSettled(Array.from({length:6},()=>f.j.claimLock(c.orderId,TOKEN_A)));const winners=r.filter(x=>x.status==='fulfilled');assert.equal(winners.length,1);
 const lock=winners[0].value;await f.j.releaseLock(lock);const second=await f.j.claimLock(c.orderId,TOKEN_A);assert.equal(second.fence,lock.fence+1);await assert.rejects(f.j.renewLock(lock),error('LOCK_LOST'));
});
test('I3 D1: operation intent persisted before call, same operation races only one created, exact body recovered',async t=>{
 const f=await fixture(t),{c,lock}=await start(f);
 const r=await Promise.all(Array.from({length:5},()=>f.j.beginOperation(lock,0,'HOLD')));assert.equal(r.filter(x=>x.created).length,1);assert.equal(new Set(r.map(x=>x.operation.idempotencyKey)).size,1);
 const journal=await f.make().readJournal(c.orderId,TOKEN_A);assert.equal(journal.operations[0].state,'IN_FLIGHT');
 const restored=await f.make().getOperationRequest(lock,0,'HOLD');assert.deepEqual(restored.body,{offerId:'opaque-fixture',quantity:1,customer:mkIntent().customer,externalRef:c.orderId,consent:true});assert.equal(restored.operation.requestHash,r[0].operation.requestHash);
 assert.ok(!JSON.stringify(journal.operations).includes('Synthetic Customer'));
});
test('I3 D1: outcome CAS, sanitized projection, changed price preserved for I4',async t=>{
 const f=await fixture(t),{c,lock}=await start(f),a=await f.j.beginOperation(lock,0,'HOLD');
 const outcomes=await Promise.allSettled(Array.from({length:4},()=>f.j.recordOutcome(lock,0,'HOLD',a.operation.revision,{state:'SUCCEEDED',result:held(c,'H-1',0,{totalPrice:12000,accessToken:'do-not-store',customer:'private'})})));
 const winners=outcomes.filter(x=>x.status==='fulfilled');assert.equal(winners.length,1);const r=winners[0].value;assert.equal(r.revision,1);assert.equal(r.result.totalPrice,12000);assert.ok(!JSON.stringify(r).includes('do-not-store'));assert.ok(!JSON.stringify(r).includes('private'));
});
test('I3 D1: unresolved intent prevents unlock and starting another operation',async t=>{
 const f=await fixture(t),{lock}=await start(f),a=await f.j.beginOperation(lock,0,'HOLD');
 await assert.rejects(f.j.releaseLock(lock),error('LOCK_LOST_OR_UNRESOLVED'));
 await assert.rejects(f.j.beginOperation(lock,0,'CONFIRM'),error('HOLD_NOT_RECORDED'));
 const u=await f.j.recordOutcome(lock,0,'HOLD',a.operation.revision,{state:'UNKNOWN',code:'secret raw exception',httpStatus:504});
 assert.equal(u.errorCode,'UPSTREAM_HTTP_ERROR');assert.equal(u.state,'UNKNOWN');await assert.rejects(f.j.releaseLock(lock),error('LOCK_LOST_OR_UNRESOLVED'));
});
test('I3 D1: stale lock never auto stolen; recovery requires quiescence and only reconciles',async t=>{
 const f=await fixture(t),{c,lock}=await start(f),a=await f.j.beginOperation(lock,0,'HOLD');f.advance(1001);
 await assert.rejects(f.j.claimLock(c.orderId,TOKEN_A),error('ORDER_LOCKED'));
 await assert.rejects(f.j.recoverExpiredLock(c.orderId,TOKEN_A,lock.fence,false),error('QUIESCENCE_REQUIRED'));
 const recovered=await f.make().recoverExpiredLock(c.orderId,TOKEN_A,lock.fence,true);assert.equal(recovered.purpose,'RECONCILE');assert.equal(recovered.fence,lock.fence+1);
 await assert.rejects(f.j.recordOutcome(lock,0,'HOLD',a.operation.revision,{state:'SUCCEEDED',result:held(c)}),error('LOCK_LOST'));
 await assert.rejects(f.j.beginOperation(recovered,0,'HOLD'),error('RECONCILE_ONLY'));
 const restored=await f.j.getOperationRequest(recovered,0,'HOLD');assert.equal(restored.idempotencyKey,a.operation.idempotencyKey);
 await f.j.recordOutcome(recovered,0,'HOLD',0,{state:'SUCCEEDED',result:held(c)});await f.j.releaseLock(recovered);
 assert.equal((await f.j.claimLock(c.orderId,TOKEN_A)).fence,recovered.fence+1);
});
test('I3 D1: renew extends current lock, stale revision cannot overwrite outcome',async t=>{
 const f=await fixture(t),{c,lock}=await start(f);f.advance(800);await f.j.renewLock(lock);f.advance(800);
 const a=await f.j.beginOperation(lock,0,'HOLD');await f.j.recordOutcome(lock,0,'HOLD',a.operation.revision,{state:'UNKNOWN',code:'UPSTREAM_TIMEOUT',httpStatus:504});
 await assert.rejects(f.j.recordOutcome(lock,0,'HOLD',0,{state:'SUCCEEDED',result:held(c)}),error('REVISION_CONFLICT'));
 await f.j.recordOutcome(lock,0,'HOLD',1,{state:'SUCCEEDED',result:held(c)});
});
test('I3 D1: shared externalRef, distinct operation keys, confirm blocked before all holds',async t=>{
 const f=await fixture(t),w={type:'wisata',destinationId:101,visitDate:'2026-12-13',quantity:1,tier:'base'},intent=mkIntent([{item:baseItem,expectedTotal:10000},{item:w,expectedTotal:10000}]);
 const {c,lock}=await start(f,intent,[offer(),offer(w)]);const h=await saveHold(f,c,lock);
 await assert.rejects(f.j.beginOperation(lock,0,'CONFIRM'),error('OPERATION_BLOCKED'));
 const h2=await saveHold(f,c,lock,1);assert.notEqual(h.idempotencyKey,h2.idempotencyKey);
 const r1=await f.j.getOperationRequest(lock,0,'HOLD'),r2=await f.j.getOperationRequest(lock,1,'HOLD');assert.equal(r1.body.externalRef,r2.body.externalRef);
 const confirm=await f.j.beginOperation(lock,0,'CONFIRM');assert.notEqual(confirm.operation.idempotencyKey,h.idempotencyKey);
});
test('I3 D1: confirmed operation blocks release, release result independent of payment',async t=>{
 const f=await fixture(t),{c,lock}=await start(f);await saveHold(f,c,lock);
 const a=await f.j.beginOperation(lock,0,'CONFIRM');await f.j.recordOutcome(lock,0,'CONFIRM',a.operation.revision,{state:'SUCCEEDED',result:{holdId:'H-0',reservationState:'reserved',paymentState:'unpaid',voucher:{code:'V-1',note:'fixture'}}});
 await assert.rejects(f.j.beginOperation(lock,0,'RELEASE'),error('OPERATION_BLOCKED'));
 await f.j.releaseLock(lock);
});
test('I3 D1: rejected hold does not authorize confirm; release of previous hold allowed',async t=>{
 const f=await fixture(t),w={type:'wisata',destinationId:101,visitDate:'2026-12-13',quantity:1,tier:'base'},intent=mkIntent([{item:baseItem,expectedTotal:10000},{item:w,expectedTotal:10000}]);
 const {c,lock}=await start(f,intent,[offer(),offer(w)]);await saveHold(f,c,lock);
 const a=await f.j.beginOperation(lock,1,'HOLD');await assert.rejects(f.j.recordOutcome(lock,1,'HOLD',a.operation.revision,{state:'REJECTED',code:'UPSTREAM_TIMEOUT',httpStatus:504}),error('AMBIGUOUS_OUTCOME'));
 await f.j.recordOutcome(lock,1,'HOLD',0,{state:'REJECTED',code:'NOT_AVAILABLE',httpStatus:409});
 await assert.rejects(f.j.beginOperation(lock,0,'CONFIRM'),error('OPERATION_BLOCKED'));
 const r=await f.j.beginOperation(lock,0,'RELEASE');await f.j.recordOutcome(lock,0,'RELEASE',r.operation.revision,{state:'SUCCEEDED',result:{holdId:'H-0',reservationState:'cancelled'}});await f.j.releaseLock(lock);
});
test('I3 D1: integration with I1 fixture lost response recovers exact same key after restart, no duplicate stock',async t=>{
 const f=await fixture(t),m=mockProvider(),c=createInteropClient({provider:'transport',baseUrl:'https://fixture.invalid',token:TOKEN,fetcher:m.fetcher});
 const o=(await c.offers({startDate:baseItem.startDate,endDate:baseItem.endDate})).offers[0];
 const {c:checkout,lock}=await start(f,mkIntent(),[{...offer(),offerId:o.offerId}]);const a=await f.j.beginOperation(lock,0,'HOLD'),r=await f.j.getOperationRequest(lock,0,'HOLD');
 // Remote mutation completed, executor crashes before persisting result.
 const actual=await c.hold(r.body,r.idempotencyKey);assert.equal(m.remaining(),1);f.advance(1001);
 const j=f.make(),recovered=await j.recoverExpiredLock(checkout.orderId,TOKEN_A,lock.fence,true);
 const original=await j.getOperationRequest(recovered,0,'HOLD');assert.equal(original.idempotencyKey,a.operation.idempotencyKey);
 // Explicit fixture-only replay after quiescence. Not automatic production behavior.
 const replay=await c.hold(original.body,original.idempotencyKey);assert.deepEqual(replay,actual);assert.equal(m.remaining(),1);
 await j.recordOutcome(recovered,0,'HOLD',0,{state:'SUCCEEDED',result:replay});await j.releaseLock(recovered);
 assert.equal((await j.readJournal(checkout.orderId,TOKEN_A)).operations[0].state,'SUCCEEDED');
});
test('I3: journal module isolated, no production migration or wiring',()=>{
 for(const f of ['index.ts','orders.ts','provider.ts','plans.ts','packages.ts','db.ts'])assert.doesNotMatch(readFileSync(new URL('../src/'+f,import.meta.url),'utf8'),/from\s+['"][^'"]*interop-journal\.ts/);
 assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"BOOKING_ENABLED"\s*:\s*"false"/);
});
