// PR-5 interoperabilitas: read-only probes, no booking and no database writes.
// Run from GitHub Actions or locally with Node.js 22+. Free-tier friendly.
import fs from 'node:fs/promises';
import path from 'node:path';

const HOSTS = {
  stay: 'https://jogjastay-hotel-service.jogjawisata.workers.dev',
  trans: 'https://jogjatrans-service.jogjawisata.workers.dev',
  wisata: 'https://wisata-jogja-ten.vercel.app',
  trip: 'https://jogjatrip-itinerary.azzahraghania110.workers.dev'
};
const asArray = (body, key) => Array.isArray(body?.[key]) ? body[key] : Array.isArray(body) ? body : null;
const nonempty = (body, key) => {
  const items = asArray(body, key);
  if (!items || !items.length) throw new Error('Respons ' + key + ' kosong atau bukan array');
  return items.length + ' ' + key;
};
const day = offset => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const rentalDates = new URLSearchParams({startDate: day(10), endDate: day(11), withDriver:'false'});
const tripDate = new URLSearchParams({startDate: day(10), endDate: day(11)});
const optionsDate = new URLSearchParams({origin:'Sleman',destination:'Bantul',date:day(10),passengers:'2'});

async function get(service, pathname) {
  const url = new URL(pathname, HOSTS[service]);
  if (url.origin !== HOSTS[service] || url.protocol !== 'https:') throw new Error('URL target tidak aman');
  const started = Date.now();
  let response;
  try {
    response = await fetch(url, {method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  } catch (err) {
    throw new Error(service + ' tidak terjangkau: ' + (err?.message || 'timeout'));
  }
  const elapsedMs = Date.now() - started;
  let json;
  try { json = await response.json(); }
  catch { throw new Error(service + ' HTTP ' + response.status + ' bukan JSON'); }
  if (!response.ok) {
    const code = String(json?.code || json?.error || json?.message || '').slice(0,100);
    throw new Error(service + ' HTTP ' + response.status + (code ? ' (' + code + ')' : ''));
  }
  return {json,http:response.status,elapsedMs,url:url.href};
}
async function probe(id, title, work) {
  try {
    const data = await work();
    return {id,title,status:'LULUS',detail:data.detail||'Format respons benar',requests:data.requests||[]};
  } catch (e) {
    return {id,title,status:'GAGAL',detail:String(e.message||e).slice(0,240),requests:[]};
  }
}
async function one(service,pathname,validator) {
  const response = await get(service,pathname);
  return {detail:validator(response.json),requests:[{service,path:pathname,http:response.http,ms:response.elapsedMs}]};
}
const main = [
  probe('1','Stay → Wisata',()=>one('stay','/api/v1/hotels/H11/recommendations',d=>nonempty(d,'destinations'))),
  probe('2','Stay → Transport',()=>one('stay','/api/v1/hotels/H11/transport-options',d=>{
    const list = asArray(d,'vehicles') || asArray(d,'items') || asArray(d,'options');
    if (!list || !list.length) throw new Error('Tidak ada daftar kendaraan dari JogjaTrans');
    return list.length+' kendaraan dari Stay';
  })),
  probe('3','Transport → Stay',()=>one('trans','/api/v1/integrations/hotels?city=Sleman',d=>nonempty(d,'hotels'))),
  probe('4','Transport → Wisata',()=>one('trans','/api/v1/integrations/wisata?region=Sleman',d=>nonempty(d,'destinations'))),
  probe('5','Wisata → Stay',()=>one('wisata','/api/v1/integrations/hotels?city=kabupaten-sleman',d=>nonempty(d,'hotels'))),
  probe('6','Wisata → Transport',()=>one('wisata','/api/v1/integrations/transport',d=>{
    const list = asArray(d,'vehicles') || asArray(d,'options') || asArray(d,'items');
    if (!list || !list.length) throw new Error('Tidak ada katalog transport dari Wisata');
    return list.length+' kendaraan/opsi';
  })),
  probe('7','JogjaTrip → ketiga provider',async()=>{
    const paths=[
      ['/api/catalog/hotels','hotels'],
      ['/api/catalog/destinations','destinations'],
      ['/api/catalog/vehicles?'+tripDate.toString(),'vehicles']
    ];
    const out=await Promise.all(paths.map(async ([p,key])=>{
      const r=await get('trip',p);
      const items=asArray(r.json,key==='vehicles'?'items':'items');
      if (!items || !items.length) throw new Error('JogjaTrip '+key+' tidak mengembalikan katalog');
      if (key==='vehicles' && (r.json.provider!=='transport' || r.json.simulation!==true)) throw new Error('Katalog rental tidak ditandai sebagai simulasi');
      return {key,count:items.length,request:{service:'trip',path:p,http:r.http,ms:r.elapsedMs}};
    }));
    return {detail:out.map(v=>v.key+': '+v.count).join('; '),requests:out.map(v=>v.request)};
  }),
  probe('8','CRS empat layanan',async()=>{
    const names=['stay','trans','wisata','trip'];
    const out=await Promise.all(names.map(async service=>{
      const p=service==='trip'?'/api/semantic':'/api/v1/semantic';
      const r=await get(service,p);
      if (!r.json||typeof r.json.version!=='string'||!Array.isArray(r.json.regions)) throw new Error('Kamus CRS '+service+' tidak lengkap');
      return {service,body:r.json,request:{service,path:p,http:r.http,ms:r.elapsedMs}};
    }));
    const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)])):value;
    const expected=JSON.stringify(normalize(out[0].body));
    for(const x of out.slice(1)) if(JSON.stringify(normalize(x.body))!==expected)throw new Error('Kamus CRS '+x.service+' berbeda dari '+out[0].service+'; version '+x.body.version+' vs '+out[0].body.version);
    return {detail:'version '+out[0].body.version+' sama, '+out.length+' layanan',requests:out.map(x=>x.request)};
  })
];
const supplemental = [
  probe('S1','PR-1: Health JogjaTrans',()=>one('trans','/api/v1/health',d=>d?.status==='ok'?'status ok':(()=>{throw Error('health tidak ok')})())),
  probe('S2','PR-2: Health JogjaStay',()=>one('stay','/api/v1/health',d=>d?.status==='ok'?'status ok':(()=>{throw Error('health tidak ok')})())),
  probe('S3','PR-1: CRS transport trip',()=>one('trans','/api/v1/transport/options?'+optionsDate.toString(),d=>{
    const items=asArray(d,'options');
    if (!items?.length||items.some(x=>x.entityType!=='transport_trip'||!x.originRegionId||!x.destinationRegionId||!['person','trip'].includes(x.priceUnit)))throw Error('Trip option tidak mengikuti CRS');
    return items.length+' opsi transport_trip';
  })),
  probe('S4','PR-1: CRS rental',()=>one('trans','/api/v1/rentals/vehicles?'+rentalDates.toString(),d=>{
    const items=asArray(d,'vehicles');
    if (!items?.length||items.some(x=>x.provider!=='transport'||x.entityType!=='vehicle_rental'||x.priceUnit!=='day'||!x.resourceId))throw Error('Rental tidak mengikuti CRS');
    return items.length+' kendaraan CRS';
  })),
  probe('S5','PR-2: CRS katalog hotel',()=>one('stay','/api/v1/hotels?city=Sleman',d=>{
    const items=asArray(d,'hotels');
    if (!items?.length||items.some(x=>x.provider!=='hotel'||x.entityType!=='hotel'||!x.resourceId||!x.regionId))throw Error('Katalog hotel belum memenuhi CRS');
    return items.length+' hotel CRS';
  })),
  probe('S6','PR-3: Capabilities booking Wisata',()=>one('wisata','/api/v1/partner/capabilities',d=>{
    const state=String(d?.bookingStatus||'').toUpperCase();
    if(state!=='PENDING'||d?.durableStorage!==true||d?.idempotentBooking!==true)throw Error('Booking belum siap (harus PENDING/true/true)');
    return 'PENDING, durableStorage=true, idempotentBooking=true';
  }))
];
const checks=await Promise.all(main);
const extras=await Promise.all(supplemental);
const timestamp=new Date().toISOString();
const report={timestamp,mode:'READ_ONLY_GET',targets:HOSTS,checks,extras,
 summary:{passed:checks.filter(x=>x.status==='LULUS').length,total:8,
 supplementalPassed:extras.filter(x=>x.status==='LULUS').length,supplementalTotal:extras.length}};
