import test from 'node:test';
import assert from 'node:assert/strict';
import vocabulary from '../crs-vocabulary.json' with {type:'json'};
import {regionName,regionSlug,regionConcept,regionFromFields,status} from '../src/core.ts';
import worker from '../src/index.ts';

test('CRS version and five regions stay consistent with shared vocabulary',()=>{
  assert.equal(vocabulary.version,'0.1.1');
  assert.equal(vocabulary.regions.length,5);
  for(const r of vocabulary.regions){
    for(const alias of [r.label,...r.aliases,...Object.values(r.providerRepresentation)]){
      assert.equal(regionName(alias),r.label,alias);
      assert.equal(regionConcept(alias),r.conceptId,alias);
      assert.equal(regionSlug(alias),r.providerRepresentation.wisata,alias);
    }
  }
});

test('No province-to-city inference, substring matching, or conflicting city labels',()=>{
  for(const value of ['jogja','DIY','Daerah Istimewa Yogyakarta','jalan sleman','Bantul Sleman']){
    assert.equal(regionName(value),'',value);
  }
  assert.equal(regionFromFields('Sleman','kabupaten-sleman'),'Sleman');
  assert.equal(regionName('  Kabupaten   Sleman  '),'Sleman');
  assert.throws(()=>regionFromFields('Bantul','Sleman'),/bertentangan/);
  assert.equal(regionFromFields('Sleman','Alamat umum'),'Sleman');
});

test('Provider statuses retain canonical aggregator semantics',()=>{
  for(const [provider,states] of Object.entries(vocabulary.statusMappings.reservationState)){
    if(provider==='values')continue;
    for(const [raw,state] of Object.entries(states)){
      const expected=['requested','in_review','awaiting_payment'].includes(state)?'PENDING':
        ['reserved','in_progress','completed'].includes(state)?'CONFIRMED':
        state==='cancelled'||state==='refunded'?'CANCELLED':'UNKNOWN';
      // Existing aggregator semantics for expired is UNKNOWN until explicit handling is agreed.
      assert.equal(status(raw),expected,provider+':'+raw);
    }
  }
});

test('GET /api/semantic returns the exact shared vocabulary version',async()=>{
  const env={DB:{},ASSETS:{fetch:async()=>new Response('asset')}};
  const r=await worker.fetch(new Request('https://example.test/api/semantic'),env);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),vocabulary);
});

test('CRS v0.1.1 separates rental payment from trip payment and reservation state',()=>{
  const payment=vocabulary.statusMappings.paymentState;
  assert.deepEqual(payment.transportTrip,{'*':'not_applicable'});
  assert.deepEqual(payment.transport,payment.transportTrip);
  assert.deepEqual(payment.vehicleRental,{unpaid:'unpaid',paid:'paid'});
  assert.equal(payment.vehicleRental['*'],undefined);
  assert.equal(vocabulary.statusMappings.reservationState.transport.recorded,'requested');
  assert.equal(vocabulary.statusMappings.reservationState.transport.contacted,'in_review');
  assert.equal(status('recorded'),'PENDING');
  assert.equal(status('contacted'),'PENDING');
  assert.ok(vocabulary.nonEquivalences.some(x=>x.includes('payment gateway online')));
  assert.ok(vocabulary.nonEquivalences.some(x=>x.includes('minat, bukan pemesanan')));
});
