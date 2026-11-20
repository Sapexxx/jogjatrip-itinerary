import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
class MemoryD1 {
 constructor(){this.orders=new Map();this.plans=new Map()}
 prepare(sql){const db=this;return {bind(...args){return {async first(){if(sql.includes('FROM jt_orders')){const o=db.orders.get(args[0]);return o?{payload:o.payload,secret_hash:o.secret_hash}:null}if(sql.includes('FROM jt_plans')){const p=db.plans.get(args[0]);return p?{payload:p.payload,secret_hash:p.secret_hash,order_lock:p.order_lock}:null}throw Error('unknown first '+sql)},async run(){if(sql.startsWith('INSERT INTO jt_orders')){const [id,payload,hash,created,updated]=args;db.orders.set(id,{payload,secret_hash:hash,created_at:created,updated_at:updated});return {meta:{changes:1}}}if(sql.startsWith('INSERT INTO jt_plans')){const [id,payload,hash,updated]=args;db.plans.set(id,{...(db.plans.get(id)||{}),payload,secret_hash:hash,updated_at:updated});return {meta:{changes:1}}}if(sql.startsWith('UPDATE jt_plans SET order_lock=?')){let [lock,id]=args;let p=db.plans.get(id);if(!p||p.order_lock)return {meta:{changes:0}};p.order_lock=lock;return {meta:{changes:1}}}if(sql.startsWith('UPDATE jt_plans SET order_lock=NULL')){let [id,lock]=args,p=db.plans.get(id);if(p?.order_lock===lock){p.order_lock=null;return {meta:{changes:1}}}return {meta:{changes:0}}}throw Error('unknown run '+sql)}}}}
 }
}
const env={BOOKING_ENABLED:'true',DB:new MemoryD1(),HOTEL_API_URL:'https://hotel.test',WISATA_API_URL:'https://wisata.test',HOTEL_PARTNER_TOKEN:'test-secret',WISATA_PARTNER_TOKEN:'test-secret',ASSETS:{fetch:async()=>new Response('ok')}};
const originalFetch=globalThis.fetch;
let hotelStatus='CONFIRMED';
function mockFetch(url,opts={}){const u=new URL(url);let data;
 if(u.hostname==='hotel.test'){
  if(u.pathname==='/api/v1/hotels')data=[{hotelId:'H01',name:'Test Hotel',city:'Sleman'}];
  else if(u.pathname==='/api/v1/rooms')data=[{roomId:'R0101',hotelId:'H01',roomType:'Standard'}];
  else if(u.pathname.includes('/availability'))data={rooms:[{roomId:'R0101',unitsAvailable:2,capacity:2,totalPrice:300000}]};
  else if(u.pathname==='/api/v1/hotel-bookings')data={bookingId:'HB-MOCK1',status:'CONFIRMED'};
  else if(u.pathname.includes('hotel-bookings/'))data={status:hotelStatus};
 }else if(u.hostname==='wisata.test'){
  if(u.pathname==='/api/v1/destinations')data=[{id:1,name:'Destinasi Mock',region:'kabupaten-sleman'}];
  else if(u.pathname.includes('/availability'))data={available:true,total:20000};
  else if(u.pathname==='/api/v1/partner/bookings')data={code:'WB-MOCK1',status:'PAID'};
  else if(u.pathname.includes('/partner/bookings/'))data={status:'PAID'};
 }
 return Promise.resolve(new Response(JSON.stringify(data||{error:'missing'}),{status:data?200:404,headers:{'Content-Type':'application/json'}}));
}
async function send(path,method='GET',body,headers={}){let req=new Request('https://app.test'+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});let res=await worker.fetch(req,env);return {status:res.status,body:await res.json()}}
const item={type:'wisata',destinationId:1,visitDate:'2026-11-28',quantity:2,tier:'base',plannedStartTime:'10:30',plannedEndTime:'12:30'};
test('HTTP integration: catalog, recommendation, order book / sync / details with mock provider',async()=>{
 globalThis.fetch=mockFetch;
 try{
 let catalog=await send('/api/catalog/destinations');assert.equal(catalog.status,200);assert.equal(catalog.body.items[0].name,'Destinasi Mock');
 let rec=await send('/api/recommendations?hotelId=H01');assert.equal(rec.body.region,'Sleman');assert.equal(rec.body.destinations.length,1);
 let quote=await send('/api/quote','POST',{customer:{name:'Contoh',email:'demo@example.com'},items:[item]});assert.equal(quote.body.total,20000);
 let booked=await send('/api/book','POST',{customer:{name:'Contoh',email:'demo@example.com'},items:[item]});assert.equal(booked.status,200);assert.equal(booked.body.order.status,'CONFIRMED');assert.equal(booked.body.order.items[0].item.plannedStartTime,'10:30');
 let {id}=booked.body.order,token=booked.body.accessToken;
 let denied=await send('/api/orders/'+id);assert.equal(denied.status,403);
 let details=await send('/api/orders/'+id+'/details','GET',undefined,{'X-Order-Token':token});assert.equal(details.status,200);assert.equal(details.body.details[0].name,'Destinasi Mock');assert.equal(details.body.order.total,20000);
 }finally{globalThis.fetch=originalFetch}
});
test('HTTP integration: save itinerary and duplicate checkout prevention',async()=>{
 globalThis.fetch=mockFetch;
 try{
 let plan={title:'Kunjungan',startDate:'2026-11-28',endDate:'2026-11-30',activities:[{type:'wisata',title:'Destinasi Mock',date:'2026-11-28',startTime:'10:30',endTime:'12:30',sourceItem:item}]};
 let created=await send('/api/itineraries','POST',plan);assert.equal(created.status,201);
 let {id}=created.body.itinerary,token=created.body.accessToken,h={'X-Plan-Token':token};
 let checked=await send('/api/itineraries/'+id+'/quote','POST',{},h);assert.equal(checked.body.available,true);
 let booked=await send('/api/itineraries/'+id+'/book','POST',{customer:{name:'Contoh',email:'demo@example.com'}},h);assert.equal(booked.status,200);assert.equal(booked.body.order.items[0].bookingId,'WB-MOCK1');
 let repeat=await send('/api/itineraries/'+id+'/book','POST',{customer:{name:'Contoh',email:'demo@example.com'}},h);assert.equal(repeat.status,400);
 }finally{globalThis.fetch=originalFetch}
});
test('HTTP integration: curated package quote and booking returns audited discount',async()=>{
 globalThis.fetch=mockFetch;
 try{
 let r=await send('/api/packages');assert.equal(r.status,200);assert.equal(r.body.packages.length,2);
 let input={startDate:'2026-11-28',guests:2,selectedAddOns:[],schedules:{stay:{startTime:'16:00',endTime:'17:00'},keraton:{startTime:'10:00',endTime:'12:00'}},customer:{name:'Pelanggan',email:'demo@example.org'}};
 let quote=await send('/api/packages/jogja-klasik/quote','POST',input);assert.equal(quote.status,200);assert.equal(quote.body.available,true);assert.equal(quote.body.items.length,2);assert.ok(quote.body.pricing.bundleDiscount>0);
 let booked=await send('/api/packages/jogja-klasik/book','POST',input);assert.equal(booked.status,200);assert.equal(booked.body.order.status,'CONFIRMED');assert.equal(booked.body.order.items.length,2);assert.ok(booked.body.order.pricing.appliedDiscount>0)
 }finally{globalThis.fetch=originalFetch}
});
test('HTTP integration: Hotel DECLINED from provider changes persisted status',async()=>{
 globalThis.fetch=mockFetch;
 try{
 let h={type:'hotel',hotelId:'H01',roomId:'R0101',checkIn:'2026-11-28',checkOut:'2026-11-30',guests:2};
 let b=await send('/api/book','POST',{customer:{name:'Uji',email:'uji@example.org'},items:[h]});assert.equal(b.status,200);assert.equal(b.body.order.status,'CONFIRMED');hotelStatus='DECLINED';let r=await send('/api/orders/'+b.body.order.id+'/sync','POST',{}, {'X-Order-Token':b.body.accessToken});assert.equal(r.body.order.status,'FAILED');assert.equal(r.body.order.items[0].rawStatus,'DECLINED')
 }finally{hotelStatus='CONFIRMED';globalThis.fetch=originalFetch}
});
