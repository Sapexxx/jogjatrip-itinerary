// PR-I3 / PR-5: read-only audit. No POST, booking, payments, or D1 writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import vocabulary from '../crs-vocabulary.json' with {type:'json'};

const HOSTS={
 stay:'https://jogjastay-hotel-service.jogjawisata.workers.dev',
 trans:'https://jogjatrans-service.jogjawisata.workers.dev',
 wisata:'https://wisata-jogja-ten.vercel.app',
 trip:'https://jogjatrip-itinerary.azzahraghania110.workers.dev'
};
const day=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const rentalDates=new URLSearchParams({startDate:day(10),endDate:day(11),withDriver:'false'});
const optionsDate=new URLSearchParams({origin:'Sleman',destination:'Bantul',date:day(10),passengers:'2'});
const array=(d,key)=>Array.isArray(d)?d:Array.isArray(d?.[key])?d[key]:Array.isArray(d?.items)?d.items:Array.isArray(d?.data)?d.data:Array.isArray(d?.data?.[key])?d.data[key]:Array.isArray(d?.data?.items)?d.data.items:null;
const nonempty=(d,key)=>{const a=array(d,key);assert.ok(a?.length,'Respons '+key+' kosong atau bukan array');return a.length+' '+key};
const safe=s=>String(s??'').replace(/[\r\n]/g,' ').slice(0,240);
async function get(service,pathname,requests){
 const record={service,path:pathname,method:'GET',http:null,ms:null};
 requests.push(record);
 const url=new URL(pathname,HOSTS[service]);
 assert.equal(url.origin,HOSTS[service]);
 assert.equal(url.protocol,'https:');
 const started=Date.now();
 try{
  const r=await fetch(url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
  record.http=r.status;
  let d;try{d=await r.json()}catch{throw Error('respons bukan JSON')}
  if(!r.ok)throw Error('HTTP '+r.status+' '+safe(d?.code||d?.error||d?.message));
  return d;
 }catch(e){record.error=safe(e.message||e);throw Error(service+' '+record.error)}
 finally{record.ms=Date.now()-started}
}
async function probe(id,title,work){
 const requests=[];
 try{return {id,title,status:'PASS',detail:await work(requests),requests}}
 catch(e){return {id,title,status:'FAIL',detail:safe(e.message||e),requests}}
}
function skip(id,title,detail){return {id,title,status:'SKIP',detail,requests:[]}}
const one=(service,p,validate)=>async r=>validate(await get(service,p,r));
const health=d=>{assert.equal(d?.status,'ok');return 'status ok'};
const sameVocabulary=(d,s)=>{assert.equal(d?.version,'0.1.1',s+' CRS version bukan 0.1.1');assert.ok(isDeepStrictEqual(d,vocabulary),s+' kamus berbeda dari CRS 0.1.1 di repository');return 'v0.1.1 identik'};
async function multi(tasks,requests){
 const out=await Promise.allSettled(tasks.map(async ([name,service,p,validate])=>({name,detail:validate(await get(service,p,requests))})));
 const detail=out.map((v,i)=>tasks[i][0]+': '+(v.status==='fulfilled'?v.value.detail:'FAIL '+safe(v.reason?.message||v.reason))).join('; ');
 // Include each request and every service result, including failures; no fail-fast.
 if(out.some(x=>x.status==='rejected'))throw Error(detail);
 return detail;
}
const main=[
 probe('1','Stay → Wisata',one('stay','/api/v1/hotels/H11/recommendations',d=>nonempty(d,'destinations'))),
 probe('2','Stay → Transport',one('stay','/api/v1/integrations/rentals?'+new URLSearchParams({checkIn:day(10),checkOut:day(11),type:'mobil',withDriver:'false'}),d=>nonempty(d,'vehicles'))),
 probe('3','Transport → Stay',one('trans','/api/v1/integrations/hotels?city=Sleman',d=>nonempty(d,'hotels'))),
 probe('4','Transport → Wisata',one('trans','/api/v1/integrations/wisata?region=Sleman',d=>nonempty(d,'destinations'))),
 probe('5','Wisata → Stay',one('wisata','/api/v1/integrations/hotels?city=Sleman',d=>nonempty(d,'hotels'))),
 probe('6','Wisata → Transport',one('wisata','/api/v1/integrations/transport?'+rentalDates,d=>nonempty(d,'vehicles'))),
 probe('7','JogjaTrip → ketiga provider',r=>multi([
  ['hotels','trip','/api/catalog/hotels',d=>{assert.equal(d?.provider,'hotel');return nonempty(d,'items')}],
  ['destinations','trip','/api/catalog/destinations',d=>{assert.equal(d?.provider,'wisata');return nonempty(d,'items')}],
  ['vehicles','trip','/api/catalog/vehicles?'+rentalDates,d=>{assert.equal(d?.provider,'transport');assert.equal(d?.simulation,true);assert.equal(d?.priceType,'SIMULATED');return nonempty(d,'items')}]
 ],r)),
 probe('8','CRS empat layanan',r=>multi(['stay','trans','wisata','trip'].map(s=>[s,s,s==='trip'?'/api/semantic':'/api/v1/semantic',d=>sameVocabulary(d,s)]),r))
];
const supplemental=[
 probe('S1','PR-1: Health JogjaTrans',one('trans','/api/v1/health',health)),
 probe('S2','PR-2: Health JogjaStay',one('stay','/api/v1/health',health)),
 probe('S3','PR-1: CRS transport trip',one('trans','/api/v1/transport/options?'+optionsDate,d=>{
  const a=array(d,'options');assert.ok(a?.length&&a.every(x=>x.entityType==='transport_trip'&&x.originRegionId&&x.destinationRegionId&&['person','trip'].includes(x.priceUnit)),'Trip option tidak mengikuti CRS');return a.length+' opsi transport_trip'
 })),
 probe('S4','PR-1: CRS rental',one('trans','/api/v1/rentals/vehicles?'+rentalDates,d=>{
  const a=array(d,'vehicles');assert.ok(a?.length&&a.every(x=>x.provider==='transport'&&x.entityType==='vehicle_rental'&&x.priceUnit==='day'&&x.resourceId),'Rental tidak mengikuti CRS');return a.length+' kendaraan CRS'
 })),
 probe('S5','PR-2: CRS katalog hotel',one('stay','/api/v1/hotels?city=Sleman',d=>{
  const a=array(d,'hotels');assert.ok(a?.length,'Katalog hotel kosong');const missing=a.filter(x=>x.provider!=='hotel'||x.entityType!=='lodging'||typeof x.resourceId!=='string'||!x.resourceId||!vocabulary.regions.some(r=>r.conceptId===x.regionId)||typeof x.name!=='string'||!x.name||x.currency!=='IDR'||x.priceUnit!=='night');assert.equal(missing.length,0,missing.length+'/'+a.length+' hotel belum memenuhi CRS lodging (provider, entityType, resourceId, regionId, name, currency, priceUnit)');return a.length+' hotel CRS lodging'
 })),
 Promise.resolve(skip('S6','PR-3: Capabilities booking Wisata (legacy, superseded)','Endpoint legacy /api/v1/partner/capabilities and PENDING/durableStorage=true expectation are not implemented; historical audit 24 Nov returned 404. Contract 0.2 readiness and W2 durability remain BLOCKED; not a PASS.')),
 probe('S7','CRS JogjaTrip ↔ JogjaTrans',r=>multi([
  ['trip','trip','/api/semantic',d=>sameVocabulary(d,'trip')],
  ['trans','trans','/api/v1/semantic',d=>sameVocabulary(d,'trans')]
 ],r)),
 probe('S8','JogjaTrip: booking produksi nonaktif',one('trip','/api/health',d=>{assert.equal(d?.bookingEnabled,false);return 'bookingEnabled=false'}))
];
const checks=await Promise.all(main);
const extras=await Promise.all(supplemental);
const summarize=a=>({total:a.length,passed:a.filter(x=>x.status==='PASS').length,failed:a.filter(x=>x.status==='FAIL').length,skipped:a.filter(x=>x.status==='SKIP').length});
const readiness={contract:'0.2.0',status:'BLOCKED',reason:'Master contract remains draft; authenticated capabilities, durable provider holds and staging proof not verified. Read-only CRS audit does not establish transaction readiness.'};
const report={transactionReadiness:readiness,timestamp:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,mode:'READ_ONLY_GET',crsVersion:vocabulary.version,targets:HOSTS,checks,extras,summary:summarize(checks),supplementalSummary:summarize(extras)};
for(const c of [...checks,...extras])console.log(c.status+' '+c.id+' '+c.title+' | '+c.detail);
console.log('PR-5 '+JSON.stringify(report.summary)+'; supplemental '+JSON.stringify(report.supplementalSummary));
const dir=process.env.INTEROP_REPORT_DIR||'interop-report';
await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(report,null,2)+'\n');
const clean=s=>String(s).replaceAll('|','/').replaceAll('\n',' ');
const row=c=>'| '+c.id+' | '+clean(c.title)+' | '+c.status+' | '+clean(c.detail)+' |';
const count=s=>s.passed+' PASS / '+s.failed+' FAIL / '+s.skipped+' SKIP (total '+s.total+')';
const md=['# PR-I3 / PR-5 Interoperability Live Audit','',report.timestamp,'Commit: '+(report.commit||'local'),'CRS: '+report.crsVersion,'','**READ-ONLY:** GET saja. Tidak memesan, mengubah stok, atau membayar.','','## Delapan jalur','| Jalur | Arah | Hasil | Catatan |','|---|---|---|---|',...checks.map(row),'','**Hasil utama: '+count(report.summary)+'.**','','## Pemeriksaan pendukung','| ID | Kontrak | Hasil | Catatan |','|---|---|---|---|',...extras.map(row),'','**Pendukung: '+count(report.supplementalSummary)+'.**','','Contract 0.2: BLOCKED (audit ini tidak menguji transaksi atau autentikasi partner). SKIP berarti tidak diuji karena desain/prasyarat, bukan sukses. FAIL tetap gagal. Bukti terbatas pada HTTP dan kontrak yang diperiksa; UI, transaksi saga, keamanan token, serta persistensi booking belum dibuktikan.',''];
await fs.writeFile(path.join(dir,'summary.md'),md.join('\n'));
if(report.summary.failed||report.supplementalSummary.failed)process.exitCode=1;
