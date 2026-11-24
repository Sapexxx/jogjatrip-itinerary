'use strict';
// Integrated trip builder: plans are JogjaTrip-owned, bookings provider-owned.
const integrated={hotelId:'',roomId:'',date:'',people:2,quote:null,rec:[],recLoaded:false,source:'catalog',vehicles:[],vehicleError:'',vehicleLoaded:false,vehicleLoading:false,vehicleRequest:0,rental:{startDate:'',endDate:'',withDriver:false,type:'all',category:'all'}};
const ie=id=>document.getElementById(id);
const irup=n=>money(n);
const idate=()=>ie('ibDate').value||tripDate();
const inights=()=>Math.max(1,Number(ie('ibNights').value)||2);
const ipeople=()=>Math.max(1,Number(ie('ibPeople').value)||2);
// Schedule is always chosen by the traveler. This is a local activity time, NOT a provider-confirmed slot.
function jtChooseSchedule({title,date,minDate,maxDate,startTime='',endTime='',info=''}){
 return new Promise(resolve=>{
  const modal=document.createElement('dialog');modal.className='jt-schedule-dialog';
  const wrap=document.createElement('div');wrap.className='jt-schedule-content';
  wrap.innerHTML=`<h3>Atur jadwal ${escapeHTML(title)}</h3><p>Jam ini adalah rencana pribadi, bukan jam reservasi yang sudah disetujui penyedia. Sesuaikan dengan jam buka/tutup dan ketentuan tiket.</p><form method="dialog" class="jt-schedule-form"><label>Tanggal kegiatan<input name="date" type="date" required min="${escapeHTML(minDate)}" max="${escapeHTML(maxDate)}" value="${escapeHTML(date)}"></label><label>Mulai<input name="start" type="time" required value="${escapeHTML(startTime)}"></label><label>Selesai<input name="end" type="time" required value="${escapeHTML(endTime)}"></label><p class="jt-schedule-note">${escapeHTML(info||'Jam operasional belum terverifikasi dari API. Periksa ketentuan penyedia sebelum berkunjung.')}</p><div class="jt-schedule-actions"><button type="button" class="secondary" data-cancel>Batal</button><button type="submit" class="dark">Simpan jadwal</button></div><p class="jt-schedule-error" role="alert"></p></form>`;
  modal.append(wrap);document.body.append(modal);
  const form=wrap.querySelector('form');let finished=false;
  const finish=value=>{if(finished)return;finished=true;modal.close();modal.remove();resolve(value)};
  form.querySelector('[data-cancel]').onclick=()=>finish(null);
  modal.addEventListener('cancel',e=>{e.preventDefault();finish(null)});
  form.onsubmit=e=>{e.preventDefault();const d=form.elements.date.value,st=form.elements.start.value,en=form.elements.end.value;if(!d||!st||!en||en<=st){form.querySelector('.jt-schedule-error').textContent='Pilih tanggal dan pastikan jam selesai lebih besar daripada jam mulai.';return}finish({date:d,startTime:st,endTime:en})};
  modal.showModal();
 });
}
function jtHoursInfo(obj){const v=obj?.openingHours||obj?.opening_hours||obj?.hours||obj?.operatingHours;return typeof v==='string'&&v.trim()?('Informasi jam dari katalog penyedia: '+v):'Jam buka/tutup tidak tersedia dalam data yang telah diverifikasi. Pilihan jam perlu diperiksa terhadap informasi resmi penyedia.'}
function integratedInit(){
 const box=ie('integratedBuilder');if(!box)return;
 box.innerHTML=`<div class="ib-intro"><div><span class="section-tag">BUAT PERJALANAN SESUAI KEBUTUHAN</span><h2>Gabungkan hotel, wisata, dan kendaraan.</h2><p>Semua pilihan layanan bersumber dari API JogjaStay, Wisata Jogja, dan JogjaTrans. Rencana dapat disimpan tanpa checkout.</p></div><span class="ib-step-tag">1. Pilih &nbsp; 2. Susun &nbsp; 3. Pesan</span></div>
 <div class="ib-toolbar"><label>Mulai perjalanan<input id="ibDate" type="date"></label><label>Durasi menginap<select id="ibNights"><option value="1">2 hari / 1 malam</option><option value="2" selected>3 hari / 2 malam</option><option value="4">5 hari / 4 malam</option><option value="6">7 hari / 6 malam</option></select></label><label>Wisatawan<input id="ibPeople" type="number" min="1" max="20" value="2"></label><label>Budget maksimal (Rp)<input id="ibBudget" type="number" min="0" step="50000" placeholder="Opsional"></label></div>
 <div class="ib-columns"><div class="ib-catalog"><div class="ib-tabs"><button class="ib-tab active" data-ib-tab="hotel">1. Pilih Hotel</button><button class="ib-tab" data-ib-tab="wisata">2. Pilih Wisata</button><button class="ib-tab" data-ib-tab="transport">3. Pilih Transportasi</button></div><div id="ibHotelOptions"></div><div id="ibWisataOptions" hidden></div><div id="ibTransportOptions" hidden></div></div><div class="ib-workspace"><div class="ib-workspace-head"><span class="section-tag">ITINERARY SAYA</span><h3 id="ibTitle">Perjalanan belum dirancang</h3><p>Tambahkan hotel, wisata, atau transportasi untuk menyusun jadwal harian.</p></div><div id="ibDays"></div><div id="ibSelected" class="ib-selected"></div><div class="ib-btns"><button class="outlinewide" id="ibSave">Simpan itinerary</button><button class="outlinewide" id="ibSync">Sinkronkan status booking</button><button class="dark wide" id="ibQuote">Periksa harga & stok</button></div><div id="ibQuoteResult"></div><div class="ib-customer" id="ibCustomer" hidden><h4>Detail pemesan</h4><div class="fields"><label>Nama<input id="ibName" autocomplete="name"></label><label>Email<input id="ibEmail" type="email" autocomplete="email"></label><label>Nomor telepon<input id="ibPhone" autocomplete="tel"></label></div><button class="primary wide" id="ibBook">Konfirmasi booking ke penyedia</button><small>Demo akademik. Provider menyimpan reservasi asli. Pembayaran tidak riil. Jangan ulang checkout jika status UNKNOWN.</small></div><p id="ibHint" class="ib-hint">Aktivitas pribadi dapat ditambahkan melalui Pengaturan agenda manual.</p></div></div>`;
 ie('ibDate').value=$('#planStart').value||tripDate();ie('ibDate').min=dateStr(new Date());
 ['ibDate','ibNights','ibPeople','ibBudget'].forEach(id=>ie(id).onchange=()=>{integrated.quote=null;if(id==='ibDate'||id==='ibNights'){integratedResetRental();if(!ie('ibTransportOptions').hidden)integratedLoadVehicles()}integratedRender()});
 document.querySelectorAll('[data-ib-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-ib-tab]').forEach(x=>x.classList.toggle('active',x===b));ie('ibHotelOptions').hidden=b.dataset.ibTab!=='hotel';ie('ibWisataOptions').hidden=b.dataset.ibTab!=='wisata';ie('ibTransportOptions').hidden=b.dataset.ibTab!=='transport';if(b.dataset.ibTab==='transport'&&!integrated.vehicleLoaded&&!integrated.vehicleLoading){if(!integrated.rental.startDate)integratedResetRental();integratedLoadVehicles()}});
 ie('ibSave').onclick=async()=>{await integratedSave()};
 ie('ibQuote').onclick=integratedQuote;
 ie('ibBook').onclick=integratedBook;
 ie('ibSync').onclick=integratedSync;
 integratedRender();
}
function integratedResetRental(start=idate(),end=endDate(start,inights())){
 Object.assign(integrated.rental,{startDate:start,endDate:end});
 integrated.vehicleRequest++;integrated.vehicleLoaded=false;integrated.vehicleLoading=false;integrated.vehicleError='';integrated.vehicles=[];
}
function integratedOpenTransport({fromHome=false,startDate,endDate:finish,people}={}){
 page('journey');
 if(fromHome){
  const start=startDate||tripDate();
  ie('ibDate').value=start;
  if(people)ie('ibPeople').value=people;
  else ie('ibPeople').value=guests();
  if(!startDate)ie('ibNights').value=String(nights());
  integratedResetRental(start,finish||endDate(start,inights()));
 }
 document.querySelector('[data-ib-tab="transport"]')?.click();
 ie('integratedBuilder')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function integratedRentalDays(r=integrated.rental){return Math.round((Date.parse(r.endDate+'T00:00:00Z')-Date.parse(r.startDate+'T00:00:00Z'))/86400000)+1}
async function integratedLoadVehicles(){
 const r={...integrated.rental},seq=++integrated.vehicleRequest;
 integrated.vehicles=[];integrated.vehicleError='';integrated.vehicleLoaded=false;
 if(!r.startDate||!r.endDate||r.startDate<dateStr(new Date())||!Number.isInteger(integratedRentalDays(r))||integratedRentalDays(r)<1||integratedRentalDays(r)>30){integrated.vehicleLoading=false;integrated.vehicleError='Pilih tanggal sewa mulai hari ini dengan durasi 1–30 hari.';integratedRender();return}
 integrated.vehicleLoading=true;integratedRender();
 try{
  const params=new URLSearchParams({startDate:r.startDate,endDate:r.endDate,withDriver:String(r.withDriver),type:r.type,category:r.category});
  const result=await request('/api/catalog/vehicles?'+params);
  if(seq!==integrated.vehicleRequest)return;
  if(result.provider!=='transport'||!Array.isArray(result.items))throw Error('Format respons JogjaTrans tidak sesuai');
  integrated.vehicles=result.items;
  integrated.vehicleLoaded=true;
 }catch(e){if(seq!==integrated.vehicleRequest)return;integrated.vehicles=[];integrated.vehicleError=e.message;}
 finally{if(seq===integrated.vehicleRequest){integrated.vehicleLoading=false;integratedRender()}}
}
function integratedTransportSummary(){
 const el=ie('v4TransportSummary'),check=ie('v4UseTransport');if(!el||!check)return;
 const acts=planState.activities.filter(a=>a.sourceItem?.type==='transport');
 if(!acts.length){el.hidden=true;el.innerHTML='';return}
 check.checked=true;el.hidden=false;
 el.innerHTML='<strong>'+acts.length+' kendaraan dipilih</strong>'+acts.map(a=>'<small>'+escapeHTML(a.title)+' · '+integratedRentalDays(a.sourceItem)+' hari · '+(a.sourceItem.withDriver?'Dengan sopir':'Lepas kunci')+'</small>').join('')+'<div class="v4-transport-actions"><button type="button" data-transport-change>Ubah pilihan</button>'+(acts.some(a=>!a.orderId)?'<button type="button" data-transport-remove>Hapus pilihan</button>':'')+'</div>';
 el.querySelector('[data-transport-change]').onclick=()=>integratedOpenTransport();
 el.querySelector('[data-transport-remove]')?.addEventListener('click',()=>{planState.activities=planState.activities.filter(a=>a.sourceItem?.type!=='transport'||a.orderId);integrated.quote=null;check.checked=planState.activities.some(a=>a.sourceItem?.type==='transport');integratedRender()});
}
function integratedTransportPreference(){
 const check=ie('v4UseTransport');if(!check)return;
 check.onchange=()=>{if(!check.checked){const existing=planState.activities.filter(a=>a.sourceItem?.type==='transport');if(existing.some(a=>a.orderId)){check.checked=true;toast('Kendaraan yang telah memiliki pesanan tidak dapat dihapus');return}if(existing.length&&!confirm('Hapus pilihan transportasi dari itinerary?')){check.checked=true;return}planState.activities=planState.activities.filter(a=>a.sourceItem?.type!=='transport');integrated.quote=null;integratedRender()}else{integratedOpenTransport({fromHome:true})}};
}
function ihotelRegion(h){return v4HotelRegion(h)}
function idestinationRegion(d){return v4DestinationRegion(d)}
function integratedRender(){
 if(!ie('ibHotelOptions'))return;
 const hotels=state.hotels||[],rooms=state.rooms||[],destinations=state.destinations||[];
 const area=($('#region').value||'').trim();const match=area?v4Region(area):'';
 const selectedHotel=planState.activities.find(a=>a.sourceItem?.type==='hotel');
 const hotelFiltered=hotels.filter(h=>!match||ihotelRegion(h)===match);
 ie('ibHotelOptions').innerHTML=`<p class="ib-caption">Pilih hotel dan kamar melalui katalog JogjaStay.</p>${hotelFiltered.slice(0,30).map(h=>{const id=String(h.hotelId||h.id),related=rooms.filter(r=>String(r.hotelId||r.hotel_id)===id);const src=photoURL(h.imageUrl||h.image_url||'');return `<div class="ib-hotel"><div class="ib-hotel-top">${src?`<img loading="lazy" src="${escapeHTML(src)}" alt="Foto ${escapeHTML(h.name||'hotel')}">`:''}<div><strong>${escapeHTML(h.name)}</strong><small>${escapeHTML(ihotelRegion(h)||'Wilayah belum terpetakan')}</small><span>${related.length} tipe kamar</span></div></div><div class="ib-hotel-controls"><select data-ib-room="${escapeHTML(id)}" aria-label="Pilihan kamar">${related.map(r=>`<option value="${escapeHTML(String(r.roomId||r.id))}">${escapeHTML(r.roomType||r.type||'Kamar')} · ${money(r.pricePerNight||r.price_per_night)} / malam</option>`).join('')}</select><button data-ib-hotel="${escapeHTML(id)}" ${!related.length?'disabled':''}>${selectedHotel?.sourceItem?.hotelId===id?'Ganti kamar':'Pilih hotel'}</button></div></div>`}).join('')||'<p>Belum ada hotel. Periksa koneksi API atau filter wilayah.</p>'}`;
 ie('ibHotelOptions').querySelectorAll('[data-ib-hotel]').forEach(b=>b.onclick=async()=>{const id=b.dataset.ibHotel,h=hotels.find(x=>String(x.hotelId||x.id)===id),roomId=ie('ibHotelOptions').querySelector(`[data-ib-room="${CSS.escape(id)}"]`).value;if(!h)return;const current=planState.activities.find(a=>a.sourceItem?.type==='hotel'&&!a.orderId);const slot=await jtChooseSchedule({title:'check-in '+(h.name||'Hotel'),date:current?.date||idate(),minDate:idate(),maxDate:endDate(idate(),inights()),startTime:current?.startTime||'',endTime:current?.endTime||'',info:'Jam kedatangan yang Anda rencanakan; konfirmasi kebijakan check-in kepada JogjaStay.'});if(!slot)return;const entry={type:'hotel',title:'Check-in '+(h.name||'Hotel'),date:slot.date,startTime:slot.startTime,endTime:slot.endTime,region:ihotelRegion(h),notes:'Jam agenda pilihan wisatawan; kebijakan check-in tetap milik JogjaStay',sourceItem:{type:'hotel',hotelId:id,roomId,checkIn:slot.date,checkOut:endDate(slot.date,inights()),guests:ipeople(),plannedStartTime:slot.startTime,plannedEndTime:slot.endTime}};const existing=planState.activities.findIndex(a=>a.sourceItem?.type==='hotel'&&!a.orderId);if(existing>=0)planState.activities.splice(existing,1,entry);else planState.activities.unshift(entry);integrated.quote=null;integratedRender();await integratedRecommend(id)});
 const recommendations=integrated.recLoaded?integrated.rec:destinations.filter(d=>!match||idestinationRegion(d)===match);
 const budget=Number(ie('ibBudget').value)||0;
 ie('ibWisataOptions').innerHTML=`<p class="ib-caption">${integrated.recLoaded?'Rekomendasi dari API Wisata berdasarkan wilayah hotel (bukan jarak tempuh).':'Pilihan destinasi dari katalog Wisata. Pilih hotel untuk rekomendasi wilayah.'}</p>${recommendations.slice(0,50).map(d=>{const src=photoURL(d.imageUrl||d.image_url||(Array.isArray(d.photos)?d.photos[0]:''));const price=Number(d.price||0);return `<div class="ib-attraction">${src?`<img loading="lazy" src="${escapeHTML(src)}" alt="${escapeHTML(d.name)}">`:''}<div><strong>${escapeHTML(d.name)}</strong><small>${escapeHTML(idestinationRegion(d)||d.region||'Wilayah tidak diketahui')}</small><span>${price?`${money(price)} / tiket (katalog)`:'Harga dicek saat quote'}</span></div><button data-ib-wisata="${escapeHTML(String(d.id))}">Tambah</button></div>`}).join('')||'<p>Tidak ada destinasi pada wilayah yang dipilih.</p>'}`;
 ie('ibWisataOptions').querySelectorAll('[data-ib-wisata]').forEach(b=>b.onclick=async()=>{const d=recommendations.find(x=>String(x.id)===b.dataset.ibWisata);if(!d)return;const taken=planState.activities.filter(a=>a.sourceItem?.type==='wisata').length;const suggestedDay=Math.min(inights(),Math.floor(taken/2));const slot=await jtChooseSchedule({title:'wisata '+d.name,date:endDate(idate(),suggestedDay),minDate:idate(),maxDate:endDate(idate(),inights()),info:jtHoursInfo(d)});if(!slot)return;const a={type:'wisata',title:d.name,date:slot.date,startTime:slot.startTime,endTime:slot.endTime,region:idestinationRegion(d),notes:'Jam agenda dipilih pengguna; bukan slot provider yang terkonfirmasi',sourceItem:{type:'wisata',destinationId:Number(d.id),visitDate:slot.date,quantity:ipeople(),tier:'base',plannedStartTime:slot.startTime,plannedEndTime:slot.endTime}};planState.activities.push(a);integrated.quote=null;integratedRender();toast('Wisata ditambahkan ke itinerary — belum dipesan')});
 const transportBox=ie('ibTransportOptions');
 if(transportBox){
  const r=integrated.rental,opts=(list,current)=>list.map(([value,label])=>'<option value="'+escapeHTML(value)+'" '+(value===current?'selected':'')+'>'+escapeHTML(label)+'</option>').join('');
  const types=[['all','Semua kendaraan'],['motor','Motor'],['mobil','Mobil']];
  const categories=[['all','Semua kategori'],['matic','Matic'],['maxi','Maxi'],['retro','Retro'],['city-car','City car'],['hatchback','Hatchback'],['sedan','Sedan'],['mpv','MPV'],['suv','SUV'],['premium','Premium'],['van','Van']];
  transportBox.innerHTML='<p class="ib-caption">Katalog langsung JogjaTrans. Tanggal akhir termasuk hari sewa. Tarif dan stok merupakan simulasi akademik.</p>'+
   '<div class="ib-rental-filters"><label>Mulai sewa<input type="date" id="ibRentStart" min="'+dateStr(new Date())+'" value="'+escapeHTML(r.startDate||idate())+'"></label><label>Selesai sewa<input type="date" id="ibRentEnd" min="'+escapeHTML(r.startDate||idate())+'" value="'+escapeHTML(r.endDate||endDate(idate(),inights()))+'"></label><label>Jenis kendaraan<select id="ibRentType">'+opts(types,r.type)+'</select></label><label>Sopir<select id="ibRentDriver">'+opts([['false','Lepas kunci'],['true','Dengan sopir']],String(r.withDriver))+'</select></label><label>Kategori<select id="ibRentCategory">'+opts(categories,r.category)+'</select></label><button type="button" class="outlinewide ib-rental-submit" id="ibReloadVehicles" '+(integrated.vehicleLoading?'disabled':'')+'>Cari kendaraan & periksa stok</button></div>'+
   '<p class="ib-rental-status '+(integrated.vehicleError?'error':'')+'" role="status">'+escapeHTML(integrated.vehicleLoading?'Mengambil katalog JogjaTrans…':integrated.vehicleError|| (integrated.vehicleLoaded?integrated.vehicles.length+' model kendaraan ditemukan.':'Tentukan filter, lalu cari kendaraan.'))+'</p>'+
   '<div class="ib-rental-results">'+integrated.vehicles.map(v=>{
    const name=v.name||v.id,id=String(v.id),selected=planState.activities.some(a=>a.sourceItem?.type==='transport'&&a.sourceItem.vehicleId===id&&a.sourceItem.startDate===r.startDate&&a.sourceItem.endDate===r.endDate&&a.sourceItem.withDriver===r.withDriver);
    const disabled=selected||v.available!==true||Number(v.unitsAvailable)<1;
    return '<div class="ib-attraction"><div><strong>'+escapeHTML(name)+'</strong><small>'+escapeHTML([v.type,v.category,v.transmission,v.seats?String(v.seats)+' kursi':''].filter(Boolean).join(' · '))+'</small><span>'+money(v.dailyPrice)+' / hari'+(r.withDriver?' + sopir '+money(v.driverDailyPrice)+' / hari':'')+'</span><span><b>'+money(v.totalPrice)+'</b> · '+escapeHTML(String(v.days))+' hari · simulasi · '+escapeHTML(String(v.unitsAvailable))+' unit</span></div><button type="button" data-ib-vehicle="'+escapeHTML(id)+'" '+(disabled?'disabled':'')+'>'+(selected?'Dipilih':disabled?'Habis':'Pilih kendaraan')+'</button></div>';
   }).join('')+'</div>';
  for(const [id,key] of [['ibRentStart','startDate'],['ibRentEnd','endDate'],['ibRentType','type'],['ibRentDriver','withDriver'],['ibRentCategory','category']]){
   ie(id).onchange=()=>{r[key]=key==='withDriver'?ie(id).value==='true':ie(id).value;if(key==='type'&&r.type==='motor')r.withDriver=false;if(key==='withDriver'&&r.withDriver&&r.type==='motor')r.type='mobil';if(key==='type')r.category='all';integrated.vehicleRequest++;integrated.vehicleLoading=false;integrated.vehicleLoaded=false;integrated.vehicles=[];integrated.vehicleError='';integratedRender()};
  }
  ie('ibReloadVehicles').onclick=integratedLoadVehicles;
  transportBox.querySelectorAll('[data-ib-vehicle]').forEach(btn=>btn.onclick=async()=>{
   const v=integrated.vehicles.find(x=>String(x.id)===btn.dataset.ibVehicle);if(!v||v.available!==true||Number(v.unitsAvailable)<1)return;
   const chosen={...r};
   const slot=await jtChooseSchedule({title:'pengambilan '+(v.name||v.id),date:chosen.startDate,minDate:chosen.startDate,maxDate:chosen.startDate,info:'Jam pengambilan adalah rencana pribadi. Sewa mengikuti tanggal yang sudah diperiksa melalui JogjaTrans.'});if(!slot)return;
   const item={type:'transport',vehicleId:String(v.id),startDate:chosen.startDate,endDate:chosen.endDate,withDriver:chosen.withDriver,plannedStartTime:slot.startTime,plannedEndTime:slot.endTime};
   if(planState.activities.some(a=>a.sourceItem?.type==='transport'&&a.sourceItem.vehicleId===item.vehicleId&&a.sourceItem.startDate===item.startDate&&a.sourceItem.endDate===item.endDate&&a.sourceItem.withDriver===item.withDriver)){toast('Kendaraan ini sudah dipilih untuk periode tersebut');return}
   if(planState.activities.length>=30){toast('Maksimal 30 aktivitas');return}
   planState.activities.push({type:'transport',title:'Sewa '+(v.name||v.id),date:chosen.startDate,startTime:slot.startTime,endTime:slot.endTime,notes:'Harga dan stok rental simulasi; '+(chosen.withDriver?'dengan sopir':'lepas kunci'),sourceItem:item});
   if(ie('v4UseTransport'))ie('v4UseTransport').checked=true;
   integrated.quote=null;integratedRender();toast('Kendaraan ditambahkan ke itinerary, belum dipesan');
  });
 }
 integratedTransportSummary();
 const acts=planState.activities;
 const tripStart=acts.map(a=>a.date).concat([idate()]).sort()[0];const tripEnd=acts.map(a=>a.sourceItem?.checkOut||a.sourceItem?.endDate||a.date).concat([endDate(idate(),inights())]).sort().at(-1);
 ie('ibTitle').textContent=$('#planTitle').value||'Perjalanan Yogyakarta';
 const days=[];for(let d=tripStart;d<=tripEnd && days.length<16;d=endDate(d,1)){days.push({date:d,items:acts.filter(a=>a.date===d)})}
 ie('ibDays').innerHTML=days.map((d,i)=>`<div class="ib-day"><div><b>Hari ${i+1}</b><small>${escapeHTML(d.date)}</small></div>${d.items.length?d.items.slice().sort((a,b)=>(a.startTime||'99:99').localeCompare(b.startTime||'99:99')).map(a=>`<div class="ib-day-line"><span>${escapeHTML(a.startTime||'Jam belum dipilih')} ${a.endTime?'– '+escapeHTML(a.endTime):''}</span><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(a.syncError||a.bookingStatus|| (a.sourceItem?'Belum dipesan':'Agenda pribadi'))}</small>${!a.orderId?`<button type="button" class="ib-edit-time" data-ib-edit="${acts.indexOf(a)}">Atur jam</button>`:''}</div>`).join(''):'<p>Waktu bebas — tambah aktivitas bila diperlukan.</p>'}</div>`).join('');
 ie('ibDays').querySelectorAll('[data-ib-edit]').forEach(b=>b.onclick=async()=>{const a=acts[Number(b.dataset.ibEdit)];if(!a||a.orderId)return;const slot=await jtChooseSchedule({title:a.title,date:a.date,minDate:idate(),maxDate:endDate(idate(),inights()),startTime:a.startTime||'',endTime:a.endTime||'',info:a.type==='hotel'?'Pastikan jadwal sesuai kebijakan check-in penginapan.':jtHoursInfo((state.destinations||[]).find(d=>String(d.id)===String(a.sourceItem?.destinationId)))});if(!slot)return;a.date=slot.date;a.startTime=slot.startTime;a.endTime=slot.endTime;if(a.sourceItem){a.sourceItem.plannedStartTime=slot.startTime;a.sourceItem.plannedEndTime=slot.endTime}if(a.sourceItem?.type==='wisata')a.sourceItem.visitDate=slot.date;if(a.sourceItem?.type==='transport'){const oldIn=a.sourceItem.startDate,oldOut=a.sourceItem.endDate,days=Math.max(1,Math.round((new Date(oldOut+'T12:00:00')-new Date(oldIn+'T12:00:00'))/86400000)+1);a.sourceItem.startDate=slot.date;a.sourceItem.endDate=endDate(slot.date,days-1)}if(a.sourceItem?.type==='hotel'){const oldIn=a.sourceItem.checkIn,oldOut=a.sourceItem.checkOut;const n=Math.max(1,Math.round((new Date(oldOut+'T12:00:00')-new Date(oldIn+'T12:00:00'))/86400000));a.sourceItem.checkIn=slot.date;a.sourceItem.checkOut=endDate(slot.date,n)}integrated.quote=null;integratedRender()});
 ie('ibSelected').innerHTML=acts.filter(a=>a.sourceItem).map(a=>`<div class="ib-pill"><span>${escapeHTML(a.title)} <small>${escapeHTML(a.bookingStatus||'Belum dipesan')}</small></span>${a.orderId?'<span class="ib-locked">Terkunci</span>':`<button data-ib-remove="${escapeHTML(a.id||'')}" data-ib-index="${acts.indexOf(a)}" aria-label="Hapus pilihan">×</button>`}</div>`).join('');
 ie('ibSelected').querySelectorAll('[data-ib-index]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.ibIndex);if(planState.activities[i]?.orderId)return;planState.activities.splice(i,1);if(!planState.activities.some(a=>a.sourceItem?.type==='hotel'))integrated.rec=[];integrated.recLoaded=false;integrated.quote=null;integratedRender()});
 ie('ibCustomer').hidden=!integrated.quote?.available;
 planActivityEditor();
}
async function integratedRecommend(id){try{const r=await request('/api/recommendations?hotelId='+encodeURIComponent(id));integrated.rec=r.destinations||[];integrated.recLoaded=true;integratedRender();document.querySelector('[data-ib-tab="wisata"]').click();ie('ibHint').textContent=r.reason}catch(e){integrated.rec=[];integrated.recLoaded=false;integratedRender();ie('ibHint').textContent='Rekomendasi belum tersedia: '+e.message}}
async function integratedSave(){
 const acts=planState.activities;
 if(!$('#planTitle').value.trim())$('#planTitle').value='Perjalanan Jogja';
 const dates=acts.flatMap(a=>[a.date,...(a.sourceItem?.checkOut?[a.sourceItem.checkOut]:[]),...(a.sourceItem?.endDate?[a.sourceItem.endDate]:[])]).concat([idate(),endDate(idate(),inights())]).sort();
 if(!$('#planStart').value||$('#planStart').value>dates[0])$('#planStart').value=dates[0];
 if(!$('#planEnd').value||$('#planEnd').value<dates.at(-1))$('#planEnd').value=dates.at(-1);
 const draft=planDraft();const opts={method:planState.id?'PUT':'POST',headers:planState.id?{'X-Plan-Token':planState.accessToken}:{},body:JSON.stringify(draft)};
 const res=await request(planState.id?'/api/itineraries/'+encodeURIComponent(planState.id):'/api/itineraries',opts);
 const p=planState.id?res:res.itinerary;
 if(!planState.id){planState.id=p.id;planState.accessToken=res.accessToken}
 planState.activities=p.activities||[];
 localStorage.setItem('jt_plan_auth',JSON.stringify({id:planState.id,token:planState.accessToken}));
 $('#planInfo').textContent='Tersimpan · '+p.id;
 integratedRender();toast('Itinerary tersimpan secara mandiri');return p;
}
async function integratedQuote(){try{if(!planState.activities.some(a=>a.sourceItem&&!a.orderId)){toast('Tambahkan hotel, wisata, atau kendaraan yang belum dipesan');return}await integratedSave();const q=await request(`/api/itineraries/${encodeURIComponent(planState.id)}/quote`,{method:'POST',headers:{'X-Plan-Token':planState.accessToken},body:'{}'});integrated.quote=q;const limit=Number(ie('ibBudget').value)||0;const over=limit>0&&q.total>limit;ie('ibQuoteResult').innerHTML=`<div class="ib-cost"><h4>Rincian harga dari API</h4>${q.items.map(x=>`<div class="price-row"><span>${escapeHTML(x.title)} ${x.error?'<small>· '+escapeHTML(x.error)+'</small>':''}</span><strong>${x.available?money(x.amount):'Tidak tersedia'}</strong></div>`).join('')}<div class="price-row total"><span>Total sebelum diskon</span><strong>${money(q.total)}</strong></div>${over?'<p class="sync-error">Melebihi budget. Ubah pilihan layanan sebelum checkout.</p>':''}<small>Harga belum termasuk diskon curated package; quote akan diperiksa lagi saat booking.</small></div>`;q.available=!over&&q.available;ie('ibCustomer').hidden=!q.available;toast(q.available?'Quote live berhasil':'Periksa ketersediaan atau budget')}catch(e){integrated.quote=null;ie('ibCustomer').hidden=true;toast(e.message)}}
async function integratedBook(){if(!integrated.quote?.available)return;if(!ie('ibName').value.trim()||!ie('ibEmail').value.includes('@')||(planState.activities.some(x=>x.sourceItem?.type==='transport')&&!/^[+0-9 ()-]{9,20}$/.test(ie('ibPhone').value.trim()))){toast('Lengkapi nama dan email');return}if(!confirm('Konfirmasi booking demo ke penyedia? Rental JogjaTrans merupakan simulasi.'))return;const b=ie('ibBook');b.disabled=true;try{const res=await request(`/api/itineraries/${encodeURIComponent(planState.id)}/book`,{method:'POST',headers:{'X-Plan-Token':planState.accessToken},body:JSON.stringify({customer:{name:ie('ibName').value,email:ie('ibEmail').value,phone:ie('ibPhone').value}})});state.orders.unshift({id:res.order.id,token:res.accessToken});localStorage.setItem('jt_orders',JSON.stringify(state.orders));planState.activities=res.itinerary?.activities||planState.activities;integrated.quote=null;integratedRender();ie('ibQuoteResult').innerHTML=`<div class="ib-cost"><h4>Pesanan ${escapeHTML(res.order.id)} · ${escapeHTML(res.order.status)}</h4><p>Referensi tercatat. Periksa detail dan sinkronisasi pada halaman Pesanan.</p></div>`;$('#lookupId').value=res.order.id;$('#lookupToken').value=res.accessToken;toast('Pesanan '+res.order.status+'. Jangan checkout ulang saat status UNKNOWN.')}catch(e){toast(e.message+' — Jika status tidak pasti, jangan checkout ulang; periksa order penyedia.')}finally{b.disabled=false}}
async function integratedSync(){if(!planState.id){toast('Simpan itinerary terlebih dahulu');return}try{const r=await request(`/api/itineraries/${encodeURIComponent(planState.id)}/sync`,{method:'POST',headers:{'X-Plan-Token':planState.accessToken},body:'{}'});planState.activities=r.itinerary.activities;integratedRender();toast('Status booking diperiksa kembali ke penyedia')}catch(e){toast(e.message)}}
integratedInit();
integratedTransportPreference();
// Main catalog is asynchronous. Refresh the integrated selection once loaded.
const oldRenderCatalog=renderCatalog;
renderCatalog=function(){oldRenderCatalog();if(ie('ibHotelOptions'))integratedRender()};
