import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInteropClient,InteropError} from '../src/interop.ts';
import {TOKEN,KEY,mockProvider} from './fixtures/interop-provider.mjs';

// SOURCE-DERIVED incompatibility fixtures, not evidence of a live deployed response.
// Source: FaridAzis/jogjatrans-service main@0bfeb8b519521b97628fac91d294fd8e6e94c4ac,
// src/interop.rs: GET offers lines 70–96, hold structs lines 97–102,
// interop_value voucher lines 111–122, invalid offer response lines 137–141.
const make=(fetcher)=>createInteropClient({provider:'transport',baseUrl:'https://synthetic.transport.invalid',token:TOKEN,fetcher});
const query={startDate:'2026-12-12',endDate:'2026-12-14',quantity:1};
const canonicalFixture=mockProvider('transport');
test('provider evidence: Transport draft GET offers without generatedAt is rejected before any HOLD',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method});
  if(url.endsWith('/capabilities'))return new Response(JSON.stringify({contract:'0.2.0',provider:'transport',entityTypes:['vehicle_rental'],holds:true,holdTtlMinutes:15,durableStorage:true,location:'region'}),{status:200});
  if(url.includes('/offers?'))return new Response(JSON.stringify({provider:'transport',offers:[{offerId:'signed-offer',provider:'transport',resourceId:'R-01',available:true,units:1,totalPrice:10000}]}),{status:200});
  throw Error('MUTATION_FORBIDDEN');
 };
 const client=make(fetcher);
 assert.equal((await client.capabilities()).holds,true);
 await assert.rejects(client.offers(query),e=>e instanceof InteropError&&e.code==='INVALID_PROVIDER_RESPONSE'&&e.outcomeUnknown===false);
 assert.equal(calls.filter(x=>x.method==='POST').length,0);
});
test('provider evidence: Transport draft voucher.bookingId does not satisfy canonical voucher.code',async()=>{
 const calls=[];
 const client=make(async(url,options)=>{
  calls.push(options.method);
  if(url.endsWith('/confirm'))return new Response(JSON.stringify({
   holdId:'IH-fixture',reservationState:'reserved',paymentState:'unpaid',
   voucher:{bookingId:'RT-fixture',vehicleId:'R-01',totalPrice:10000}
  }),{status:200});
  throw Error('NOT_A_LIVE_PROVIDER');
 });
 await assert.rejects(client.confirm('IH-fixture',KEY),e=>e instanceof InteropError&&e.code==='INVALID_PROVIDER_RESPONSE'&&e.outcomeUnknown===true);
 assert.deepEqual(calls,['POST']);
});
test('provider evidence: never compensate a malformed successful confirm by treating it as unreserved',async()=>{
 const c=make(async(url,opts)=>{
  if(opts.method==='POST')return new Response(JSON.stringify({holdId:'IH-fixture',reservationState:'reserved',paymentState:'unpaid',voucher:{bookingId:'RT-fixture'}}));
  throw Error('NO_GET_STUB');
 });
 await assert.rejects(c.confirm('IH-fixture',KEY),e=>e instanceof InteropError&&e.outcomeUnknown);
});
test('provider evidence: strict I1 canonical fixture still passes without weakening adapter',async()=>{
 const m=mockProvider('transport');
 const c=make(m.fetcher);
 const cap=await c.capabilities(),offers=await c.offers(query);
 assert.equal(cap.contract,'0.2.0');
 assert.ok(offers.generatedAt);
 assert.equal(offers.offers[0].provider,'transport');
 assert.equal(m.calls.every(c=>c.method==='GET'),true);
});
test('provider evidence: production booking remains disabled and only a source-audited readiness document is committed',()=>{
 const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
 const evidence=readFileSync(new URL('../docs/INTEROP_0.2_PROVIDER_EVIDENCE_2026-11-25.md',import.meta.url),'utf8');
 assert.match(config,/"BOOKING_ENABLED"\s*:\s*"false"/);
 for(const needed of ['JogjaTrans','JogjaStay','Wisata Jogja','NO-GO'])assert.ok(evidence.includes(needed));
});
