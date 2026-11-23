// Read-only verification against an already-deployed JogjaTrip Worker.
// Never creates a booking, writes D1, or consumes transport quota.
const base=(process.env.BASE_URL||'https://jogjatrip-itinerary.azzahraghania110.workers.dev').replace(/\/$/,'');
const offset=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
async function get(path){
 const res=await fetch(base+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 const data=await res.json();
 if(!res.ok)throw Error('HTTP '+res.status+' at '+path+': '+JSON.stringify(data).slice(0,240));
 return data;
}
const health=await get('/api/health');
if(health.providers?.transport!==true)throw Error('Transport provider is not configured in JogjaTrip');
console.log('OK health: JogjaTrip reports transport provider configured');
const semantic=await get('/api/semantic');
if(semantic.version!=='0.1.0')throw Error('Unexpected CRS vocabulary version: '+semantic.version);
console.log('OK semantic: CRS '+semantic.version);
const dates=new URLSearchParams({startDate:offset(8),endDate:offset(9),withDriver:'false'});
const catalog=await get('/api/catalog/vehicles?'+dates);
if(catalog.provider!=='transport'||!Array.isArray(catalog.items)||catalog.simulation!==true)throw Error('Invalid transport catalog response');
console.log('OK vehicles: '+catalog.items.length+' rental models; prices explicitly simulated');
