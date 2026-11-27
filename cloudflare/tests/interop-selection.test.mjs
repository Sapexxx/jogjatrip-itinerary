import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaterialSelectionPolicy} from '../src/interop-selection.ts';
import {createProviderAdapter} from '../src/interop-adapter.ts';
import {mockProvider,TOKEN} from './fixtures/interop-provider.mjs';
const hotel={type:'hotel',hotelId:'H-01',roomId:'ROOM-01',checkIn:'2026-12-12',checkOut:'2026-12-14',guests:3};
const wisata={type:'wisata',destinationId:101,visitDate:'2026-12-13',quantity:2,tier:'base'};
const transport={type:'transport',vehicleId:'R-01',startDate:'2026-12-12',endDate:'2026-12-14',withDriver:true};
const config={HOTEL_API_URL:'https://hotel.fixture.invalid',WISATA_API_URL:'https://wisata.fixture.invalid',TRANSPORT_API_URL:'https://transport.fixture.invalid',HOTEL_PARTNER_TOKEN:TOKEN,WISATA_PARTNER_TOKEN:TOKEN,TRANSPORT_PARTNER_TOKEN:TOKEN,INTEROP_HOLDS:'true',BOOKING_ENABLED:'false'};
const json=(b,status=200)=>new Response(JSON.stringify(b),{status,headers:{'Content-Type':'application/json'}});
function setup(modify=(k,b)=>b,modifyOffer=(k,b)=>b){
 const mocks=Object.fromEntries(['hotel','wisata','transport'].map(k=>[k,mockProvider(k,5)])),calls=[];
 const fetcher=async(url,init)=>{
  const u=new URL(url),k=u.hostname.split('.')[0];calls.push({k,path:u.pathname,method:init.method,query:u.searchParams});
  assert.equal(init.method,'GET');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+TOKEN);assert.equal(init.redirect,'error');
  if(u.pathname.startsWith('/api/v1/interop/')){
   const r=await mocks[k].fetcher(url,init);if(!u.pathname.endsWith('/offers'))return r;
   const b=await r.json();b.offers=b.offers.map(o=>modifyOffer(k,{...o,resourceId:k==='hotel'?'ROOM-01':k==='wisata'?'101':'R-01',attributes:{untrusted:true}}));return json(b);
  }
  if(k==='hotel'){assert.equal(u.pathname,'/api/v1/hotels/H-01/availability');assert.equal(u.searchParams.get('checkIn'),hotel.checkIn);return json(modify(k,{hotelId:'H-01',checkIn:hotel.checkIn,checkOut:hotel.checkOut,rooms:[{roomId:'ROOM-01',capacity:3,unitsAvailable:1,totalPrice:10000}]}))}
  if(k==='wisata'){assert.equal(u.pathname,'/api/v1/destinations/101/availability');assert.equal(u.searchParams.get('tier'),'base');assert.equal(u.searchParams.get('qty'),'2');return json(modify(k,{destination_id:101,date:wisata.visitDate,qty:2,available:true,remaining:5,currency:'IDR',total:20000}))}
  assert.equal(u.pathname,'/api/v1/rentals/vehicles');assert.equal(u.searchParams.get('withDriver'),'true');
  return json(modify(k,{startDate:transport.startDate,endDate:transport.endDate,withDriver:true,vehicles:[{id:'R-01',available:true,unitsAvailable:1,totalPrice:10000,withDriver:true}]}));
 };
 const policy=createMaterialSelectionPolicy(config,fetcher);
 const adapter=createProviderAdapter(config,fetcher,{...policy,now:()=>Date.parse('2026-12-01T03:00:00Z')});
 return {policy,adapter,calls};
}
const req=items=>({items,requestedMode:'CONTRACT_0_2'});
test('server-owned verifier: all 3 material selections match independent availability, no provider POST',async()=>{
 const s=setup();const r=await s.adapter.prepareCheckout(req([hotel,wisata,transport]));
 assert.equal(r.preflightComplete,true);assert.deepEqual(r.offers.map(o=>o.offer.resourceId),['ROOM-01','101','R-01']);
 assert.equal(s.calls.length,9);assert.equal(r.bookingEnabled,false);assert.ok(s.calls.every(c=>c.method==='GET'));
 assert.equal(s.calls.find(c=>c.k==='transport'&&c.path.endsWith('/offers')).query.get('withDriver'),'true');
});
test('hotel verifier rejects wrong room, capacity, availability and price despite matching display attributes',async()=>{
 for(const patch of [{roomId:'OTHER'},{capacity:2},{unitsAvailable:0},{totalPrice:9999}]){
  const s=setup((k,b)=>k==='hotel'?{...b,rooms:[{...b.rooms[0],...patch}]}:b,(k,b)=>({...b,attributes:{roomId:'ROOM-01',hotelId:'H-01',capacity:99}}));
  const r=await s.adapter.prepareCheckout(req([hotel]));assert.equal(r.preflightComplete,false);assert.equal(r.offers[0].reason,'SELECTION_UNVERIFIED');
 }
});
test('wisata verifier blocks unsupported plus tier, wrong destination, date, quantity or price',async()=>{
 const s=setup();const plus=await s.adapter.prepareCheckout(req([{...wisata,tier:'plus'}]));assert.equal(plus.preflightComplete,false);assert.equal(s.calls.filter(c=>c.path.endsWith('/offers')).length,0);
 for(const p of [{destination_id:102},{date:'2026-12-14'},{qty:1},{total:10000},{remaining:1}]){
  const x=setup((k,b)=>({...b,...p}));const r=await x.adapter.prepareCheckout(req([wisata]));assert.equal(r.preflightComplete,false);
 }
});
test('transport verifier rejects mismatched driver, dates, stock, ID, price or duplicate rows',async()=>{
 for(const mutate of [b=>({...b,withDriver:false}),b=>({...b,endDate:'2026-12-15'}),b=>({...b,vehicles:[{...b.vehicles[0],withDriver:false}]}),b=>({...b,vehicles:[{...b.vehicles[0],unitsAvailable:0}]}),b=>({...b,vehicles:[{...b.vehicles[0],id:'R-02'}]}),b=>({...b,vehicles:[{...b.vehicles[0],totalPrice:999}]}),b=>({...b,vehicles:[...b.vehicles,...b.vehicles]})]){
  const s=setup((k,b)=>mutate(b),(k,b)=>({...b,attributes:{withDriver:true}}));const r=await s.adapter.prepareCheckout(req([transport]));assert.equal(r.preflightComplete,false);
 }
});
test('malformed/missing provider evidence and unavailable trusted config fail closed',async()=>{
 const s=setup(()=>null);assert.equal((await s.adapter.prepareCheckout(req([hotel]))).preflightComplete,false);
 const policy=createMaterialSelectionPolicy({...config,HOTEL_PARTNER_TOKEN:undefined},()=>{throw Error('must not call')});
 const o={provider:'hotel',entityType:'lodging',resourceId:'ROOM-01',available:true,currency:'IDR',totalPrice:10000,remaining:1,period:{startDate:hotel.checkIn,endDate:hotel.checkOut}};
 assert.equal(await policy.verifySelection(hotel,o),false);
});