for(const c of checks)console.log((c.status==='LULUS'?'LULUS':'GAGAL')+' PR-5 '+c.id+' '+c.title+' | '+c.detail);
console.log('PR-5 '+report.summary.passed+'/8; supplementary '+report.summary.supplementalPassed+'/'+extras.length);
for(const c of extras)console.log((c.status==='LULUS'?'LULUS':'GAGAL')+' '+c.id+' '+c.title+' | '+c.detail);
const dir=process.env.INTEROP_REPORT_DIR||'interop-report';
await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(report,null,2)+'\n');
const row=c=>'| '+c.id+' | '+c.title.replaceAll('|','/')+' | '+c.status+' | '+c.detail.replaceAll('|','/').replaceAll('\n',' ').slice(0,180)+' |';
const md=['# PR-5 Interoperability Live Audit','',timestamp,'','**READ-ONLY:** hanya GET publik. Tidak memesan, mengubah stok, atau menjalankan pembayaran.','','## Delapan jalur', '| Jalur | Arah | Hasil | Catatan |','|---|---|---|---|',...checks.map(row),'', '## Pemeriksaan kontrak pendukung','| ID | Kontrak | Hasil | Catatan |','|---|---|---|---|',...extras.map(row),'','**Hasil PR-5: '+report.summary.passed+'/8.**','', 'Bukti terbatas pada HTTP dan bentuk respons. UI, keamanan token salah, idempotensi booking, serta persistensi booking lintas restart belum diuji oleh skrip ini.',''];
await fs.writeFile(path.join(dir,'summary.md'),md.join('\n'));
if(checks.some(c=>c.status!=='LULUS')||extras.some(c=>c.status!=='LULUS'))process.exitCode=1;
