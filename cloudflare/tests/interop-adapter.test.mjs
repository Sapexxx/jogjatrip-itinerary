import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProviderAdapter,itemToOfferQuery} from '../src/interop-adapter.ts';
import {catalog} from '../src/provider.ts';
import {mockProvider,TOKEN} from './fixtures/interop-provider.mjs';
const hotel={type:'hotel',hotelId:'H-01',roomId:'ROOM-01',checkIn:'2026-12-12',checkOut:'2026-12-14',guests:3};
const wisata={type:'wisata',destinationId:101,visitDate:'2026-12-13',quantity:2,tier:'plus'};
const transport={type:'transport',vehicleId:'R-01',startDate:'2026-12-12',endDate:'2026-12-14',withDriver:true};
const all=[hotel,wisata,transport];
const config={HOTEL_API_URL:'https://hotel.fixture.invalid',WISATA_API_URL:'https://wisata.fixture.invalid',TRANSPORT_API_URL:'https://transport.fixture.invalid',HOTEL_PARTNER_TOKEN:TOKEN,WISATA_PARTNER_TOKEN:TOKEN,TRANSPORT_PARTNER_TOKEN:TOKEN,INTEROP_HOLDS:'true',BOOKING_ENABLED:'false'};
const make=(changes={},policy={},hook)=>{
 const mocks=Object.fromEntries(['hotel','wisata','transport'].map(k=>[k,mockProvider(k,5)])),calls=[];
 const fetcher=async(u,i)=>{const kind=new URL(u).hostname.split('.')[0];calls.push({kind,method:i.method,url:u});const next=()=>mocks[kind].fetcher(u,i);return hook?hook(kind,u,i,next):next()};
 return {adapter:createProviderAdapter({...config,...changes},fetcher,policy),mocks,calls};
};
const req=(items=all,extra={})=>({items,requestedMode:'CONTRACT_0_2',...extra});
const patch=async(next,modify)=>{const r=await next(),data=await r.json();return new Response(JSON.stringify(modify(data)),{status:r.status})};
const capPatch=(kind,u,i,next,changes)=>u.endsWith('/capabilities')?patch(next,d=>({...d,...changes})):next();
// Synthetic proof only: a trusted fixture mapping explicitly matches the original selection.
// No production verifier, no reliance on attributes.
const proof={resolveResourceId:()=> 'R-01',verifySelection:(item,o)=>o.resourceId==='R-01'&&(
 item.type==='hotel'?item.hotelId==='H-01'&&item.roomId==='ROOM-01'&&item.guests===3:
 item.type==='wisata'?item.destinationId===101&&item.tier==='plus':
 item.vehicleId==='R-01'&&item.withDriver===true)};
