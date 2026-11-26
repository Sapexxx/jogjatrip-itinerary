// Cloudflare-compatible domain layer. Provider-confirmed time slots are NOT inferred.
export class ApiError extends Error { code: number; constructor(code: number, message: string){super(message); this.code=code;} }
export const fail=(code,msg)=>{throw new ApiError(code,msg)};
export const iso=()=>new Date().toISOString();
export const txt=v=>v===undefined||v===null?'':String(v);
export const n=v=>Number.isFinite(Number(v))?Number(v):0;
export const rows=x=>Array.isArray(x)?x:Array.isArray(x?.items)?x.items:Array.isArray(x?.data)?x.data:Array.isArray(x?.destinations)?x.destinations:[];
export function asDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) return false;let d=new Date(s+'T12:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s}
export const addDays=(date,days)=>{let d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
export function validTime(a,b){if(!a&&!b)return true;return /^([01]\d|2[0-3]):[0-5]\d$/.test(a||'')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(b||'')&&b>a}
export function validateCustomer(x){if(!x||!txt(x.name).trim()||!/^.+@.+\..+$/.test(txt(x.email))) fail(400,'Nama dan email pemesan wajib valid');}
export function validateItem(it){
  if(!it||!['hotel','wisata','transport'].includes(it.type))fail(400,'Tipe layanan tidak terdaftar');
  if(!validTime(it.plannedStartTime,it.plannedEndTime))fail(400,'Jam mulai/selesai wajib HH:MM dan selesai setelah mulai');
  if(it.type==='hotel'&&(!txt(it.hotelId)||!txt(it.roomId)||!asDate(it.checkIn)||!asDate(it.checkOut)||it.checkOut<=it.checkIn||n(it.guests)<1||n(it.guests)>20))fail(400,'Parameter hotel tidak valid');
  if(it.type==='transport'){
    const days=(Date.parse(it.endDate+'T12:00:00Z')-Date.parse(it.startDate+'T12:00:00Z'))/86400000+1;
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(txt(it.vehicleId))||!asDate(it.startDate)||!asDate(it.endDate)||!Number.isInteger(days)||days<1||days>30||typeof it.withDriver!=='boolean')fail(400,'Parameter rental transportasi tidak valid');
  }
  if(it.type==='wisata'&&(!Number.isInteger(Number(it.destinationId))||n(it.destinationId)<1||!asDate(it.visitDate)||n(it.quantity)<1||n(it.quantity)>20||!['base','plus'].includes(it.tier))) fail(400,'Parameter tiket wisata tidak valid');
}
export function validateTransportPhone(value){if(!/^[+0-9 ()-]{9,20}$/.test(txt(value).trim()))fail(400,'Nomor telepon transportasi harus 9–20 karakter');}
export function validateInput(x,max=5){validateCustomer(x?.customer);if(!Array.isArray(x?.items)||!x.items.length||x.items.length>max)fail(400,`Pilih 1–${max} layanan`);x.items.forEach(validateItem);if(x.items.some(it=>it.type==='transport'))validateTransportPhone(x.customer?.phone);return x}
// Resolve administrative regions from the shared CRS vocabulary using exact aliases.
import vocabulary from '../crs-vocabulary.json' with {type:'json'};
const cleanRegion = raw => txt(raw).trim().toLowerCase().replace(/[-_]/g,' ').replace(/\s+/g,' ');
const regionLookup = new Map();
for (const region of vocabulary.regions) {
  for (const name of [region.label, ...region.aliases, ...Object.values(region.providerRepresentation)]) {
    const key = cleanRegion(name);
    if (regionLookup.has(key) && regionLookup.get(key) !== region.conceptId) throw new Error('Conflicting CRS region alias: ' + name);
    regionLookup.set(key, region.conceptId);
  }
}
const regionById = new Map(vocabulary.regions.map(r => [r.conceptId, r]));
export function regionConcept(raw){return regionLookup.get(cleanRegion(raw)) || '';}
export function regionName(raw){return regionById.get(regionConcept(raw))?.label || '';}
export function regionSlug(raw){const region=regionById.get(regionConcept(raw));return region?.providerRepresentation?.wisata || '';}
export function regionFromFields(...values){
  const ids = new Set(values.map(regionConcept).filter(Boolean));
  if(ids.size>1)fail(422,'Wilayah administratif bertentangan');
  return regionById.get([...ids][0])?.label || '';
}
export const semanticVocabulary = vocabulary;
/** Contract 0.2 distinguishes provider reservation from financial state.
 * This is intentionally separate from legacy status()/recompute() and never
 * infers payment from a confirmed or reserved booking. */
export function contractReservationStatus(raw:unknown):'awaiting_payment'|'reserved'|'cancelled'|'expired'|'UNKNOWN' {
 const state=typeof raw==='string'?raw.trim().toLowerCase():'';
 return state==='awaiting_payment'||state==='reserved'||state==='cancelled'||state==='expired'?state:'UNKNOWN';
}
export function contractPaymentStatus(raw:unknown):'unpaid'|'paid'|'refunded'|'partially_refunded'|'expired'|'not_applicable'|'UNKNOWN' {
 const state=typeof raw==='string'?raw.trim().toLowerCase():'';
 return state==='unpaid'||state==='paid'||state==='refunded'||state==='partially_refunded'||state==='expired'||state==='not_applicable'?state:'UNKNOWN';
}
export function contractState(reservation:unknown,payment:unknown){
 return {reservationState:contractReservationStatus(reservation),paymentState:contractPaymentStatus(payment)};
}
export function status(raw){switch(txt(raw).trim().toUpperCase()){case 'CONFIRMED':case 'PAID':case 'SUCCESS':case 'COMPLETED':case 'CHECKED_IN':case 'CHECKED_OUT':return 'CONFIRMED';case 'DECLINED':case 'REJECTED':return 'DECLINED';case 'CANCELLED':case 'CANCELED':case 'REFUNDED':return 'CANCELLED';case 'FAILED':return 'FAILED';case 'PENDING':case 'HOLD':case 'PROCESSING':case 'RECORDED':case 'CONTACTED':return 'PENDING';default:return 'UNKNOWN'}}
export function recompute(o){let yes=0,bad=0,pending=0,unknown=0,notattempted=0,amount=0,requiredOK=true;for(const a of o.items){if(a.status==='CONFIRMED'){yes++;amount+=n(a.amount)}else if(['DECLINED','CANCELLED','FAILED'].includes(a.status))bad++;else if(['PENDING','IN_FLIGHT'].includes(a.status))pending++;else if(a.status==='NOT_ATTEMPTED')notattempted++;else unknown++;if(o.packageId&&a.required&&a.status!=='CONFIRMED')requiredOK=false}
  o.estimatedSubtotal=o.items.filter(x=>['CONFIRMED','PENDING','IN_FLIGHT'].includes(x.status)).reduce((sum,x)=>sum+n(x.amount),0);
  if(o.packageId){let discount=requiredOK&&unknown===0&&pending===0&&notattempted===0?Math.min(n(o.pricing?.bundleDiscount),amount):0;o.pricing={...o.pricing,appliedDiscount:discount,total:Math.max(0,amount-discount)};o.total=o.pricing.total;o.status=unknown?'UNKNOWN':pending?'PROCESSING':notattempted&&!yes&&!bad?'PROCESSING':!requiredOK?(yes?'PARTIAL':'FAILED'):yes?'CONFIRMED':'FAILED'}else{o.total=amount;o.status=unknown?'UNKNOWN':pending?'PROCESSING':yes===o.items.length&&yes?'CONFIRMED':yes?'PARTIAL':bad||notattempted?'FAILED':'UNKNOWN'}return o}
export const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
export function accessToken(){return hex(crypto.getRandomValues(new Uint8Array(24)))}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function shortId(prefix){let b=crypto.getRandomValues(new Uint8Array(8)),bits=0,buffer=0,out='';for(const x of b){buffer=(buffer<<8)|x;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(buffer>>bits)&31]}}return prefix+out.slice(0,12)}
export function safeId(id,what='order'){const re=what==='plan'?/^PL-[A-Z2-7]{12}$/:/^JT-(?:[A-Z2-7]{12}|[a-f0-9]{32})$/;if(!re.test(id))fail(404,'ID tidak dikenal')}
// Public JSON projection. Do not use this when persisting a provider access token.
export function noSecret(x){return JSON.parse(JSON.stringify(x,(k,v)=>['secretHash','orderLock','providerAccessToken'].includes(k)?undefined:v))}
export function json(body: unknown,statusCode=200){return new Response(JSON.stringify(body),{status:statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export async function readJSON(request: Request,maxBytes=128000){let raw=await request.text();if(raw.length>maxBytes)fail(413,'Payload terlalu besar');try{return JSON.parse(raw)}catch{fail(400,'JSON tidak valid')}}
