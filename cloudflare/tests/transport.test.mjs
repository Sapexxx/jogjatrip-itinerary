import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {noSecret} from '../src/core.js';

class MemoryD1 {
 constructor(){this.orders=new Map();this.plans=new Map()}
 prepare(sql){
  const db=this;
  return {bind(...args){return {
   async first(){
    if(sql.includes('FROM jt_orders')){const o=db.orders.get(args[0]);return o?{payload:o.payload,secret_hash:o.secret_hash}:null}
    if(sql.includes('FROM jt_plans')){const o=db.plans.get(args[0]);return o?{payload:o.payload,secret_hash:o.secret_hash,order_lock:o.order_lock}:null}
    throw Error('unknown SQL first '+sql)
   },
   async run(){
    if(sql.startsWith('INSERT INTO jt_orders')){const [id,payload,hash]=args;db.orders.set(id,{payload,secret_hash:hash});return {meta:{changes:1}}}
    if(sql.startsWith('INSERT INTO jt_plans')){const [id,payload,hash]=args;db.plans.set(id,{payload,secret_hash:hash,order_lock:null});return {meta:{changes:1}}}
    if(sql.startsWith('UPDATE jt_plans SET order_lock=?')){const p=db.plans.get(args[1]);if(!p||p.order_lock)return {meta:{changes:0}};p.order_lock=args[0];return {meta:{changes:1}}}
    if(sql.startsWith('UPDATE jt_plans SET order_lock=NULL')){const p=db.plans.get(args[0]);if(p&&p.order_lock===args[1])p.order_lock=null;return {meta:{changes:1}}}
    throw Error('unknown SQL run '+sql)
   }
  }}}
 }
}
const env={DB:new MemoryD1(),BOOKING_ENABLED:'true',HOTEL_API_URL:'https://hotel.test',WISATA_API_URL:'https://wisata.test',TRANSPORT_API_URL:'https://transport.test',HOTEL_PARTNER_TOKEN:'private-hotel',WISATA_PARTNER_TOKEN:'private-wisata',ASSETS:{fetch:async()=>new Response('static')}};
const originalFetch=globalThis.fetch;
const vehicle={id:'BRIO',name:'Honda Brio',type:'mobil',category:'city-car',days:2,available:true,unitsAvailable:2,totalPrice:350000,priceType:'SIMULATED'};
let transportRequests=[],transportFail=false,stock=2;
function providerMock(url,opts={}){
 const u=new URL(url);let data,code=200;
 if(u.hostname==='transport.test'){
  transportRequests.push({path:u.pathname,search:u.search,method:opts.method||'GET',headers:opts.headers||{},body:opts.body});
  if(transportFail)return Promise.reject(Error('Transport offline'));
  if(u.pathname==='/api/v1/rentals/vehicles')data={vehicles:[{...vehicle,available:stock>0,unitsAvailable:stock}],startDate:u.searchParams.get('startDate'),endDate:u.searchParams.get('endDate')};
  if(u.pathname==='/api/v1/rentals/bookings'&&opts.method==='POST'){data={bookingId:'RT-TEST1',accessToken:'provider-token-sensitive',status:'recorded',totalPrice:350000};code=201}
  if(u.pathname==='/api/v1/rentals/bookings/RT-TEST1')data={bookingId:'RT-TEST1',status:'recorded'};
 }else if(u.hostname==='hotel.test'){
  if(u.pathname==='/api/v1/hotels')data=[{hotelId:'H01',name:'Hotel',city:'Sleman'}];
  else if(u.pathname==='/api/v1/rooms')data=[{roomId:'R0101',hotelId:'H01'}];
  else if(u.pathname.includes('availability'))data={rooms:[{roomId:'R0101',unitsAvailable:2,capacity:2,totalPrice:300000}]};
  else if(u.pathname==='/api/v1/hotel-bookings')data={bookingId:'HB-TEST1',status:'confirmed'};
  else if(u.pathname.includes('hotel-bookings/'))data={status:'confirmed'};
 }else if(u.hostname==='wisata.test'){
  if(u.pathname==='/api/v1/destinations')data=[{id:1,name:'Destinasi',region:'kabupaten-sleman'}];
  else if(u.pathname.includes('availability'))data={available:true,total:20000};
  else if(u.pathname==='/api/v1/partner/bookings')data={code:'WB-TEST1',status:'PENDING'};
  else if(u.pathname.includes('partner/bookings/'))data={status:'PENDING'};
 }
 return Promise.resolve(new Response(JSON.stringify(data||{error:'not found'}),{status:data?code:404,headers:{'Content-Type':'application/json'}}));
}
async function send(path,method='GET',body,headers={}){
 const req=new Request('https://app.test'+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const res=await worker.fetch(req,env);
 return {status:res.status,body:await res.json()};
}
const transport={type:'transport',vehicleId:'BRIO',startDate:'2026-12-01',endDate:'2026-12-02',withDriver:false};
const hotel={type:'hotel',hotelId:'H01',roomId:'R0101',checkIn:'2026-12-01',checkOut:'2026-12-03',guests:2};
const wisata={type:'wisata',destinationId:1,visitDate:'2026-12-01',quantity:2,tier:'base'};
const customer={name:'Pengguna Uji',email:'uji@example.com',phone:'081234567891'};
test('CRS catalog rental, date validation, and simulated live availability',async()=>{
 globalThis.fetch=providerMock;
 try{
  let c=await send('/api/catalog/vehicles?startDate=2026-12-01&endDate=2026-12-02');
  assert.equal(c.status,200);assert.equal(c.body.provider,'transport');assert.equal(c.body.simulation,true);assert.equal(c.body.items[0].id,'BRIO');
  c=await send('/api/catalog/vehicles');assert.equal(c.status,400);
  c=await send('/api/quote','POST',{customer,items:[transport]});
  assert.equal(c.status,200);assert.equal(c.body.total,350000);assert.equal(c.body.simulation,true);
  stock=0;
  c=await send('/api/quote','POST',{customer,items:[transport]});
  assert.equal(c.status,409);
  stock=2;
 }finally{stock=2;globalThis.fetch=originalFetch}
});
test('transport token stays in D1 and never appears in booking, GET, sync or details',async()=>{
 globalThis.fetch=providerMock;
 try{
  const booked=await send('/api/book','POST',{customer,items:[transport]});
  assert.equal(booked.status,200,JSON.stringify(booked.body));
  assert.equal(booked.body.order.status,'PROCESSING');
  assert.equal(booked.body.order.estimatedSubtotal,350000);
  assert.equal(booked.body.order.items[0].status,'PENDING');
  assert.ok(!JSON.stringify(booked.body).includes('provider-token-sensitive'));
  const row=env.DB.orders.get(booked.body.order.id);
  assert.ok(row.payload.includes('provider-token-sensitive'),'D1 must retain token for server side sync');
  const h={'X-Order-Token':booked.body.accessToken};
  for(const [path,method] of [['/api/orders/'+booked.body.order.id,'GET'],['/api/orders/'+booked.body.order.id+'/sync','POST'],['/api/orders/'+booked.body.order.id+'/details','GET']]){
   const r=await send(path,method,method==='POST'?{}:undefined,h);
   assert.equal(r.status,200,JSON.stringify(r.body));
   assert.ok(!JSON.stringify(r.body).includes('provider-token-sensitive'));
  }
  const lookup=transportRequests.find(x=>x.path==='/api/v1/rentals/bookings/RT-TEST1');
  assert.equal(lookup.headers['X-Booking-Token'],'provider-token-sensitive');
  const post=transportRequests.find(x=>x.path==='/api/v1/rentals/bookings'&&x.method==='POST');
  assert.ok(post.headers['Idempotency-Key'].length>=16);
  assert.equal(JSON.parse(post.body).customerPhone,customer.phone);
 }finally{globalThis.fetch=originalFetch}
});
test('PENDING transport and wisata do not stop later provider booking',async()=>{
 globalThis.fetch=providerMock;
 try{
  const b=await send('/api/book','POST',{customer,items:[transport,wisata,hotel]});
  assert.equal(b.status,200,JSON.stringify(b.body));
  assert.deepEqual(b.body.order.items.map(x=>x.status),['PENDING','PENDING','CONFIRMED']);
  assert.equal(b.body.order.status,'PROCESSING');
 }finally{globalThis.fetch=originalFetch}
});
test('invalid customer phone and provider outage do not fabricate vehicles',async()=>{
 globalThis.fetch=providerMock;
 try{
  let r=await send('/api/book','POST',{customer:{...customer,phone:'12'},items:[transport]});
  assert.equal(r.status,400);
  transportFail=true;
  r=await send('/api/catalog/vehicles?startDate=2026-12-01&endDate=2026-12-02');
  assert.equal(r.status,502);
 }finally{transportFail=false;globalThis.fetch=originalFetch}
});
test('curated package optional rental is priced by provider without changing existing package',async()=>{
 globalThis.fetch=providerMock;
 try{
  let r=await send('/api/packages/jogja-klasik/quote','POST',{startDate:'2026-12-01',guests:2,selectedAddOns:[{id:'rental-mobil',qty:1}],schedules:{}});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.items.length,3);assert.equal(r.body.items[2].item.type,'transport');
  assert.equal(r.body.pricing.addOnsSubtotal,350000);
  r=await send('/api/packages/jogja-klasik/quote','POST',{startDate:'2026-12-01',guests:2,selectedAddOns:[],schedules:{}});
  assert.equal(r.status,200);assert.equal(r.body.items.length,2);
 }finally{globalThis.fetch=originalFetch}
});
test('noSecret strips nested provider credentials without changing original',()=>{
 const raw={items:[{providerAccessToken:'hidden',item:{type:'transport'}}],secretHash:'also hidden'};
 const pub=noSecret(raw);assert.ok(!JSON.stringify(pub).includes('hidden'));assert.equal(raw.items[0].providerAccessToken,'hidden');
});