test('I2: feature flag absent/false/other values fail closed without requests',async()=>{
 for(const flag of [undefined,'false','TRUE','1']){const {adapter,calls}=make({INTEROP_HOLDS:flag});assert.equal((await adapter.detect('hotel')).reason,'FEATURE_DISABLED');assert.equal((await adapter.chooseMode(req())).mode,'BLOCKED');assert.equal(calls.length,0)}
});
test('I2: capability detection queries only required providers; booking gate remains false',async()=>{
 const {adapter,calls}=make();const r=await adapter.chooseMode(req([transport]));
 assert.equal(r.mode,'CONTRACT_0_2');assert.equal(r.reason,'CAPABILITIES_READY');assert.equal(r.bookingEnabled,false);assert.equal(calls.length,1);assert.equal(calls[0].kind,'transport');assert.equal(calls[0].method,'GET');
 assert.equal(r.capabilities[0].capabilities.holdTtlMinutes,15);
});
test('I2: all provider capabilities supported produces a single contract mode',async()=>{
 const {adapter,calls}=make();const d=await adapter.chooseMode(req());assert.equal(d.mode,'CONTRACT_0_2');assert.deepEqual(d.capabilities.map(x=>x.provider),['hotel','wisata','transport']);assert.equal(calls.length,3);
});
test('I2: holds false, durable false, missing entity, zero TTL block full package',async()=>{
 for(const [changes,reason] of [[{holds:false},'HOLDS_UNSUPPORTED'],[{durableStorage:false},'DURABILITY_UNVERIFIED'],[{entityTypes:['transport_trip']},'INVALID_CAPABILITIES'],[{entityTypes:['lodging']},'ENTITY_UNSUPPORTED'],[{holdTtlMinutes:0},'INVALID_CAPABILITIES']]){
  const {adapter,calls}=make({}, {allowLegacy:true},(k,u,i,next)=>k==='wisata'?capPatch(k,u,i,next,changes):next());
  const d=await adapter.prepareCheckout(req());assert.equal(d.decision.mode,'BLOCKED');assert.equal(d.decision.capabilities.find(x=>x.provider==='wisata').reason,reason);assert.equal(d.offers.length,0);assert.equal(calls.length,3);assert.ok(calls.every(c=>c.url.endsWith('/capabilities')));
 }
});
test('I2: missing token, malformed URL and short token never contact provider',async()=>{
 for(const [changes,reason] of [[{TRANSPORT_PARTNER_TOKEN:undefined},'MISSING_TOKEN'],[{TRANSPORT_PARTNER_TOKEN:'short'},'MISSING_TOKEN'],[{TRANSPORT_API_URL:'https://user:pass@transport.fixture.invalid'},'MISSING_CONFIGURATION']]){
  const {adapter,calls}=make(changes);assert.equal((await adapter.detect('transport')).reason,reason);assert.equal(calls.length,0);
 }
});
test('I2: distinguishes auth failure, missing endpoint, invalid schema and outage',async()=>{
 for(const [status,body,reason] of [[401,{code:'UNAUTHORIZED'},'AUTH_FAILED'],[404,{code:'NOT_FOUND'},'UNSUPPORTED_ENDPOINT'],[503,{code:'UPSTREAM'},'PROVIDER_UNAVAILABLE'],[200,{contract:'0.1.1'},'INVALID_CAPABILITIES']]){
  const {adapter}=make({}, {},()=>new Response(JSON.stringify(body),{status}));const d=await adapter.detect('transport');assert.equal(d.reason,reason);assert.equal(d.eligible,false);assert.ok(!JSON.stringify(d).includes(TOKEN));
 }
});
test('I2: timeout capability is unavailable, no automatic legacy fallback',async()=>{
 const {adapter,calls}=make({}, {allowLegacy:true,capabilitiesTimeoutMs:10},()=>new Promise(()=>{}));const d=await adapter.chooseMode(req([transport]));assert.equal(d.mode,'BLOCKED');assert.equal(d.capabilities[0].reason,'PROVIDER_UNAVAILABLE');assert.equal(calls.length,1);
});
test('I2: legacy needs explicit request and server policy; transport legacy needs no token',async()=>{
 const x=make({INTEROP_HOLDS:'false',TRANSPORT_PARTNER_TOKEN:undefined},{allowLegacy:true});
 const d=await x.adapter.chooseMode(req([transport],{requestedMode:'LEGACY'}));assert.equal(d.mode,'LEGACY');assert.equal(d.reason,'LEGACY_EXPLICIT');assert.equal(d.bookingEnabled,false);assert.equal(x.calls.length,0);
 assert.equal((await make().adapter.chooseMode(req([transport],{requestedMode:'LEGACY'}))).reason,'LEGACY_NOT_ALLOWED');
 assert.equal((await make({HOTEL_PARTNER_TOKEN:undefined},{allowLegacy:true}).adapter.chooseMode(req([hotel],{requestedMode:'LEGACY'}))).reason,'LEGACY_NOT_CONFIGURED');
});
test('I2: no new execution mode after mutation started, even explicit legacy',async()=>{
 const {adapter,calls}=make({}, {allowLegacy:true});for(const requestedMode of ['LEGACY','CONTRACT_0_2']){
  const d=await adapter.chooseMode(req(all,{requestedMode,mutationStarted:true}));assert.equal(d.mode,'BLOCKED');assert.equal(d.reason,'MUTATION_ALREADY_STARTED');
 }assert.equal(calls.length,0);
});
test('I2: duplicate provider blocked before any capability calls',async()=>{
 const {adapter,calls}=make();const d=await adapter.chooseMode(req([transport,{...transport,vehicleId:'R-02'}]));assert.equal(d.reason,'DUPLICATE_PROVIDER');assert.equal(calls.length,0);
});
test('I2: invalid cart, fractional quantity, guests and empty room are rejected',async()=>{
 const {adapter,calls}=make();for(const items of [[],[{...wisata,quantity:1.5}],[{...hotel,guests:'3'}],[{...hotel,roomId:''}],[{...transport,withDriver:'true'}]])assert.equal((await adapter.chooseMode(req(items))).reason,'INVALID_ITEMS');assert.equal(calls.length,0);
});
test('I2: ServiceItem date and quantity mapping, no unsupported option/filter fields',()=>{
 assert.deepEqual(itemToOfferQuery(hotel),{provider:'hotel',entityType:'lodging',query:{startDate:hotel.checkIn,endDate:hotel.checkOut,quantity:1,limit:20}});
 assert.deepEqual(itemToOfferQuery(wisata).query,{startDate:wisata.visitDate,quantity:2,limit:20});
 assert.deepEqual(itemToOfferQuery(transport).query,{startDate:transport.startDate,endDate:transport.endDate,quantity:1,limit:20,withDriver:true});
});
test('I2: exact authoritative fixture selections produce three canonical offers without mutations',async()=>{
 const {adapter,calls}=make({},proof);const r=await adapter.prepareCheckout(req());
 assert.equal(r.decision.mode,'CONTRACT_0_2');assert.equal(r.preflightComplete,true);assert.equal(r.bookingEnabled,false);
 assert.deepEqual(r.offers.map(x=>x.offer.quantity),[1,2,1]);assert.deepEqual(r.offers.map(x=>x.offer.totalPrice),[10000,20000,10000]);
 assert.ok(r.offers.every(x=>x.ok&&x.offer.offerId.startsWith('opaque-fixture-')&&x.offer.currency==='IDR'));
 assert.equal(calls.length,6);assert.ok(calls.every(x=>x.method==='GET'));assert.ok(calls.slice(0,3).every(x=>x.url.endsWith('/capabilities')));
 assert.ok(!JSON.stringify(r).includes(TOKEN));assert.ok(!JSON.stringify(r).includes('attributes'));
});
test('I2: no verifier or hotel mapping means blocked selection, never infer material choice from attributes',async()=>{
 const {adapter}=make();let r=await adapter.prepareCheckout(req([hotel]));assert.deepEqual(r.offers,[{ok:false,reason:'IDENTITY_UNVERIFIED'}]);assert.equal(r.preflightComplete,false);
 const y=make({}, {},(k,u,i,next)=>u.includes('/offers?')?patch(next,d=>({...d,offers:d.offers.map(o=>({...o,attributes:{withDriver:true}}))})):next());
 r=await y.adapter.prepareCheckout(req([transport]));assert.equal(r.offers[0].reason,'SELECTION_UNVERIFIED');assert.equal(r.preflightComplete,false);
});
test('I2: no exact resource, unavailable stock and ambiguous offers block; no substitution',async()=>{
 for(const [modify,reason] of [[d=>({...d,offers:d.offers.map(o=>({...o,resourceId:'different'}))}),'OFFER_NOT_FOUND'],[d=>({...d,offers:d.offers.map(o=>({...o,available:false,remaining:0}))}),'OFFER_UNAVAILABLE'],[d=>({...d,offers:[...d.offers,{...d.offers[0],offerId:'another-opaque'}]}),'AMBIGUOUS_OFFER']]){
  const {adapter,calls}=make({},proof,(k,u,i,next)=>u.includes('/offers?')?patch(next,modify):next());const r=await adapter.prepareCheckout(req([transport]));assert.equal(r.preflightComplete,false);assert.equal(r.offers[0].reason,reason);assert.ok(calls.every(x=>x.method==='GET'));
 }
});
test('I2: verifier false/throw or wrong material choice fails closed',async()=>{
 for(const verifySelection of [()=>false,()=>{throw Error(TOKEN)},proof.verifySelection]){
  const {adapter}=make({}, {...proof,verifySelection});const r=await adapter.prepareCheckout(req([{...transport,withDriver:false}]));
  assert.equal(r.offers[0].reason,'SELECTION_UNVERIFIED');assert.equal(r.preflightComplete,false);assert.ok(!JSON.stringify(r).includes(TOKEN));
 }
});
test('I2: failed offer response is never used, no fallback, partial preflight not complete',async()=>{
 const {adapter,calls}=make({}, {...proof,allowLegacy:true},(k,u,i,next)=>k==='wisata'&&u.includes('/offers?')?new Response('offline',{status:503}):next());
 const r=await adapter.prepareCheckout(req());assert.equal(r.decision.mode,'CONTRACT_0_2');assert.equal(r.preflightComplete,false);assert.equal(r.offers[1].reason,'OFFER_REQUEST_FAILED');assert.ok(calls.every(x=>x.method==='GET'));
});
test('I2: booking flag is independent and only true for literal true; no mutation even when true',async()=>{
 const {adapter,calls}=make({BOOKING_ENABLED:'true'},proof);const r=await adapter.prepareCheckout(req([transport]));assert.equal(r.bookingEnabled,true);assert.equal(r.preflightComplete,true);assert.ok(calls.every(x=>x.method==='GET'));
});
test('I2: snapshot item and provider configuration before async preflight',async()=>{
 const env={...config},item={...transport};let release;const gate=new Promise(r=>{release=r}),m=mockProvider('transport',5);
 const adapter=createProviderAdapter(env,async(u,i)=>{await gate;return m.fetcher(u,i)},proof);
 const pending=adapter.prepareCheckout(req([item]));item.withDriver=false;env.INTEROP_HOLDS='false';release();
 const r=await pending;assert.equal(r.preflightComplete,true);assert.equal(r.offers[0].offer.resourceId,'R-01');
});
test('I2: legacy catalog remains readable for all three providers with Contract 0.2 flag absent',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(u,i)=>{const p=new URL(u).pathname;calls.push({p,method:i.method});return new Response(JSON.stringify(p.includes('/rentals/vehicles')?{vehicles:[{id:'R-01'}],startDate:transport.startDate,endDate:transport.endDate}: [{id:'fixture'}]))};
 try{
  const env={...config,INTEROP_HOLDS:undefined};
  assert.equal((await catalog(env,'hotels')).items.length,1);assert.equal((await catalog(env,'destinations')).items.length,1);
  assert.equal((await catalog(env,'vehicles','',{startDate:transport.startDate,endDate:transport.endDate,withDriver:'true'})).items.length,1);
  assert.deepEqual(calls.map(x=>x.p),['/api/v1/hotels','/api/v1/destinations','/api/v1/rentals/vehicles']);assert.ok(calls.every(x=>x.method==='GET'));
 }finally{globalThis.fetch=original}
});
test('I2: no wiring into runtime routes or booking; production booking stays false',()=>{
 for(const f of ['index.ts','orders.ts','provider.ts','plans.ts','packages.ts'])assert.doesNotMatch(readFileSync(new URL('../src/'+f,import.meta.url),'utf8'),/from\s+['"][^'"]*interop-adapter\.ts/);
 const wrangler=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');assert.match(wrangler,/"BOOKING_ENABLED"\s*:\s*"false"/);assert.doesNotMatch(wrangler,/"INTEROP_HOLDS"\s*:\s*"true"/);
});

test('final contract: quantity above advertised max blocks before offers; transport driver is forwarded',async()=>{
 const a=make({},proof,(k,u,i,next)=>k==='wisata'?capPatch(k,u,i,next,{maxQuantity:1}):next());
 const b=await a.adapter.prepareCheckout(req());assert.equal(b.decision.mode,'BLOCKED');assert.equal(b.decision.capabilities.find(c=>c.provider==='wisata').reason,'QUANTITY_UNSUPPORTED');assert.ok(a.calls.every(c=>c.url.endsWith('/capabilities')));
 const x=make({},proof);assert.equal((await x.adapter.prepareCheckout(req([transport]))).preflightComplete,true);
 assert.equal(new URL(x.calls.find(c=>c.url.includes('/offers?')).url).searchParams.get('withDriver'),'true');
});
