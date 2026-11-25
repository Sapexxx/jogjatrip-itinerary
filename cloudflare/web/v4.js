'use strict';
// V4 discovery is presentation + recommendation on LIVE, read-only provider catalogs.
// All actual booking and price verification stays in Go's original API/saga.
const v4Blueprints = [
 {id:'city-sleman',name:'Jejak Kota & Sleman',nights:2,theme:'Budaya',regions:['Kota Yogyakarta','Sleman'],description:'Budaya, sejarah, dan destinasi ikonik di dua wilayah DIY.',photo:'/images/prambanan.jpg'},
 {id:'three-areas',name:'Jelajah Tiga Wilayah',nights:4,theme:'Jelajah',regions:['Kota Yogyakarta','Sleman','Bantul'],description:'Rangkaian budaya dan wisata lintas tiga wilayah.',photo:'/images/heritage.jpg'},
 {id:'five-areas',name:'Eksplorasi Lima Wilayah DIY',nights:6,theme:'Jelajah',regions:['Kota Yogyakarta','Sleman','Bantul','Gunungkidul','Kulon Progo'],description:'Perjalanan lintas seluruh wilayah DIY yang dapat disesuaikan.',photo:'/images/landscape.jpg'},
 {id:'south-coast',name:'Jelajah Pesisir Selatan',nights:2,theme:'Pantai',regions:['Bantul','Gunungkidul'],description:'Inspirasi perjalanan pantai selatan dengan penginapan dan kunjungan wisata.',photo:'/images/landscape.jpg'},
 {id:'north-nature',name:'Pesona Alam Sleman',nights:2,theme:'Alam',regions:['Sleman'],description:'Liburan singkat di wilayah Sleman dengan wisata pilihan.',photo:'/images/heritage.jpg'},
 {id:'west-explorer',name:'Dari Kota ke Kulon Progo',nights:4,theme:'Jelajah',regions:['Kota Yogyakarta','Kulon Progo'],description:'Eksplorasi kota dan pesona wilayah barat Yogyakarta.',photo:'/images/landscape.jpg'}
];
let v4Candidates=[];let v4Theme='all';
const v4Catalog={hotels:[],rooms:[],destinations:[],loaded:false};
const v4El=id=>document.getElementById(id);
const v4Region=str=>{
  const s=String(str||'').toLowerCase().normalize('NFKD').replace(/[^a-z\s-]/g,' ').replace(/kabupaten|kota|daerah istimewa|provinsi|diy|yogyakarta|jogja/g,m=>m==='yogyakarta'||m==='jogja'?' jogja ':' ').replace(/\s+/g,' ').trim();
  if(/sleman/.test(s))return 'Sleman';
  if(/bantul/.test(s))return 'Bantul';
  if(/gunungkidul|gunung kidul/.test(s))return 'Gunungkidul';
  if(/kulon progo|kulonprogo/.test(s))return 'Kulon Progo';
  if(/jogja/.test(s)||/malioboro|kraton|keraton|prawirotaman|sosrokusuman|sudirman/.test(s))return 'Kota Yogyakarta';
  return '';
};
function v4DestinationRegion(d){return v4Region([d.region,d.city,d.area].filter(Boolean).join(' '))}
function v4HotelRegion(h){return v4Region([h.city,h.region,h.area].filter(Boolean).join(' '))}
function v4PriceHotel(h){const id=String(h.hotelId||h.id);const room=v4Catalog.rooms.filter(r=>String(r.hotelId||r.hotel_id)===id&&Number(r.pricePerNight||r.price_per_night)>0).sort((a,b)=>Number(a.pricePerNight||a.price_per_night)-Number(b.pricePerNight||b.price_per_night))[0];return room?{room,price:Number(room.pricePerNight||room.price_per_night)}:null}
function v4AddDays(date,n){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return dateStr(d)}
function v4BuildCandidates(){
 const usingHotel=v4El('v4UseHotel').checked,usingWisata=v4El('v4UseWisata').checked;
 const budget=Number(v4El('v4Budget').value)||Infinity,duration=v4El('v4Duration').value;
 const wanted=v4Region(v4El('region').value);
 const count=Number(v4El('guests').value)||2;
 const options=[];
 for(const bp of v4Blueprints){
  if(duration!=='all'&&Number(duration)!==bp.nights)continue;
  if(v4Theme!=='all'&&bp.theme!==v4Theme)continue;
  if(wanted&&!bp.regions.includes(wanted))continue;
  if(!usingHotel&&!usingWisata)continue;
  const hotels=usingHotel?v4Catalog.hotels.filter(h=>bp.regions.includes(v4HotelRegion(h))).map(h=>({hotel:h,roomInfo:v4PriceHotel(h)})).filter(x=>x.roomInfo).sort((a,b)=>a.roomInfo.price-b.roomInfo.price):[];
  const destinations=usingWisata?v4Catalog.destinations.filter(d=>bp.regions.includes(v4DestinationRegion(d))).sort((a,b)=>bp.regions.indexOf(v4DestinationRegion(a))-bp.regions.indexOf(v4DestinationRegion(b))):[];
  if(usingHotel&&!hotels.length)continue;
  if(usingWisata&&!destinations.length)continue;
  const firstHotel=hotels[0]||null;
  // Up to four different, actual destinations. Never invent missing provider IDs.
  const chosen=[]; const seen=new Set();
  for(const region of bp.regions){const d=destinations.find(x=>v4DestinationRegion(x)===region&&!seen.has(String(x.id)));if(d){chosen.push(d);seen.add(String(d.id))}}
  for(const d of destinations){if(chosen.length>=Math.min(10,bp.nights*2+1))break;if(!seen.has(String(d.id))){chosen.push(d);seen.add(String(d.id))}}
  if(usingWisata&&bp.regions.some(region=>!chosen.some(d=>v4DestinationRegion(d)===region)))continue;
  const hotelPrice=firstHotel?firstHotel.roomInfo.price*bp.nights:0;
  const wisataPrices=chosen.map(d=>Number(d.price||d.priceFrom||0));
  const completePrice=(!usingHotel||!!firstHotel)&&(!usingWisata||chosen.length>0&&wisataPrices.every(x=>x>0));
  const estimate=hotelPrice+wisataPrices.reduce((acc,x)=>acc+x*count,0);
  if(completePrice&&estimate>budget)continue;
  options.push({...bp,usingHotel,usingWisata,hotel:firstHotel,visits:chosen,estimate:completePrice?estimate:null,travelers:count});
 }
 return options;
}
function v4RenderFeatured(){
 const el=v4El('v4FeaturedCards');if(!el)return;
 v4Candidates=v4BuildCandidates();
 if(!v4Candidates.length){el.innerHTML='<div class="v4-loading"><strong>Belum ada paket sesuai filter dan katalog saat ini.</strong><p>Ubah budget, wilayah, pilihan layanan, atau periksa kembali koneksi provider. Tidak ada harga atau destinasi buatan.</p></div>';return;}
 el.innerHTML=v4Candidates.map((p,i)=>`<article class="v4-package-card"><div class="v4-package-cover"><img src="${escapeHTML(p.photo)}" alt="Suasana wisata di Daerah Istimewa Yogyakarta" loading="lazy" width="480" height="320" decoding="async"><span class="v4-package-badge">${p.nights+1} hari ${p.nights} malam</span></div><div class="v4-package-body"><span class="v4-theme-label">${escapeHTML(p.theme)} · ${p.visits.length} destinasi dari API</span><div class="v4-region-tags">${p.regions.map(x=>`<span>${escapeHTML(x)}</span>`).join('')}</div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description)}</p><div class="v4-services-tags"><span>⌂ ${p.hotel?`${p.nights} malam hotel`:'Tanpa hotel'}</span><span>✧ ${p.visits.length} wisata</span><span>Budget menyesuaikan</span></div><div class="v4-price"><div><strong>${p.estimate!==null?money(p.estimate):'Cek harga live'}</strong><small>${p.estimate!==null?'Estimasi katalog / paket, sebelum quote':'Harga belum lengkap dari katalog'}</small></div><button type="button" data-v4-package="${i}">Lihat itinerary ↗</button></div></div></article>`).join('');
 el.querySelectorAll('[data-v4-package]').forEach(b=>b.addEventListener('click',()=>{page('explore');v4OpenCandidate(v4Candidates[Number(b.dataset.v4Package)])}));
 const all=v4El('allSmartPackages');if(all){all.innerHTML=el.innerHTML;all.querySelectorAll('[data-v4-package]').forEach(b=>b.addEventListener('click',()=>{page('explore');v4OpenCandidate(v4Candidates[Number(b.dataset.v4Package)])}))}
}
// Dates and times are traveler-editable suggestions. Never claim booked time slots from a catalog price.
function v4EnsureSlots(p){
 const start=tripDate();const days=p.nights+1;const pool=Math.max(1,days-1);
 if(p.scheduleOrigin!==start){p.scheduleOrigin=start;p.hotelSlot={date:start,startTime:'',endTime:''};p.visitSlots=p.visits.map((d,i)=>({date:v4AddDays(start,Math.floor((i+0.5)*pool/Math.max(1,p.visits.length))),startTime:'',endTime:''}))}
 if(!p.visitSlots||p.visitSlots.length!==p.visits.length){p.visitSlots=p.visits.map((_,i)=>({date:v4AddDays(start,Math.floor((i+0.5)*pool/Math.max(1,p.visits.length))),startTime:'',endTime:''}))}
}
function v4Schedule(p){
 v4EnsureSlots(p);const start=tripDate(),days=p.nights+1;
 const result=Array.from({length:days},(_,i)=>({date:v4AddDays(start,i),index:i+1,region:p.regions[Math.min(p.regions.length-1,Math.floor(i*p.regions.length/days))],items:[]}));
 if(p.hotel){result[0].items.push({kind:'hotel',index:0,title:'Check-in '+(p.hotel.hotel.name||'hotel'),slot:p.hotelSlot});result[days-1].items.push({kind:'checkout',title:'Check-out hotel (waktu mengikuti kebijakan penyedia)'})}
 p.visits.forEach((d,i)=>{const slot=p.visitSlots[i];const target=result.find(x=>x.date===slot.date);if(target){target.items.push({kind:'wisata',index:i,title:d.name||'Destinasi wisata',slot})}});
 return result;
}
function v4OpenCandidate(p,scroll=true){
 if(!p)return;window.v4Current=p;const box=v4El('v4FeaturedDetail'),schedule=v4Schedule(p),start=tripDate(),last=v4AddDays(start,p.nights);
 box.hidden=false;
 const slotRow=item=>{if(item.kind==='checkout')return `<div class="v4-trip-note">${escapeHTML(item.title)}</div>`;const h=item.kind==='hotel',prefix=h?'hotel':'visit',index=h?0:item.index,slot=item.slot;return `<div class="v4-trip-row"><span class="v4-trip-title">${escapeHTML(item.title)}</span><label aria-label="Tanggal ${escapeHTML(item.title)}"><input type="date" data-v4-date="${prefix}:${index}" value="${escapeHTML(slot.date)}" min="${escapeHTML(start)}" max="${escapeHTML(h?start:last)}" ${h?'readonly':''}></label><label aria-label="Jam mulai"><input type="time" data-v4-start="${prefix}:${index}" value="${escapeHTML(slot.startTime)}"></label><label aria-label="Jam selesai"><input type="time" data-v4-end="${prefix}:${index}" value="${escapeHTML(slot.endTime)}"></label></div>`};
 box.innerHTML=`<span class="section-tag">PRATINJAU PERJALANAN · BELUM BOOKING</span><h3>${escapeHTML(p.name)}</h3><p>${p.nights+1} hari ${p.nights} malam · ${p.travelers} tamu · ${escapeHTML(p.regions.join(' • '))}</p><p>Hotel: ${p.hotel?escapeHTML(p.hotel.hotel.name):'Tidak dipilih'} · ${p.visits.length} destinasi nyata dari API. <strong>Anda menentukan sendiri tanggal dan jam tiap kunjungan.</strong> Kunjungan dapat lebih dari satu per hari. Jam harus disesuaikan dengan jam operasional dan tiket penyedia.</p><div class="v4-days">${schedule.map(d=>`<div class="v4-day"><strong>Hari ${d.index} · ${escapeHTML(d.date)} · ${escapeHTML(d.region)}</strong>${d.items.map(slotRow).join('')||'<p>Waktu bebas — bisa ditambahkan aktivitas.</p>'}</div>`).join('')}</div><p class="v4-trip-note">Waktu kosong belum dijadwalkan. Tidak ada batas pukul 15.00; waktu agenda berbeda dari jam reservasi yang diakui provider. Pengaturan ini tidak menjamin tiket berlaku pada jam pilihan.</p><div class="v4-detail-actions"><button type="button" id="v4ToCart">Sesuaikan & Pesan via Itinerary ↗</button><button type="button" class="secondary" id="v4ToPlan">Buat itinerary dari pilihan ini</button></div><p class="v4-unavailable">Harga, stok, dan kebijakan jam dikonfirmasi oleh Hotel dan Wisata saat quote. Tambahkan transportasi JogjaTrans melalui Itinerary Builder. Estimasi paket ini belum mencakup sewa kendaraan.</p>`;
 const updateSlot=(key,value,kind)=>{const [type,n]=key.split(':'),slot=type==='hotel'?p.hotelSlot:p.visitSlots[Number(n)];if(!slot)return;slot[kind]=value};
 box.querySelectorAll('[data-v4-date]').forEach(input=>input.onchange=()=>{updateSlot(input.dataset.v4Date,input.value,'date');v4OpenCandidate(p,false)});
 box.querySelectorAll('[data-v4-start]').forEach(input=>input.onchange=()=>updateSlot(input.dataset.v4Start,input.value,'startTime'));
 box.querySelectorAll('[data-v4-end]').forEach(input=>input.onchange=()=>updateSlot(input.dataset.v4End,input.value,'endTime'));
 v4El('v4ToCart').onclick=()=>v4SelectCandidate(p,true);
 v4El('v4ToPlan').onclick=()=>v4SelectCandidate(p,true);
 if(scroll)box.scrollIntoView({behavior:'smooth',block:'start'});
}
function v4SelectCandidate(p,toPlan){
 const start=tripDate(),items=[];
 v4EnsureSlots(p);
 const slots=[...(p.hotel?[p.hotelSlot]:[]),...p.visitSlots];
 if(slots.some(x=>!x.startTime||!x.endTime||x.endTime<=x.startTime)){toast("Atur jam mulai dan selesai untuk setiap layanan sebelum melanjutkan.");v4OpenCandidate(p);return}
 if(p.hotel){const h=p.hotel.hotel;items.push({item:{type:'hotel',hotelId:String(h.hotelId||h.id),roomId:String(p.hotel.roomInfo.room.roomId||p.hotel.roomInfo.room.id),checkIn:p.hotelSlot.date,checkOut:v4AddDays(p.hotelSlot.date,p.nights),guests:p.travelers,plannedStartTime:p.hotelSlot.startTime,plannedEndTime:p.hotelSlot.endTime},name:h.name,estimate:p.hotel.roomInfo.price*p.nights})}
 p.visits.slice(0,Math.max(0,12-items.length)).forEach((d,i)=>items.push({item:{type:'wisata',destinationId:Number(d.id),visitDate:p.visitSlots[i].date,quantity:p.travelers,tier:'base',plannedStartTime:p.visitSlots[i].startTime,plannedEndTime:p.visitSlots[i].endTime},name:d.name,estimate:Number(d.price||0)*p.travelers}));
 if(!items.length){toast('Tidak ada layanan dari provider yang bisa dipilih');return}
 if(!toPlan){if(state.cart.length&&!confirm('Ganti pilihan layanan di keranjang dengan rekomendasi ini?'))return;state.cart=items;state.quote=null;saveCart();renderCart();}
 if(toPlan){
  // Itinerary draft may contain more items than the legacy cart checkout limit.
  if(planState.id&&!confirm('Buat draft agenda baru? Simpan agenda lama jika dibutuhkan.'))return;
  planState.id=null;planState.accessToken=null;planState.activities=[];
  v4El('planTitle').value=p.name;v4El('planStart').value=start;v4El('planEnd').value=v4AddDays(start,p.nights);
  if(p.hotel)planState.activities.push({type:'hotel',title:'Check-in '+p.hotel.hotel.name,date:p.hotelSlot.date,startTime:p.hotelSlot.startTime,endTime:p.hotelSlot.endTime,region:v4HotelRegion(p.hotel.hotel),notes:'Rencana; belum merupakan reservasi',sourceItem:{type:'hotel',hotelId:String(p.hotel.hotel.hotelId||p.hotel.hotel.id),roomId:String(p.hotel.roomInfo.room.roomId||p.hotel.roomInfo.room.id),checkIn:p.hotelSlot.date,checkOut:v4AddDays(p.hotelSlot.date,p.nights),guests:p.travelers,plannedStartTime:p.hotelSlot.startTime,plannedEndTime:p.hotelSlot.endTime}});
  p.visits.forEach((d,i)=>planState.activities.push({type:'wisata',title:d.name,date:p.visitSlots[i].date,startTime:p.visitSlots[i].startTime,endTime:p.visitSlots[i].endTime,region:v4DestinationRegion(d),notes:'Jam dipilih pengguna; pastikan jam buka dan ketentuan tiket penyedia',sourceItem:{type:'wisata',destinationId:Number(d.id),visitDate:p.visitSlots[i].date,quantity:p.travelers,tier:'base',plannedStartTime:p.visitSlots[i].startTime,plannedEndTime:p.visitSlots[i].endTime}}));
  planActivityEditor();if(typeof integratedRender==='function')integratedRender();page('journey');if(v4El('v4UseTransport')?.checked&&typeof integratedOpenTransport==='function')integratedOpenTransport({fromHome:true,startDate:start,endDate:v4AddDays(start,p.nights),people:p.travelers});toast('Draft itinerary siap diedit dan disimpan. Belum membuat reservasi.');
 }else{page('planner');toast('Pilihan berhasil ditambahkan. Periksa harga live sebelum booking.')}
}
for(const id of ['v4Budget','v4Duration','v4UseHotel','v4UseWisata'])v4El(id).addEventListener('change',v4RenderFeatured);
for(const id of ['region','tripDate','guests'])v4El(id).addEventListener('change',()=>{setTimeout(v4RenderFeatured,10);v4El('v4FeaturedDetail').hidden=true});
v4El('v4AllPackages').onclick=()=>page('packages');
document.querySelectorAll('[data-v4-service]').forEach(btn=>btn.onclick=()=>{selectCatalogTab(btn.dataset.v4Service);document.querySelector('#explore .section-top').scrollIntoView({behavior:'smooth',block:'start'})});
// Render after each successful catalog load, without replacing provider API logic.
async function v4LoadAllCatalogs(){
 const el=v4El('v4FeaturedCards');
 try{
  const paths=['hotels','rooms','destinations'];
  const results=await Promise.all(paths.map(x=>request('/api/catalog/'+x)));
  paths.forEach((p,i)=>v4Catalog[p]=Array.isArray(results[i].items)?results[i].items:[]);
  v4Catalog.loaded=true;v4RenderFeatured();
 }catch(err){if(el)el.innerHTML='<div class="v4-loading">Rekomendasi belum tersedia: '+escapeHTML(err.message)+'. Coba periksa koneksi API Hotel/Wisata dan muat ulang.</div>'}
}
const v4OldRenderCatalog=renderCatalog;
renderCatalog=function(){v4OldRenderCatalog();v4RenderFeatured()};
v4LoadAllCatalogs();

// Tema dan budget hanya menyaring kandidat katalog, bukan mengarang harga.
document.querySelectorAll('[data-v4-theme]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-v4-theme]').forEach(x=>x.classList.toggle('active',x===b));v4Theme=b.dataset.v4Theme;v4RenderFeatured()}));
