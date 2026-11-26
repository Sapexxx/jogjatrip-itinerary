// Read-only verification; no booking or D1 writes.
import assert from 'node:assert/strict';
import vocabulary from '../crs-vocabulary.json' with {type:'json'};
const base=(process.env.BASE_URL||'https://jogjatrip-itinerary.azzahraghania110.workers.dev').replace(/\/$/,'');
const transport='https://jogjatrans-service.jogjawisata.workers.dev';
const offset=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
async function get(origin,path){
 const res=await fetch(origin+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error(origin+path+' HTTP '+res.status);
 return res.json();
}
const providerSemantic=await get(transport,'/api/v1/semantic');
assert.equal(providerSemantic.version,'0.1.1','JogjaTrans live CRS must be v0.1.1 before PR-I1 merge');
assert.deepEqual(providerSemantic,vocabulary,'JogjaTrans live CRS differs from committed vocabulary');
console.log('PASS JogjaTrans live CRS: '+providerSemantic.version+'; entire vocabulary matches GitHub');
if(!process.argv.includes('--provider-only')){
 const health=await get(base,'/api/health');
 for(const kind of ['hotel','wisata','transport'])assert.equal(health.providers?.[kind],true,'Provider not configured: '+kind);
 assert.equal(health.bookingEnabled,false,'Production checkout must remain disabled');
 console.log('PASS JogjaTrip health: all three provider URLs configured; booking disabled');
 const semantic=await get(base,'/api/semantic');
 assert.equal(semantic.version,'0.1.1');
 assert.deepEqual(semantic,providerSemantic,'Live JogjaTrip CRS differs from live JogjaTrans');
 console.log('PASS both live CRS vocabularies identical: '+semantic.version);
 const dates=new URLSearchParams({startDate:offset(8),endDate:offset(9),withDriver:'false'});
 for(const [path,label] of [['/api/catalog/hotels','hotels'],['/api/catalog/destinations','destinations'],['/api/catalog/vehicles?'+dates,'vehicles']]){
  const catalog=await get(base,path);
  assert.ok(Array.isArray(catalog.items)&&catalog.items.length>0,'Empty or invalid catalog: '+label);
  if(label==='vehicles'){assert.equal(catalog.provider,'transport');assert.equal(catalog.simulation,true)}
  console.log('PASS '+label+': '+catalog.items.length+(label==='vehicles'?'; prices simulated':''));
 }
}
