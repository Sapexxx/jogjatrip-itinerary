// Local read-only accessibility preview of cloudflare/web; never connects to real providers.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const webRoot=fileURLToPath(new URL('../web/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const fixture={
 hotels:[{hotelId:'H1',name:'Hotel contoh (fixture)',city:'Sleman'}],
 rooms:[{hotelId:'H1',roomId:'R1',roomType:'Standard',pricePerNight:250000,capacity:2,totalUnits:3}],
 destinations:[{id:1,name:'Wisata contoh (fixture)',region:'kabupaten-sleman',price:10000}],
 vehicles:[{id:'V1',name:'Kendaraan contoh (fixture)',type:'mobil',dailyPrice:200000,totalPrice:600000,days:3,unitsAvailable:2,available:true}]
};
function send(res,status,data){res.statusCode=status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
export function createPreviewServer(){
 return http.createServer(async(req,res)=>{
  if(req.method!=='GET')return send(res,403,{error:'Akses hanya-baca. Booking dan perubahan provider dinonaktifkan.'});
  let url;try{url=new URL(req.url,'http://localhost')}catch{return send(res,400,{error:'URL tidak sah'})}
  if(url.pathname.startsWith('/api/')){
   if(url.pathname==='/api/health')return send(res,200,{status:'ok',bookingEnabled:false,interopPreparationEnabled:false,providers:{hotel:true,wisata:true,transport:true}});
   if(url.pathname==='/api/recommendations')return send(res,200,{destinations:fixture.destinations,reason:'Rekomendasi data sintetis'});
   const key=url.pathname.split('/').pop();
   if(Object.hasOwn(fixture,key)){
    const items=key==='vehicles'?fixture.vehicles.map(x=>({...x,startDate:url.searchParams.get('startDate'),endDate:url.searchParams.get('endDate'),withDriver:false})):fixture[key];
    return send(res,200,{items,provider:key==='vehicles'?'transport':key});
   }
   return send(res,404,{error:'Endpoint tidak tersedia pada preview aksesibilitas'});
  }
  let rel;try{rel=decodeURIComponent(url.pathname)}catch{return send(res,400,{error:'URL tidak sah'})}
  const target=path.resolve(webRoot,'.'+(rel==='/'?'/index.html':rel));
  if(target!==webRoot&&!target.startsWith(webRoot+path.sep))return send(res,403,{error:'Path tidak sah'});
  try{const buf=await fs.readFile(target);res.statusCode=200;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.end(buf)}
  catch{return send(res,404,{error:'Berkas tidak ditemukan'})}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const lan=process.argv.includes('--lan');
 const port=Number(process.env.JT_A11Y_PORT??8765);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('JT_A11Y_PORT harus 1-65535');
 const host=lan?'0.0.0.0':'127.0.0.1';
 const server=createPreviewServer();
 server.listen(port,host,()=>{
  console.log('PREVIEW AKSESIBILITAS JOGJATRIP (DATA SINTETIS, BOOKING NONAKTIF)');
  console.log('Alamat lokal: http://127.0.0.1:'+port+'/#/beranda');
  if(lan)console.warn('Mode LAN: hanya jalankan di jaringan Wi-Fi tepercaya; akses via IP lokal komputer pada port '+port+'. Tutup dengan Ctrl+C.');
  else console.log('Akses dibatasi pada komputer ini. Gunakan --lan hanya untuk pengujian iPhone di Wi-Fi pribadi.');
 });
}
