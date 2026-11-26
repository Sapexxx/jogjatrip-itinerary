import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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

test('provider evidence: transport draft hold body rejects canonical quantity and must not be silently retried',async()=>{
 const seen=[];
 const client=make(async(_,init)=>{
  seen.push({method:init.method,body:JSON.parse(init.body)});
  return new Response(JSON.stringify({code:'BAD_JSON',message:'Invalid hold request'}),{status:400,headers:{'Content-Type':'application/json'}});
 });
 await assert.rejects(client.hold({offerId:'signed-transport-offer',quantity:1,customer:{name:'Fixture User',phone:'0800000000'},
  externalRef:'JT-EXAMPLE-01',consent:true},KEY),e=>e instanceof InteropError&&e.code==='BAD_JSON'&&e.outcomeUnknown===false);
 assert.equal(seen.length,1);assert.equal(seen[0].body.quantity,1);
});
test('provider evidence: unsupported provider status 409 INVALID_OFFER stays UNKNOWN until contract approval',async()=>{
 const c=make(async()=>new Response(JSON.stringify({code:'INVALID_OFFER',message:'Draft offer expired'}),{status:409}));
 await assert.rejects(c.hold({offerId:'old-signed-offer',quantity:1,customer:{name:'Fixture User',phone:'0800000000'},
  externalRef:'JT-EXAMPLE-02',consent:true},KEY),e=>e instanceof InteropError&&e.code==='INVALID_OFFER'&&e.outcomeUnknown===true);
});
test('staging read-only verifier requires explicit sandbox approval and refuses invalid origins without network',()=>{
 const cli=fileURLToPath(new URL('../tools/check-interop-contract-readonly.mjs',import.meta.url));
 const denied=spawnSync(process.execPath,['--experimental-strip-types',cli],{env:{
  ...process.env,INTEROP_STAGING_READONLY_ACK:'',INTEROP_STAGING_PROVIDERS:'transport',
  INTEROP_STAGING_TRANSPORT_URL:'https://transport.sandbox.invalid/',INTEROP_STAGING_TRANSPORT_TOKEN:'synthetic-partner-token-12345678',
  INTEROP_STAGING_ALLOW_ORIGINS:'https://transport.sandbox.invalid'
 },encoding:'utf8',timeout:15000});
 assert.equal(denied.status,1);assert.match(denied.stderr,/BLOCKED Explicit staging read-only approval missing/);
 const invalid=spawnSync(process.execPath,['--experimental-strip-types',cli],{env:{
  ...process.env,INTEROP_STAGING_READONLY_ACK:'APPROVED_SANDBOX_ONLY',INTEROP_STAGING_PROVIDERS:'transport',
  INTEROP_STAGING_START_DATE:'2026-12-12',INTEROP_STAGING_END_DATE:'2026-12-14',
  INTEROP_STAGING_TRANSPORT_URL:'http://transport.sandbox.invalid/',INTEROP_STAGING_TRANSPORT_TOKEN:'synthetic-partner-token-12345678',
  INTEROP_STAGING_ALLOW_ORIGINS:'https://transport.sandbox.invalid'
 },encoding:'utf8',timeout:15000});
 assert.equal(invalid.status,1);assert.match(invalid.stderr,/BLOCKED transport: HTTPS URL missing or malformed/);
 assert.doesNotMatch(denied.stderr+invalid.stderr,/synthetic-partner-token-12345678/);
});
