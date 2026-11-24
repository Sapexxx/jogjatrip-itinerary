import {fail,validateInput,iso,shortId,accessToken,sha256,status,recompute,noSecret,n,rows,txt} from './core.ts';
import {availability,bookProvider,bookingStatus,cancelHotel,upstream,provider} from './provider.ts';
import {saveOrder,authorizedOrder} from './db.ts';
export async function quote(env,input){validateInput(input);let items=[],total=0;for(let item of input.items){let amount=await availability(env,item);items.push({item,amount});total+=amount}return {items,total,currency:'IDR',simulation:input.items.some(x=>x.type==='transport'),note:'Harga dicek ulang saat pemesanan; pembayaran simulasi.'}}
export async function createOrder(env,customer,items,props={}){
  // Writes durable order before any provider call. Provider booking outcomes are never inferred.
  let token=accessToken(),now=iso();let o={id:shortId('JT-'),secretHash:await sha256(token),status:'PROCESSING',customer,items:items.map(x=>({item:x.item,componentId:x.componentId,addOnId:x.addOnId,required:x.required??false,native:x.native??false,amount:x.amount??0,status:'NOT_ATTEMPTED'})),total:0,revision:0,createdAt:now,updatedAt:now,...props};
  await saveOrder(env,o);return {order:o,accessToken:token};
}
export async function runSaga(env,o,{checkAllFirst=false,compensate=false}={}){
 let aborted=false,uncertain=false;
 for(let i=0;i<o.items.length;i++){
  let oi=o.items[i];if(aborted)break;
  if(oi.native){oi.status='CONFIRMED';o.updatedAt=iso();await saveOrder(env,o);continue}
  try{
   let price=await availability(env,oi.item);
   if(oi.amount>0&&oi.amount!==price)fail(409,'Harga berubah, periksa quote terbaru');
   oi.amount=price;oi.status='IN_FLIGHT';o.updatedAt=iso();await saveOrder(env,o);
  }catch(err){oi.status='FAILED';oi.error=err.message;aborted=true;await saveOrder(env,o);break}
  try{const result=await bookProvider(env,o,i);if(!result.id)throw new Error('Provider tidak mengembalikan ID booking');oi.bookingId=result.id;oi.providerBookingId=result.id;oi.rawStatus=result.raw;if(result.providerAccessToken)oi.providerAccessToken=result.providerAccessToken;oi.status=status(result.raw);if(oi.status==='UNKNOWN'){aborted=true;uncertain=true}else if(['DECLINED','FAILED','CANCELLED'].includes(oi.status))aborted=true}
  catch(err){oi.status='UNKNOWN';oi.error=err.message;aborted=true;uncertain=true}
  o.updatedAt=iso();await saveOrder(env,o);
 }
 if(aborted&&compensate&&!uncertain){for(let i=o.items.length-1;i>=0;i--){let oi=o.items[i];if(oi.native||!['CONFIRMED','PENDING'].includes(oi.status))continue;if(oi.item.type!=='hotel'){oi.syncError='Provider '+oi.item.type+' membutuhkan pembatalan manual';o.requiresManualAction=true;continue}try{let raw=await cancelHotel(env,oi.bookingId);oi.rawStatus=raw;oi.status=status(raw);if(oi.status!=='CANCELLED')o.requiresManualAction=true}catch(err){oi.syncError='Kompensasi gagal: '+err.message;o.requiresManualAction=true}await saveOrder(env,o)}}
 if(uncertain)o.requiresManualAction=true;
 recompute(o);o.updatedAt=iso();o.revision=(o.revision||0)+1;await saveOrder(env,o);return o;
}
export async function book(env,input){validateInput(input);for(let i of input.items){let p=provider(env,i.type);if(i.type!=='transport'&&!p.token)fail(503,`Token partner ${i.type} tidak dikonfigurasi`)}let made=await createOrder(env,input.customer,input.items.map(item=>({item})));let o=await runSaga(env,made.order);return {order:noSecret(o),accessToken:made.accessToken,warning:'Jangan mengulang checkout bila status PARTIAL/UNKNOWN. Status provider harus diperiksa.'}}
export async function refreshOrder(env,o){let now=iso();for(let oi of o.items){if(!oi.bookingId)continue;try{let raw=await bookingStatus(env,oi.item.type,oi.bookingId,oi.providerAccessToken);oi.rawStatus=raw;oi.status=status(raw);oi.lastCheckedAt=now;oi.syncError=''}catch(err){oi.syncError=err.message}}recompute(o);o.lastSyncedAt=now;o.updatedAt=now;o.revision=(o.revision||0)+1;if(o.packageId&&['PARTIAL','FAILED','UNKNOWN'].includes(o.status))o.requiresManualAction=true;await saveOrder(env,o);return o}
export async function getOrder(env,id,req,sync=true){let o=await authorizedOrder(env,id,req);if(sync)await refreshOrder(env,o);return noSecret(o)}
export async function syncOrder(env,id,req){let o=await authorizedOrder(env,id,req);await refreshOrder(env,o);return {order:noSecret(o),note:'Status bersumber dari API provider, kegagalan verifikasi ditampilkan pada syncError.'}}
function nameFrom(x,...keys){for(let k of keys)if(x?.[k]!==undefined&&x?.[k]!==null&&txt(x[k]).trim())return txt(x[k]);return ''}
function absolutePhoto(image,base){try{if(!image)return '';let url=new URL(image,base);return url.protocol==='https:'?url.href:''}catch{return ''}}
export async function details(env,id,req){let o=await authorizedOrder(env,id,req);await refreshOrder(env,o);let transportItems=o.items.filter(v=>v.item.type==='transport');let firstTransport=transportItems[0]?.item;let transportPath=firstTransport?'/api/v1/rentals/vehicles?'+new URLSearchParams({startDate:firstTransport.startDate,endDate:firstTransport.endDate,withDriver:String(firstTransport.withDriver)}):null;
let raw=await Promise.allSettled([upstream(env,'hotel','GET','/api/v1/hotels'),upstream(env,'hotel','GET','/api/v1/rooms'),upstream(env,'wisata','GET','/api/v1/destinations'),transportPath?upstream(env,'transport','GET',transportPath):Promise.resolve(null)]);let hs=raw[0].status==='fulfilled'?rows(raw[0].value):[],rs=raw[1].status==='fulfilled'?rows(raw[1].value):[],ds=raw[2].status==='fulfilled'?rows(raw[2].value):[],vs=raw[3].status==='fulfilled'?(raw[3].value?.vehicles||[]):[];
let data=o.items.map((oi,index)=>{let it=oi.item,d={index,provider:it.type,source:'provider_catalog'};if(it.type==='hotel'){let h=hs.find(v=>nameFrom(v,'hotelId','id')===txt(it.hotelId));let room=rs.find(v=>nameFrom(v,'roomId','id')===txt(it.roomId)&&(!nameFrom(v,'hotelId','hotel_id')||nameFrom(v,'hotelId','hotel_id')===txt(it.hotelId)));if(h){d.name=nameFrom(h,'name','hotelName');d.region=nameFrom(h,'city','region','area');d.address=nameFrom(h,'address','location');d.imageUrl=absolutePhoto(nameFrom(h,'imageUrl','image_url','photoUrl'),provider(env,'hotel').base)}d.productName=nameFrom(room,'roomType','type','name');if(!d.name)d.warning='Nama hotel belum dapat diverifikasi dari katalog JogjaStay'}else if(it.type==='wisata'){let w=ds.find(v=>nameFrom(v,'id','destination_id')===txt(it.destinationId));if(w){d.name=nameFrom(w,'name','title');d.region=nameFrom(w,'region','city');d.address=nameFrom(w,'address','location');d.imageUrl=absolutePhoto(nameFrom(w,'imageUrl','image_url')||w.photos?.[0],provider(env,'wisata').base)}d.productName=it.tier;if(!d.name)d.warning='Nama destinasi belum dapat diverifikasi dari katalog Wisata'}else if(it.type==='transport'){let v=vs.find(x=>txt(x.id)===txt(it.vehicleId));d.name=v?.name||it.vehicleId;d.productName=v?.category||'Sewa kendaraan';d.priceType='SIMULATED';d.note='Harga transportasi adalah simulasi, bukan transaksi pembayaran';}else{d.source='order';d.warning='Komponen non-provider'}return d});return {order:noSecret(o),details:data,note:'Nama/foto hasil katalog live jika tersedia; harga dan status menggunakan catatan reservasi dan provider.'}}
