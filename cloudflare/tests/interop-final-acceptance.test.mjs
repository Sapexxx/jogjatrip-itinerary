import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker from '../src/index.ts';
import {createInternalCheckoutBridge} from '../src/interop-checkout-bridge.ts';
import {preparationLockFor} from '../src/interop-plan-preparation.ts';
import {sha256} from '../src/core.ts';
import {mockProvider,TOKEN} from './fixtures/interop-provider.mjs';
await import('../web/interop-checkout.js');
const json=(b,status=200)=>new Response(JSON.stringify(b),{status,headers:{'Content-Type':'application/json'}});
const kinds=['hotel','transport','wisata'];
const date=(now,days)=>new Date(now+days*86400000).toISOString().slice(0,10);
async function setup(t,{changedPrice=false,dropD1Ack=false}={}){
 const now=Date.now(),start=date(now,10),end=date(now,12),visit=date(now,11);
 const items=[
  {type:'hotel',hotelId:'H-01',roomId:'ROOM-01',checkIn:start,checkOut:end,guests:2},
  {type:'transport',vehicleId:'R-01',startDate:start,endDate:end,withDriver:true},
  {type:'wisata',destinationId:101,visitDate:visit,quantity:2,tier:'base'}
 ];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',d1Databases:{DB:'i6-final-local'}}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 for(const name of ['0001_init.sql','0002_interop_holds.sql']){
  const sql=readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
  for(const statement of sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 }
 const mocks=Object.fromEntries(kinds.map(k=>[k,mockProvider(k,5)]));
 for(const m of Object.values(mocks))m.advance(now-Date.parse('2026-12-01T03:00:00Z'));
 const trace=[];
 let drift=false;
 const providerFetch=async(url,init={})=>{
  const u=new URL(url),k=u.hostname.split('.')[0],method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
  assert.equal(u.origin,'https://'+k+'.fixture.invalid');assert.ok(kinds.includes(k));
  trace.push({k,path:u.pathname,method,body,key:new Headers(init.headers).get('Idempotency-Key')});
  if(u.pathname.startsWith('/api/v1/interop/')){
   assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+TOKEN);
   const r=await mocks[k].fetcher(url,init);
   if(!u.pathname.endsWith('/offers'))return r;
   const b=await r.json();b.offers=b.offers.map(o=>({...o,resourceId:k==='hotel'?'ROOM-01':k==='wisata'?'101':'R-01',attributes:{displayOnly:true}}));return json(b);
  }
  assert.equal(method,'GET');
  if(k==='hotel'){assert.equal(u.pathname,'/api/v1/hotels/H-01/availability');return json({hotelId:'H-01',checkIn:start,checkOut:end,rooms:[{roomId:'ROOM-01',capacity:2,unitsAvailable:mocks[k].remaining(),totalPrice:10000}]})}
  if(k==='transport'){assert.equal(u.pathname,'/api/v1/rentals/vehicles');assert.equal(u.searchParams.get('withDriver'),'true');return json({startDate:start,endDate:end,withDriver:true,vehicles:[{id:'R-01',available:true,unitsAvailable:mocks[k].remaining(),totalPrice:10000,withDriver:true}]})}
  assert.equal(u.pathname,'/api/v1/destinations/101/availability');assert.equal(u.searchParams.get('tier'),'base');assert.equal(u.searchParams.get('qty'),'2');
  return json({destination_id:101,date:visit,qty:2,available:true,remaining:mocks[k].remaining(),currency:'IDR',total:drift?21000:20000});
 };
 // Real Worker handler; provider I/O is restricted to fixture hosts.
 const original=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const u=new URL(typeof url==='string'||url instanceof URL?url:url.url);
  if(kinds.some(k=>u.hostname===k+'.fixture.invalid'))return providerFetch(url,init);
  if(['localhost','127.0.0.1','[::1]'].includes(u.hostname))return original(url,init);
  throw Error('Unexpected network destination');
 });
 let lost=false;
 const DB=dropD1Ack?{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){const b=stmt.bind(...args);return {first:(...x)=>b.first(...x),async run(){const result=await b.run();if(!lost&&sql.startsWith('INSERT INTO jt_checkout_requests')){lost=true;throw Error('Synthetic D1 acknowledgement lost')}return result}}}}}}:db;
 const env={DB,ASSETS:{fetch:async()=>new Response('assets')},INTEROP_HOLDS:'true',INTEROP_PREPARE_ENABLED:'true',BOOKING_ENABLED:'false',
  HOTEL_API_URL:'https://hotel.fixture.invalid',TRANSPORT_API_URL:'https://transport.fixture.invalid',WISATA_API_URL:'https://wisata.fixture.invalid',
  HOTEL_PARTNER_TOKEN:TOKEN,TRANSPORT_PARTNER_TOKEN:TOKEN,WISATA_PARTNER_TOKEN:TOKEN};
 const send=(path,init={},e=env)=>worker.fetch(new Request('https://app.fixture.invalid'+path,init),e);
 const activities=items.map((item,i)=>({type:item.type,title:'Synthetic '+item.type,date:item.type==='wisata'?visit:start,startTime:i===0?'09:00':i===1?'11:00':'13:00',endTime:i===0?'10:00':i===1?'12:00':'14:00',sourceItem:item}));
 const created=await send('/api/itineraries',{method:'POST',body:JSON.stringify({title:'Synthetic acceptance',startDate:start,endDate:end,activities})});
 assert.equal(created.status,201);const {itinerary,accessToken:planToken}=await created.json(),id=itinerary.id;
 const request=new Request('https://app.fixture.invalid/api/interop/itineraries/'+id+'/prepare',{headers:{'X-Plan-Token':planToken}});
 const quoted=await send('/api/itineraries/'+id+'/quote',{method:'POST',headers:{'X-Plan-Token':planToken},body:'{}'});
 assert.equal(quoted.status,200);const quote=await quoted.json();assert.equal(quote.available,true);assert.equal(quote.total,40000);drift=changedPrice;
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const manager=globalThis.JTInteropI5.createDraftManager(storage,webcrypto),token=manager.createToken(),input={scope:'plan:'+id,items,quote};
 const approval={planToken,accessToken:token,consent:true,priceAccepted:true,approvedTotal:quote.total,customer:{name:'Synthetic Acceptance',phone:'081234567890',email:'qa@example.test'}};
 const readStatus=async orderId=>(await send('/api/interop/checkouts/'+orderId,{headers:{'X-Interop-Token':token}})).json();
 const count=async table=>(await db.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n;
 return {db,env,send,trace,mocks,providerFetch,manager,storage,values,token,input,approval,id,request,readStatus,count};
}
const mutations=f=>f.trace.filter(x=>x.method==='POST');
test('I6 full local acceptance: consent, quote, Worker material preflight, lost reply recovery, private saga and public status',async t=>{
 const f=await setup(t),n=f.trace.length;
 await assert.rejects(f.manager.prepareServer(f.input,{...f.approval,consent:false},f.send));
 await assert.rejects(f.manager.prepareServer(f.input,{...f.approval,priceAccepted:false},f.send));
 assert.equal(f.trace.length,n);assert.equal(await f.count('jt_checkout_requests'),0);
 let preparedId;
 await assert.rejects(f.manager.prepareServer(f.input,f.approval,async(path,init)=>{
  const r=await f.send(path,init);assert.equal(r.status,201);const b=await r.json();assert.equal(b.bookingPerformed,false);preparedId=b.orderId;throw Error('Synthetic lost browser response');
 }));
 assert.ok(preparedId);assert.equal(await f.count('jt_checkout_requests'),1);assert.equal(await f.count('jt_interop_operations'),0);
 assert.equal(mutations(f).length,0);assert.equal(f.trace.length-n,9);
 const key=f.manager.get(f.input.scope).key;
 assert.equal(f.manager.get(f.input.scope).state,'UNKNOWN');
 const row=await f.db.prepare('SELECT access_hash,key_hash FROM jt_checkout_requests WHERE order_id=?').bind(preparedId).first();
 assert.equal(row.access_hash,await sha256(f.token));assert.equal(row.key_hash,await sha256(key));
 assert.ok(![...f.values.values()].join('').includes(f.token));
 const recovered=await globalThis.JTInteropI5.createDraftManager(f.storage,webcrypto).recoverServer(f.input.scope,f.approval.planToken,f.token,f.send);
 assert.equal(recovered.orderId,preparedId);assert.equal(recovered.status,'NOT_STARTED');assert.equal(f.trace.length-n,9);
 assert.equal((await f.send('/api/itineraries/'+f.id+'/book',{method:'POST',headers:{'X-Plan-Token':f.approval.planToken},body:'{}'})).status,503);
 assert.equal((await f.send('/api/interop/checkouts/'+preparedId+'/hold',{method:'POST',headers:{'X-Interop-Token':f.token}})).status,404);
 const args=[f.id,f.request,key,f.token],policy={authorize:(a,id)=>id===preparedId&&a==='HOLD'};
 const held=await createInternalCheckoutBridge({...f.env,BOOKING_ENABLED:'true'},f.providerFetch,policy).hold(...args);
 assert.equal(held.status,'AWAITING_CONFIRMATION');assert.equal(mutations(f).length,3);
 assert.equal((await f.readStatus(preparedId)).status,'AWAITING_CONFIRMATION');
 const holdCalls=mutations(f);assert.deepEqual(holdCalls.map(x=>x.k),kinds);assert.ok(holdCalls.every(x=>x.body.externalRef===preparedId&&x.body.consent===true));assert.equal(new Set(holdCalls.map(x=>x.key)).size,3);
 const confirmed=await createInternalCheckoutBridge({...f.env,BOOKING_ENABLED:'true'},f.providerFetch,{authorize:(a,id)=>id===preparedId&&a==='CONFIRM'}).confirm(...args);
 assert.equal(confirmed.status,'CONFIRMED');assert.equal(await f.count('jt_interop_operations'),6);assert.equal(mutations(f).length,6);
 const status=await f.readStatus(preparedId);assert.equal(status.status,'CONFIRMED');assert.equal(status.paymentVerified,false);assert.equal(status.bookingsAtomic,false);
 assert.deepEqual(status.items.map(x=>x.paymentState),['unpaid','unpaid','unpaid']);assert.doesNotMatch(JSON.stringify(status),/Synthetic Acceptance|081234567890|qa@example.test|opaque-fixture/);
 assert.deepEqual(kinds.map(k=>f.mocks[k].remaining()),[4,4,3]);
 assert.equal(await f.count('jt_checkout_requests'),1);
});
test('I6 full local acceptance: price disagreement blocks preparation, no provider mutation or retained lock',async t=>{
 const f=await setup(t,{changedPrice:true});
 let code;
 await assert.rejects(f.manager.prepareServer(f.input,f.approval,async(path,init)=>{const r=await f.send(path,init);code=(await r.clone().json()).error;return r}));
 assert.equal(code,'PREFLIGHT_NOT_VERIFIED');
 assert.equal(await f.count('jt_checkout_requests'),0);assert.equal(await f.count('jt_interop_operations'),0);assert.equal(mutations(f).length,0);
 assert.equal((await f.db.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,null);
});
test('I6 full local acceptance: lost D1 INSERT acknowledgement retains mutex and GET recovers same row',async t=>{
 const f=await setup(t,{dropD1Ack:true});
 let status;
 await assert.rejects(f.manager.prepareServer(f.input,f.approval,async(path,init)=>{const r=await f.send(path,init);status=r.status;return r}));
 assert.equal(status,503);
 const key=f.manager.get(f.input.scope).key;
 assert.equal(await f.count('jt_checkout_requests'),1);
 assert.equal((await f.db.prepare('SELECT order_lock FROM jt_plans WHERE id=?').bind(f.id).first()).order_lock,await preparationLockFor(key));
 const before=f.trace.length;
 const recovered=await f.manager.recoverServer(f.input.scope,f.approval.planToken,f.token,f.send);
 assert.equal(recovered.status,'NOT_STARTED');assert.equal(await f.count('jt_checkout_requests'),1);assert.equal(await f.count('jt_interop_operations'),0);assert.equal(f.trace.length,before);assert.equal(mutations(f).length,0);
});
