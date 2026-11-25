import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInteropClient,InteropError} from '../src/interop.ts';
import {mockProvider,TOKEN,OTHER,KEY,query} from './fixtures/interop-provider.mjs';
const make=(mock,overrides={})=>createInteropClient({provider:'transport',baseUrl:'https://fixture.invalid',token:TOKEN,fetcher:mock.fetcher,...overrides});
const input=(offerId,extra={})=>({offerId,quantity:1,customer:{name:'Fixture User',phone:'0800000000'},externalRef:'JT-FIXTURE-01',consent:true,...extra});
const err=(status,code,unknown=false)=>e=>e instanceof InteropError&&e.status===status&&e.code===code&&e.outcomeUnknown===unknown;
const offer=async c=>(await c.offers(query)).offers[0].offerId;
const hold=async(c,key=KEY)=>c.hold(input(await offer(c)),key);
test('contract 1: missing/short token is rejected locally; invalid long token returns provider 401',async()=>{
 const m=mockProvider();for(const token of ['',undefined,'short'])await assert.rejects(make(m,{token}).capabilities(),err(401,'UNAUTHORIZED'));
 assert.equal(m.calls.length,0);await assert.rejects(make(m,{token:'invalid-fixture-token-123456789'}).capabilities(),err(401,'UNAUTHORIZED'));assert.equal(m.calls.length,1);
});
test('contract 2: canonical offers for all providers, nullable coordinates and exact dates',async()=>{
 for(const provider of ['hotel','wisata','transport']){
  const m=mockProvider(provider),c=make(m,{provider}),cap=await c.capabilities(),o=await c.offers({...query,regionId:'diy:kabupaten-sleman',limit:1});
  assert.equal(cap.provider,provider);assert.equal(cap.contract,'0.2.0');assert.equal(o.offers.length,1);assert.deepEqual(o.offers[0].location,{lat:null,lng:null});assert.equal(o.offers[0].period.startDate,query.startDate);assert.equal(o.offers[0].period.endDate,provider==='wisata'?query.startDate:query.endDate);assert.equal(o.offers[0].currency,'IDR');assert.equal(m.calls[1].headers.get('Authorization'),'Bearer '+TOKEN);assert.equal(m.calls[1].redirect,'error');assert.equal(new URLSearchParams(m.calls[1].search).get('limit'),'1');
 }
});
test('contract 3: POST holds uses 201, exact body and UTC expiry',async()=>{
 const m=mockProvider(),c=make(m),id=await offer(c),r=await c.hold(input(id),KEY);
 assert.equal(r.reservationState,'awaiting_payment');assert.equal(r.expiresAt,'2026-12-01T03:15:00.000Z');assert.equal(m.remaining(),1);assert.equal(m.calls.at(-1).headers.get('Idempotency-Key'),KEY);assert.deepEqual(m.calls.at(-1).body,input(id));
});
test('contract 4: same idempotency key and body replay 200 without additional stock',async()=>{
 const m=mockProvider(),c=make(m),body=input(await offer(c)),a=await c.hold(body,KEY),b=await c.hold(body,KEY);
 assert.deepEqual(a,b);assert.equal(m.remaining(),1);
 await assert.rejects(c.hold({...body,notes:'changed'},KEY),err(409,'IDEMPOTENCY_CONFLICT',true));assert.equal(m.remaining(),1);
});
test('contract 5: quantity over stock returns NOT_AVAILABLE, invalid offer returns 422',async()=>{
 const m=mockProvider('transport',1),c=make(m),o=await c.offers({...query,quantity:2});
 await assert.rejects(c.hold(input(o.offers[0].offerId,{quantity:2}),KEY),err(409,'NOT_AVAILABLE'));assert.equal(m.remaining(),1);
 await assert.rejects(c.hold(input('unknown-opaque'),KEY),err(422,'INVALID_OFFER'));
});
test('contract 6: confirm returns reserved and voucher.code, separate payment, repeat is identical',async()=>{
 const m=mockProvider(),c=make(m),h=await hold(c),a=await c.confirm(h.holdId),b=await c.confirm(h.holdId);
 assert.deepEqual(a,b);assert.equal(a.reservationState,'reserved');assert.equal(a.paymentState,'unpaid');assert.match(a.voucher.code,/^V-/);assert.equal((await c.getHold(h.holdId)).reservationState,'reserved');
 await assert.rejects(c.release(h.holdId),err(409,'ALREADY_CONFIRMED'));assert.equal(m.remaining(),1);
});
test('contract 7: release twice returns cancelled and restores stock only once',async()=>{
 const m=mockProvider(),c=make(m),h=await hold(c),a=await c.release(h.holdId),b=await c.release(h.holdId);
 assert.deepEqual(a,b);assert.equal(a.reservationState,'cancelled');assert.equal(m.remaining(),2);await assert.rejects(c.confirm(h.holdId),err(409,'HOLD_RELEASED'));
});
test('contract 8: expired hold no longer consumes stock and confirm rejects',async()=>{
 const m=mockProvider(),c=make(m),h=await hold(c);m.advance(15*60000);
 assert.equal((await c.getHold(h.holdId)).reservationState,'expired');assert.equal(m.remaining(),2);await assert.rejects(c.confirm(h.holdId),err(409,'HOLD_EXPIRED'));assert.equal((await c.offers(query)).offers[0].remaining,2);
});
test('only owner can GET hold; no leaked upstream message or token',async()=>{
 const m=mockProvider(),c=make(m),h=await hold(c);await assert.rejects(make(m,{token:OTHER}).getHold(h.holdId),err(404,'NOT_FOUND'));
 const leak=make({fetcher:async()=>new Response(JSON.stringify({code:TOKEN,message:'Fixture User '+TOKEN}),{status:500})});
 await assert.rejects(leak.capabilities(),e=>e.code==='UPSTREAM_HTTP_ERROR'&&!e.message.includes(TOKEN)&&!e.message.includes('Fixture User'));
});
test('invalid dates, rental >30 days, limit, region, unsafe paths and consent fail before fetch',()=>{
 const m=mockProvider(),c=make(m);
 for(const q of [{...query,startDate:'2026-02-30'},{...query,endDate:'2027-02-01'},{...query,limit:21},{...query,regionId:'Jogja'},{...query,quantity:0}])assert.throws(()=>c.offers(q),err(400,'INVALID_REQUEST'));
 assert.throws(()=>c.hold(input('a',{consent:false}),KEY),err(400,'CONSENT_REQUIRED'));
 assert.throws(()=>c.hold(input('a'),'short'),err(400,'INVALID_REQUEST'));
 assert.throws(()=>c.getHold('..'),err(400,'INVALID_REQUEST'));
 assert.throws(()=>make(m,{baseUrl:'http://fixture.invalid'}),/Invalid HTTPS/);
 assert.throws(()=>make(m,{baseUrl:'https://user:pass@fixture.invalid'}),/Invalid HTTPS/);assert.equal(m.calls.length,0);
});
test('hotel exclusive and rental inclusive date rules',async()=>{
 const m=mockProvider(),c=make(m);
 await c.offers({startDate:'2026-12-01',endDate:'2026-12-30'});
 assert.throws(()=>c.offers({startDate:'2026-12-01',endDate:'2026-12-31'}),err(400,'INVALID_REQUEST'));
 const hotel=make(mockProvider('hotel'),{provider:'hotel'});assert.throws(()=>hotel.offers({startDate:'2026-12-01',endDate:'2026-12-01'}),err(400,'INVALID_REQUEST'));
 const wisata=make(mockProvider('wisata'),{provider:'wisata'});assert.equal((await wisata.offers({startDate:'2026-12-12'})).offers[0].period.endDate,'2026-12-12');
});
test('hold request strips unapproved fields and keeps optional email out when absent',async()=>{
 const m=mockProvider(),c=make(m),id=await offer(c);
 await c.hold({...input(id),unexpected:'secret',customer:{name:'Fixture',phone:'0800000',address:'private'}},KEY);
 const b=m.calls.at(-1).body;assert.equal(b.unexpected,undefined);assert.deepEqual(b.customer,{name:'Fixture',phone:'0800000'});assert.equal(b.notes,undefined);
});
test('bad version, wrong provider, draft flat offer, bad currency, oversized response fail closed',async()=>{
 const m=mockProvider(),c=make(m);
 for(const patch of [{contract:'0.1.1'},{provider:'hotel'}]){
  const client=make({fetcher:async(u,i)=>{const r=await m.fetcher(u,i);return new Response(JSON.stringify({...await r.json(),...patch}))}});
  await assert.rejects(client.capabilities(),err(502,'INVALID_PROVIDER_RESPONSE'));
 }
 for(const patch of [{period:undefined,startDate:query.startDate},{currency:'USD'},{totalPrice:1.5},{offerId:''}]){
  const client=make({fetcher:async(u,i)=>{const r=await m.fetcher(u,i),b=await r.json();b.offers[0]={...b.offers[0],...patch};return new Response(JSON.stringify(b))}});
  await assert.rejects(client.offers(query),err(502,'INVALID_PROVIDER_RESPONSE'));
 }
 await assert.rejects(make({fetcher:async()=>new Response('x'.repeat(2_000_001))}).capabilities(),err(502,'INVALID_PROVIDER_RESPONSE'));
});
test('network and timeout mutation are UNKNOWN, no retry, GET timeout not a mutation',async()=>{
 let count=0;const c=make({fetcher:async()=>{count++;throw Error('private transport error '+TOKEN)}});
 await assert.rejects(c.hold(input('a'),KEY),err(502,'UPSTREAM_UNREACHABLE',true));assert.equal(count,1);
 const hanging=make({fetcher:()=>new Promise(()=>{})},{timeoutMs:10,capabilitiesTimeoutMs:10});
 await assert.rejects(hanging.confirm('H-1'),err(504,'UPSTREAM_TIMEOUT',true));
 await assert.rejects(hanging.capabilities(),err(504,'UPSTREAM_TIMEOUT'));
});
test('lost hold response: client never retries automatically; explicit same-key replay recovers fixture hold',async()=>{
 const m=mockProvider();let lose=true;const c=make({fetcher:async(u,i)=>{const r=await m.fetcher(u,i);if(i.method==='POST'&&lose){lose=false;throw Error('response lost')}return r}});
 const b=input(await offer(c));await assert.rejects(c.hold(b,KEY),err(502,'UPSTREAM_UNREACHABLE',true));assert.equal(m.remaining(),1);assert.equal(m.calls.filter(x=>x.method==='POST').length,1);
 const h=await c.hold(b,KEY);assert.equal(h.reservationState,'awaiting_payment');assert.equal(m.remaining(),1);
});
test('malformed successful mutation is UNKNOWN and wrong voucher field not silently mapped',async()=>{
 const m=mockProvider(),c=make(m),h=await hold(c);
 const bad=make({fetcher:async()=>new Response(JSON.stringify({holdId:h.holdId,reservationState:'reserved',paymentState:'unpaid',voucher:{bookingId:'legacy',note:''}}))});
 await assert.rejects(bad.confirm(h.holdId),err(502,'INVALID_PROVIDER_RESPONSE',true));
 await assert.rejects(make({fetcher:async()=>new Response('not JSON',{status:201})}).hold(input('a'),KEY),err(502,'INVALID_PROVIDER_RESPONSE',true));
});
test('nested documented error envelope supported; optional mutation keys are stable if supplied',async()=>{
 const c=make({fetcher:async()=>new Response(JSON.stringify({error:{code:'HOLD_EXPIRED',message:'fixture'}}),{status:409})});
 await assert.rejects(c.confirm('H-1'),err(409,'HOLD_EXPIRED'));
 const m=mockProvider(),a=make(m),h=await hold(a);await a.confirm(h.holdId,KEY);assert.equal(m.calls.at(-1).headers.get('Idempotency-Key'),KEY);
});
test('I1 is isolated from production route and legacy adapters',()=>{
 for(const f of ['index.ts','orders.ts','provider.ts','plans.ts','packages.ts'])assert.doesNotMatch(readFileSync(new URL('../src/'+f,import.meta.url),'utf8'),/from\s+['"][^'"]*interop\.ts/);
});
