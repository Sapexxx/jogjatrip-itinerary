/** Official schemas, unmodified. This suite tests synthetic HTTP only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {createInteropClient} from '../cloudflare/src/interop.ts';
import {mockProvider,TOKEN,KEY,query} from '../cloudflare/tests/fixtures/interop-provider.mjs';
const ajv=new Ajv({allErrors:true,strict:false});addFormats(ajv);
const names=['capabilities','offer','offers-response','hold-request','hold-response','error','handoff-context'];
const validators=Object.fromEntries(names.map(n=>[n,ajv.compile(JSON.parse(readFileSync(new URL('../json-schema/'+n+'.schema.json',import.meta.url),'utf8')))]));
const valid=(n,v)=>assert.equal(validators[n](v),true,n+': '+JSON.stringify(validators[n].errors));
const invalid=(n,v)=>assert.equal(validators[n](v),false,n+' must reject invalid input');
const base='https://fixture.invalid';
for(const provider of ['hotel','wisata','transport']){
 test(provider+': official schema validates actual fixture wire response and serialized consumer HOLD',async()=>{
  const m=mockProvider(provider,2);
  const fetcher=async(u,i)=>{
   assert.equal(new URL(u).origin,base);
   if(i.body)valid('hold-request',JSON.parse(i.body));
   const r=await m.fetcher(u,i);const data=await r.clone().json(),p=new URL(u).pathname;
   if(!r.ok)valid('error',data);
   else if(p.endsWith('/capabilities'))valid('capabilities',data);
   else if(p.endsWith('/offers')){valid('offers-response',data);data.offers.forEach(o=>valid('offer',o))}
   else if(p.endsWith('/holds')||i.method==='GET')valid('hold-response',data);
   return r;
  };
  const c=createInteropClient({provider,baseUrl:base,token:TOKEN,fetcher});
  valid('capabilities',await c.capabilities());
  const offers=await c.offers(query);valid('offers-response',offers);const o=offers.offers[0];valid('offer',o);
  const input={offerId:o.offerId,quantity:1,customer:{name:'Synthetic QA',phone:'081234567890'},externalRef:'JT-SCHEMA-01',consent:true};
  const h=await c.hold(input,KEY);valid('hold-response',h);
  assert.equal((await c.hold(input,KEY)).holdId,h.holdId);
  valid('hold-response',await c.getHold(h.holdId));
  await c.confirm(h.holdId);const reserved=await c.getHold(h.holdId);valid('hold-response',reserved);assert.equal(reserved.reservationState,'reserved');
  await assert.rejects(c.release(h.holdId),e=>e.code==='ALREADY_CONFIRMED');
  const second=(await c.offers(query)).offers[0];
  const held=await c.hold({...input,offerId:second.offerId,externalRef:'JT-SCHEMA-02'},KEY+'-2');
  await c.release(held.holdId);valid('hold-response',await c.getHold(held.holdId));
  assert.equal((await c.getHold(held.holdId)).reservationState,'cancelled');
 });
}
test('all seven official schemas reject invalid values, required field omissions and fake payment state',async()=>{
 const m=mockProvider(),c=createInteropClient({provider:'transport',baseUrl:base,token:TOKEN,fetcher:m.fetcher});
 const caps=await c.capabilities(),offers=await c.offers(query),o=offers.offers[0];
 const request={offerId:o.offerId,customer:{name:'Synthetic QA',phone:'081234567890'},externalRef:'JT-SCHEMA-03',consent:true};
 const h=await c.hold({...request,quantity:1},KEY);
 for(const p of [{contract:'0.3.0'},{holds:'true'},{holdTtlMinutes:0},{maxQuantity:0},{requiredCustomerFields:['address']}])invalid('capabilities',{...caps,...p});
 for(const p of [{imageUrl:'/relative.png'},{description:undefined},{price:null},{currency:'USD'},{offerId:'x'.repeat(401)},{period:{startDate:'2026-02-30'}},{simulation:false}])invalid('offer',{...o,...p});
 invalid('offers-response',{...offers,generatedAt:undefined});invalid('offers-response',{...offers,offers:[{...o,imageUrl:'/relative.png'}]});
 for(const p of [{consent:false},{quantity:0},{externalRef:'x'.repeat(65)},{customer:{name:'A',phone:'123'}},{customer:{name:'Synthetic QA',secret:'no'}}])invalid('hold-request',{...request,...p});
 for(const p of [{paymentState:'CONFIRMED'},{externalRef:undefined},{expiresAt:undefined},{reservationState:'reserved',voucher:undefined}])invalid('hold-response',{...h,...p});
 valid('error',{code:'INVALID_OFFER',message:'Synthetic'});invalid('error',{code:'invalid',message:'Synthetic'});invalid('error',{code:'INVALID_OFFER'});
 for(const ctx of [{from:'jogjastay',hotelId:'H-01',checkIn:'2026-12-12',checkOut:'2026-12-14'},{from:'jogjatrans',vehicleId:'R-01',startDate:'2026-12-12',endDate:'2026-12-14',withDriver:'true'},{from:'wisata',destinationId:'101',visitDate:'2026-12-13'}])valid('handoff-context',ctx);
 for(const ctx of [{from:'unknown'},{from:'jogjatrans',vehicleId:'x'.repeat(61)},{from:'jogjatrans',withDriver:'1'},{from:'wisata',destinationId:'0'},{from:'jogjastay',checkIn:'2026-02-30'}])invalid('handoff-context',ctx);
});
