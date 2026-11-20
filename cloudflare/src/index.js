import {ApiError,fail,json,readJSON,noSecret} from './core.js';
import {catalog,recommendations} from './provider.js';
import {quote,book,getOrder,syncOrder,details} from './orders.js';
import {createPlan,getPlan,updatePlan,analyze,quotePlan,bookPlan,syncPlan} from './plans.js';
import {authorizedPlan,authorizedOrder} from './db.js';
import {templates,getPackage,expand,bookPackage,planFromOrder} from './packages.js';
function parts(path){return path.split('/').filter(Boolean)}
async function handle(req,env){if(!env.DB)fail(503,'Binding Cloudflare D1 belum dikonfigurasi');let u=new URL(req.url),p=parts(u.pathname),method=req.method;
 if(p[0]!=='api')return env.ASSETS.fetch(req);
 if(p.length===2&&p[1]==='health'&&method==='GET')return json({service:'JogjaTrip',status:'ok',storage:'cloudflare-d1',bookingEnabled:env.BOOKING_ENABLED==='true',providers:{hotel:!!env.HOTEL_API_URL,wisata:!!env.WISATA_API_URL},note:'Konfigurasi URL bukan pemeriksaan konektivitas provider'});
 if(p.length===3&&p[1]==='catalog'&&method==='GET')return json(await catalog(env,p[2],u.searchParams.get('region')||''));
 if(p.length===2&&p[1]==='recommendations'&&method==='GET')return json(await recommendations(env,u.searchParams.get('hotelId')||''));
 if(p.length===2&&p[1]==='quote'&&method==='POST')return json(await quote(env,await readJSON(req)));
 if(p.length===2&&p[1]==='book'&&method==='POST'){if(env.BOOKING_ENABLED!=='true')fail(503,'Checkout provider dinonaktifkan sampai pengujian integrasi selesai');return json(await book(env,await readJSON(req)))}
 if(p[1]==='orders'&&p[2]){
  let id=p[2];if(p.length===3&&method==='GET')return json(await getOrder(env,id,req));
  if(p.length===4&&p[3]==='details'&&method==='GET')return json(await details(env,id,req));
  if(p.length===4&&p[3]==='sync'&&method==='POST')return json(await syncOrder(env,id,req));
  if(p.length===4&&p[3]==='itinerary'&&method==='POST'){let o=await authorizedOrder(env,id,req);return json(await planFromOrder(env,o),201)}
 }
 if(p[1]==='itineraries'){
  if(p.length===2&&method==='POST')return json(await createPlan(env,await readJSON(req)),201);
  if(p.length===3&&method==='GET')return json(await getPlan(env,p[2],req));
  if(p.length===3&&method==='PUT')return json(await updatePlan(env,p[2],req,await readJSON(req)));
  if(p.length===4&&p[3]==='analyze'&&method==='POST'){let pl=await authorizedPlan(env,p[2],req);return json(analyze(pl))}
  if(p.length===4&&p[3]==='quote'&&method==='POST'){let pl=await authorizedPlan(env,p[2],req);return json(await quotePlan(env,pl))}
  if(p.length===4&&p[3]==='book'&&method==='POST'){if(env.BOOKING_ENABLED!=='true')fail(503,'Checkout provider dinonaktifkan sampai pengujian integrasi selesai');let pl=await authorizedPlan(env,p[2],req);return json(await bookPlan(env,pl,await readJSON(req)))}
  if(p.length===4&&p[3]==='sync'&&method==='POST'){let pl=await authorizedPlan(env,p[2],req);return json(await syncPlan(env,pl))}
 }
 if(p[1]==='packages'){
  if(p.length===2&&method==='GET')return json({packages:templates});
  if(p.length>=3){let pack=getPackage(p[2]);if(p.length===3&&method==='GET')return json(pack);
   if(p.length===4&&p[3]==='quote'&&method==='POST')return json(await expand(env,pack,await readJSON(req)));
   if(p.length===4&&p[3]==='book'&&method==='POST'){if(env.BOOKING_ENABLED!=='true')fail(503,'Checkout provider dinonaktifkan sampai pengujian integrasi selesai');return json(await bookPackage(env,pack,await readJSON(req)))}
  }
 }
 fail(404,'Endpoint tidak tersedia')
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(err){if(err instanceof ApiError)return json({error:err.message},err.code);console.error('Worker error',err?.stack||err);return json({error:'Kesalahan server. Periksa Workers Logs dan konfigurasi D1.'},503)}}};
