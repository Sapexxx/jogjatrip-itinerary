import type { WorkerEnv } from './types.ts';
import {createInteropReadGateway} from './interop-gateway.ts';
import {JournalError} from './interop-journal.ts';
import {createMaterialSelectionPolicy} from './interop-selection.ts';
import {createInteropPlanPreparation,PreparationError} from './interop-plan-preparation.ts';
import {ApiError,fail,json,readJSON,noSecret,semanticVocabulary} from './core.ts';
import {catalog,recommendations} from './provider.ts';
import {quote,book,getOrder,syncOrder,details} from './orders.ts';
import {createPlan,getPlan,updatePlan,analyze,quotePlan,bookPlan,syncPlan} from './plans.ts';
import {authorizedPlan,authorizedOrder} from './db.ts';
import {templates,getPackage,expand,bookPackage,planFromOrder} from './packages.ts';
function parts(path: string){return path.split('/').filter(Boolean)}
async function handle(req: Request,env: WorkerEnv): Promise<Response>{if(!env.DB)fail(503,'Binding Cloudflare D1 belum dikonfigurasi');let u=new URL(req.url),p=parts(u.pathname),method=req.method;
 if(p[0]!=='api')return env.ASSETS.fetch(req);
 // I5: recover the original persisted checkout without repeating preflight or creating an order.
 if(p.length===5&&p[1]==='interop'&&p[2]==='itineraries'&&p[4]==='prepare'&&method==='GET'){
  if(env.INTEROP_HOLDS!=='true')fail(404,'Endpoint tidak tersedia');
  const result=await createInteropPlanPreparation(env,()=>{throw Error('Recovery must not fetch providers')}).recover(p[3],req,req.headers.get('X-Checkout-Key')||'',req.headers.get('X-Interop-Token')||'');
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
 }
 // I5: authenticated PLAN-only preparation. No provider mutation; no built-in
 // trusted selection verifier unless the separate prepare-only flag is enabled.
 if(p.length===5&&p[1]==='interop'&&p[2]==='itineraries'&&p[4]==='prepare'&&method==='POST'){
  if(env.INTEROP_HOLDS!=='true')fail(404,'Endpoint tidak tersedia');
  const input=await readJSON(req);
  const enabled=env.INTEROP_PREPARE_ENABLED==='true'&&env.BOOKING_ENABLED==='false';
  const fetcher=(url:string,init:RequestInit)=>fetch(url,init);
  if(enabled){
   const origin=req.headers.get('Origin');
   if(origin!==null&&origin!==u.origin)fail(403,'Origin checkout tidak valid');
   if(!Array.isArray(input?.approvedItems))throw new PreparationError('APPROVED_SELECTION_REQUIRED',400);
  }
  const output=await createInteropPlanPreparation(env,fetcher,enabled?createMaterialSelectionPolicy(env,fetcher):{}).prepare(p[3],req,input);
  return new Response(JSON.stringify(output),{status:output.created?201:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 // I4/I5: token-authenticated, read-only D1 status. No provider calls or mutation.
 if(p.length===4&&p[1]==='interop'&&p[2]==='checkouts'&&method==='GET'){
  if(env.INTEROP_HOLDS!=='true')fail(404,'Endpoint tidak tersedia');
  const token=req.headers.get('X-Interop-Token')||'';
  const snapshot=await createInteropReadGateway(env.DB).lookup(p[3],token);
  return new Response(JSON.stringify(snapshot),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
 }
 if(p.length===2&&p[1]==='semantic'&&method==='GET')return json(semanticVocabulary);
 if(p.length===2&&p[1]==='health'&&method==='GET')return json({service:'JogjaTrip',status:'ok',storage:'cloudflare-d1',bookingEnabled:env.BOOKING_ENABLED==='true',interopPreparationEnabled:env.INTEROP_HOLDS==='true'&&env.INTEROP_PREPARE_ENABLED==='true'&&env.BOOKING_ENABLED==='false',providers:{hotel:!!env.HOTEL_API_URL,wisata:!!env.WISATA_API_URL,transport:!!env.TRANSPORT_API_URL},note:'Konfigurasi URL bukan pemeriksaan konektivitas provider'});
 if(p.length===3&&p[1]==='catalog'&&method==='GET')return json(await catalog(env,p[2],u.searchParams.get('region')||'',u.searchParams));
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
export default {async fetch(request: Request,env: WorkerEnv): Promise<Response>{try{return await handle(request,env)}catch(err){if(err instanceof ApiError)return json({error:err.message},err.code);if(err instanceof PreparationError){return new Response(JSON.stringify({error:err.code}),{status:err.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}if(err instanceof JournalError){return new Response(JSON.stringify({error:err.status===404?'Checkout tidak ditemukan atau token tidak valid':'Status checkout belum dapat diverifikasi'}),{status:err.status===404?404:409,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}console.error('Worker error',err?.stack||err);return json({error:'Kesalahan server. Periksa Workers Logs dan konfigurasi D1.'},503)}}};
