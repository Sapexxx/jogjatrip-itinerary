// Synthetic provider implementing master Contract 0.2.0 for consumer contract tests.
const kinds={hotel:'lodging',wisata:'tourist_attraction',transport:'vehicle_rental'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const error=(status,code)=>json({code,message:'Fixture rejection'},status);
export const TOKEN='fixture-partner-token-1234567890';
export const OTHER='fixture-other-token-1234567890';
export const KEY='checkout_fixture_0001';
export const query={startDate:'2026-12-12',endDate:'2026-12-14',quantity:1};
export function mockProvider(provider='transport',capacity=2){
 let now=Date.parse('2026-12-01T03:00:00Z'),seq=0;
 const holds=new Map(),keys=new Map(),offers=new Map(),calls=[];
 const expire=()=>{for(const h of holds.values())if(h.reservationState==='awaiting_payment'&&Date.parse(h.expiresAt)<=now)h.reservationState='expired'};
 const remaining=()=>{expire();return capacity-[...holds.values()].filter(h=>['awaiting_payment','reserved'].includes(h.reservationState)).reduce((n,h)=>n+h.quantity,0)};
 const snapshot=h=>({holdId:h.holdId,offerId:h.offerId,reservationState:h.reservationState,paymentState:h.paymentState,totalPrice:h.totalPrice,currency:'IDR',expiresAt:h.expiresAt,externalRef:h.externalRef,...(h.voucher?{voucher:h.voucher}:{})});
 const fetcher=async(url,init)=>{
  const u=new URL(url),headers=new Headers(init.headers),token=headers.get('Authorization'),key=headers.get('Idempotency-Key'),body=init.body?JSON.parse(init.body):null;
  calls.push({path:u.pathname,search:u.search,method:init.method,headers,body,redirect:init.redirect});
  if(!['Bearer '+TOKEN,'Bearer '+OTHER].includes(token))return error(401,'UNAUTHORIZED');
  const p=u.pathname.replace('/api/v1/interop','');
  if(p==='/capabilities'&&init.method==='GET')return json({contract:'0.2.0',provider,entityTypes:[kinds[provider]],holds:true,holdTtlMinutes:15,durableStorage:true,location:'region',maxQuantity:capacity});
  if(p==='/offers'&&init.method==='GET'){
   const startDate=u.searchParams.get('startDate'),endDate=provider==='wisata'?startDate:u.searchParams.get('endDate'),quantity=Number(u.searchParams.get('quantity')||1);
   const count=remaining(),offerId='opaque-fixture-'+(++seq),totalPrice=10000*quantity;
   offers.set(offerId,{quantity,totalPrice});
   return json({provider,generatedAt:new Date(now).toISOString(),offers:[{offerId,provider,entityType:kinds[provider],resourceId:'R-01',regionId:provider==='transport'?null:'diy:kabupaten-sleman',name:'Fixture',description:'',imageUrl:null,price:10000,priceUnit:provider==='hotel'?'night':provider==='wisata'?'ticket':'day',currency:'IDR',period:{startDate,endDate},totalPrice,available:count>=quantity,remaining:count,location:{lat:null,lng:null},attributes:{fixture:true}}]});
  }
  if(p==='/holds'&&init.method==='POST'){
   if(!body?.consent)return error(400,'CONSENT_REQUIRED');
   const scope=token+':'+key,prior=keys.get(scope),serialized=JSON.stringify(body);
   if(prior)return prior.body===serialized?json(prior.response):error(409,'IDEMPOTENCY_CONFLICT');
   const offer=offers.get(body.offerId);
   if(!offer||offer.quantity!==body.quantity)return error(422,'INVALID_OFFER');
   if(remaining()<body.quantity)return error(409,'NOT_AVAILABLE');
   const h={holdId:'H-'+(++seq),offerId:body.offerId,reservationState:'awaiting_payment',paymentState:'unpaid',totalPrice:offer.totalPrice,expiresAt:new Date(now+15*60000).toISOString(),externalRef:body.externalRef,quantity:body.quantity,token};
   holds.set(h.holdId,h);const response=snapshot(h);keys.set(scope,{body:serialized,response});return json(response,201);
  }
  const m=/^\/holds\/([^/]+)(?:\/(confirm|release))?$/.exec(p);if(!m)return error(404,'NOT_FOUND');
  expire();const h=holds.get(decodeURIComponent(m[1]));if(!h||h.token!==token)return error(404,'NOT_FOUND');
  if(!m[2]&&init.method==='GET')return json(snapshot(h));
  if(init.method!=='POST')return error(404,'NOT_FOUND');
  if(m[2]==='confirm'){
   if(h.reservationState==='expired')return error(409,'HOLD_EXPIRED');
   if(h.reservationState==='cancelled')return error(409,'HOLD_RELEASED');
   h.reservationState='reserved';h.voucher??={code:'V-'+h.holdId,note:'Simulasi tanpa pembayaran'};
   return json({holdId:h.holdId,reservationState:h.reservationState,paymentState:h.paymentState,voucher:h.voucher});
  }
  if(h.reservationState==='reserved')return error(409,'ALREADY_CONFIRMED');
  h.reservationState='cancelled';return json({holdId:h.holdId,reservationState:'cancelled'});
 };
 return {fetcher,calls,remaining,advance:ms=>{now+=ms}};
}