test('itinerary with rental dates can be saved, quoted and booked while PENDING',async()=>{
 globalThis.fetch=providerMock;
 try{
  const plan={title:'Rencana Rental',startDate:'2026-12-01',endDate:'2026-12-03',activities:[
   {type:'transport',title:'Sewa Brio',date:'2026-12-01',startTime:'08:00',endTime:'09:00',sourceItem:transport}
  ]};
  let r=await send('/api/itineraries','POST',plan);
  assert.equal(r.status,201,JSON.stringify(r.body));
  const id=r.body.itinerary.id,token=r.body.accessToken;
  const headers={'X-Plan-Token':token};
  r=await send('/api/itineraries/'+id+'/quote','POST',{},headers);
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.available,true);
  assert.equal(r.body.total,350000);
  r=await send('/api/itineraries/'+id+'/book','POST',{customer},headers);
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.order.status,'PROCESSING');
  assert.equal(r.body.itinerary.activities[0].bookingStatus,'PENDING');
  assert.ok(!JSON.stringify(r.body).includes('provider-token-sensitive'));
  r=await send('/api/itineraries/'+id+'/sync','POST',{},headers);
  assert.equal(r.status,200);
  assert.equal(r.body.itinerary.activities[0].bookingStatus,'PENDING');
 }finally{globalThis.fetch=originalFetch}
});
