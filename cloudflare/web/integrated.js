'use strict';
// Integrated trip builder: plans are Itinerary Jogja-owned, bookings provider-owned.
const integrated={hotelId:'',roomId:'',date:'',people:2,quote:null,rec:[],recLoaded:false,source:'catalog',vehicles:[],vehicleError:'',vehicleLoaded:false,vehicleLoading:false,vehicleRequest:0,rental:{startDate:'',endDate:'',withDriver:false,type:'all',category:'all'}};
const ie=id=>document.getElementById(id);
const irup=n=>money(n);
const idate=()=>ie('ibDate').value||tripDate();
const inights=()=>Math.max(1,Number(ie('ibNights').value)||2);
const ipeople=()=>Math.max(1,Number(ie('ibPeople').value)||2);
// Schedule is always chosen by the traveler. This is a local activity time, NOT a provider-confirmed slot.
function jtChooseSchedule({title,date,minDate,maxDate,startTime='',endTime='',info=''}){
 return new Promise(resolve=>{
  const modal=document.createElement('dialog');modal.className='jt-schedule-dialog';modal.setAttribute('aria-label','Atur jadwal kegiatan');const priorFocus=document.activeElement;
  const wrap=document.createElement('div');wrap.className='jt-schedule-content';
  wrap.innerHTML=`<h3>Atur jadwal ${escapeHTML(title)}</h3><p>Jam ini adalah rencana pribadi, bukan jam reservasi yang sudah disetujui penyedia. Sesuaikan dengan jam buka/tutup dan ketentuan tiket.</p><form method="dialog" class="jt-schedule-form"><label>Tanggal kegiatan<input name="date" type="date" required min="${escapeHTML(minDate)}" max="${escapeHTML(maxDate)}" value="${escapeHTML(date)}"></label><label>Mulai<input name="start" type="time" required value="${escapeHTML(startTime)}"></label><label>Selesai<input name="end" type="time" required value="${escapeHTML(endTime)}"></label><p class="jt-schedule-note">${escapeHTML(info||'Jam operasional belum terverifikasi dari API. Periksa ketentuan penyedia sebelum berkunjung.')}</p><div class="jt-schedule-actions"><button type="button" class="secondary" data-cancel>Batal</button><button type="submit" class="dark">Simpan jadwal</button></div><p class="jt-schedule-error" role="alert"></p></form>`;
  modal.append(wrap);document.body.append(modal);
  const form=wrap.querySelector('form');let finished=false;
  const finish=value=>{if(finished)return;finished=true;modal.close();modal.remove();priorFocus?.focus();resolve(value)};
  form.querySelector('[data-cancel]').onclick=()=>finish(null);
  modal.addEventListener('cancel',e=>{e.preventDefault();finish(null)});
  form.onsubmit=e=>{e.preventDefault();const d=form.elements.date.value,st=form.elements.start.value,en=form.elements.end.value;if(!d||!st||!en||en<=st){form.querySelector('.jt-schedule-error').textContent='Pilih tanggal dan pastikan jam selesai lebih besar daripada jam mulai.';return}finish({date:d,startTime:st,endTime:en})};
  modal.showModal();
 });
}
function jtHoursInfo(obj){const v=obj?.openingHours||obj?.opening_hours||obj?.hours||obj?.operatingHours;return typeof v==='string'&&v.trim()?('Informasi jam dari katalog penyedia: '+v):'Jam buka/tutup tidak tersedia dalam data yang telah diverifikasi. Pilihan jam perlu diperiksa terhadap informasi resmi penyedia.'}
function integratedInit(){
 const box=ie('integratedBuilder');if(!box)return;
 // Static builder markup lives in index.html, so first paint has the correct structure.
 if(!ie('ibDate'))return;
 ie('ibDate').value=$('#planStart').value||tripDate();ie('ibDate').min=dateStr(new Date());
 ['ibDate','ibNights','ibPeople','ibBudget'].forEach(id=>ie(id).onchange=()=>{integrated.quote=null;if(id==='ibDate'||id==='ibNights'){integratedResetRental();if(!ie('ibTransportOptions').hidden)integratedLoadVehicles()}integratedRender()});
 document.querySelectorAll('[data-ib-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-ib-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});ie('ibHotelOptions').hidden=b.dataset.ibTab!=='hotel';ie('ibWisataOptions').hidden=b.dataset.ibTab!=='wisata';ie('ibTransportOptions').hidden=b.dataset.ibTab!=='transport';if(b.dataset.ibTab==='transport'&&!integrated.vehicleLoaded&&!integrated.vehicleLoading){if(!integrated.rental.startDate)integratedResetRental();integratedLoadVehicles()}});
 ie('ibSave').onclick=async()=>{const b=ie('ibSave');b.disabled=true;try{await integratedSave()}catch(e){toast(e.message)}finally{b.disabled=false}};
 ie('ibManual').onclick=()=>{$('#planAdd').click();$('#planActivities').scrollIntoView({block:'start'});$('#planActivities input[data-field="title"]:last-of-type')?.focus()};
 ie('ibAnalyze').onclick=()=>{$('#planAnalyze').click()};
 ie('ibCopy').onclick=async()=>{const url=new URL(location.origin+location.pathname);url.hash=jtRouteHash('journey',jtActiveRoute.day);try{await navigator.clipboard.writeText(url.href);toast('Tautan tampilan disalin (tanpa data reservasi)')}catch{toast('Salin URL dari bilah alamat browser')}};
 ie('ibPrint').onclick=()=>window.print();
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
 const cart=state.cart.filter(c=>c.item.type==='transport');
 const all=[...acts.map(a=>({title:a.title,item:a.sourceItem})),...cart.map(c=>({title:c.name,item:c.item}))];
 if(!all.length){el.hidden=true;el.innerHTML='';return}
 check.checked=true;el.hidden=false;
 el.innerHTML='<strong>'+all.length+' kendaraan dipilih</strong>'+all.map(a=>'<small>'+escapeHTML(a.title)+' · '+integratedRentalDays(a.item)+' hari · '+(a.item.withDriver?'Dengan sopir':'Lepas kunci')+'</small>').join('')+'<div class="v4-transport-actions"><button type="button" data-transport-change>Ubah pilihan</button>'+(cart.length||acts.some(a=>!a.orderId)?'<button type="button" data-transport-remove>Hapus pilihan</button>':'')+'</div>';
 el.querySelector('[data-transport-change]').onclick=()=>{selectCatalogTab('transport');document.querySelector('#explore .section-top').scrollIntoView({behavior:'smooth',block:'start'})};
 el.querySelector('[data-transport-remove]')?.addEventListener('click',()=>{state.cart=state.cart.filter(c=>c.item.type!=='transport');state.quote=null;planState.activities=planState.activities.filter(a=>a.sourceItem?.type!=='transport'||a.orderId);integrated.quote=null;check.checked=planState.activities.some(a=>a.sourceItem?.type==='transport');saveCart();integratedRender()});
}
function integratedTransportPreference(){
 const check=ie('v4UseTransport');if(!check)return;
 check.onchange=()=>{
  if(check.checked){selectCatalogTab('transport');document.querySelector('#explore .section-top').scrollIntoView({behavior:'smooth',block:'start'});return}
  const existing=planState.activities.filter(a=>a.sourceItem?.type==='transport'),cart=state.cart.filter(c=>c.item.type==='transport');
  if(existing.some(a=>a.orderId)){check.checked=true;toast('Kendaraan yang telah memiliki pesanan tidak dapat dihapus');return}
  if((existing.length||cart.length)&&!confirm('Hapus pilihan transportasi dari itinerary?')){check.checked=true;return}
  state.cart=state.cart.filter(c=>c.item.type!=='transport');state.quote=null;planState.activities=planState.activities.filter(a=>a.sourceItem?.type!=='transport');integrated.quote=null;saveCart();integratedRender();
 };
}
function ihotelRegion(h){return v4HotelRegion(h)}
function idestinationRegion(d){return v4DestinationRegion(d)}
// A day link selects a local agenda view, not a shared or public reservation.
function integratedApplyDayRoute(){
 const days=ie('ibDays'),nav=ie('ibDayNav'),notice=ie('ibDayNotice');
 if(!days||!nav||!notice)return;
 const day=jtActiveRoute.name==='journey'?jtActiveRoute.day:null;
 const cards=[...days.querySelectorAll('[data-ib-day]')];
 const available=day===null||cards.some(c=>Number(c.dataset.ibDay)===day);
 cards.forEach(c=>{c.hidden=day!==null&&available&&Number(c.dataset.ibDay)!==day});
 nav.querySelectorAll('a').forEach(a=>{
  const active=available&&(a.dataset.ibDayLink?Number(a.dataset.ibDayLink)===day:day===null);
  if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');
 });
 notice.hidden=available;
 notice.textContent=available?'':'Hari '+day+' belum tersedia pada itinerary lokal. Tambahkan durasi atau aktivitas untuk membukanya. Semua hari yang tersedia ditampilkan.';
}
// Pure timeline helpers: no network, fabricated prices, or provider mutations.
function jtPlanDays(acts,start,end){
 const dates=acts.flatMap(a=>[a.date,a.sourceItem?.checkIn,a.sourceItem?.checkOut,a.sourceItem?.startDate,a.sourceItem?.endDate]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')).concat([start,end]).sort();
 const days=[];for(let d=dates[0];d<=dates.at(-1)&&days.length<16;d=endDate(d,1))days.push({date:d,items:acts.filter(a=>a.date===d),boundaries:acts.filter(a=>a.sourceItem?.type==='hotel'&&a.sourceItem.checkOut===d||a.sourceItem?.type==='transport'&&a.sourceItem.endDate===d)});
 return days;
}
function jtConflicts(acts,a){
 if(!jtValidTimes(a.startTime,a.endTime))return [];
 return acts.filter(b=>b!==a&&b.date===a.date&&jtValidTimes(b.startTime,b.endTime)&&a.startTime<b.endTime&&b.startTime<a.endTime);
}
function jtMoveDate(a,date){
 if(a.orderId)return false;
 const s=a.sourceItem;
 if(s?.type==='hotel'){const nights=Math.round((Date.parse(s.checkOut)-Date.parse(s.checkIn))/86400000);if(!(nights>0))return false;s.checkIn=date;s.checkOut=endDate(date,nights)}
 else if(s?.type==='transport'){const n=Math.round((Date.parse(s.endDate)-Date.parse(s.startDate))/86400000);if(!(n>=0))return false;s.startDate=date;s.endDate=endDate(date,n)}
 else if(s?.type==='wisata')s.visitDate=date;
 a.date=date;return true;
}
function jtSwapDay(acts,index,delta){
 const a=acts[index];if(!a||a.orderId)return false;
 const indices=acts.map((x,i)=>x.date===a.date?i:-1).filter(i=>i>=0),pos=indices.indexOf(index),other=indices[pos+delta];
 if(other===undefined||acts[other].orderId)return false;
 [acts[index],acts[other]]=[acts[other],acts[index]];return true;
}
function jtTravelMinutes(a){const m=String(a.notes||'').match(/(?:^|\n)Estimasi perjalanan pengguna: (\d{1,4}) menit(?:\n|$)/);return m?Number(m[1]):null}
function jtSetTravelMinutes(a,value){
 if(a.orderId)return;
 const notes=String(a.notes||'').replace(/(?:^|\n)Estimasi perjalanan pengguna: \d{1,4} menit(?=\n|$)/g,'').trim();
 a.notes=notes+(value===''?'':(notes?'\n':'')+'Estimasi perjalanan pengguna: '+Number(value)+' menit');
}
function jtActivityMeta(a){
 const s=a.sourceItem||{},type=s.type||a.type;
 const hotel=(state.hotels||[]).find(h=>String(h.hotelId||h.id)===String(s.hotelId));
 const room=(state.rooms||[]).find(r=>String(r.roomId||r.id)===String(s.roomId)&&String(r.hotelId||r.hotel_id)===String(s.hotelId));
 const dest=(state.destinations||[]).concat(integrated.rec||[]).find(d=>String(d.id)===String(s.destinationId));
 const vehicle=(integrated.vehicles||[]).concat(state.vehicles||[]).find(v=>String(v.id)===String(s.vehicleId));
 const obj=type==='hotel'?hotel:type==='wisata'?dest:type==='transport'?vehicle:null;
 return {type,room:room?.roomType||room?.type||'',region:a.region||obj?.city||obj?.region||'',src:photoURL(obj?.imageUrl||obj?.image_url||(Array.isArray(obj?.photos)?obj.photos[0]:'')),obj,rate:type==='hotel'?(room?.pricePerNight??room?.price_per_night):type==='wisata'?dest?.price:type==='transport'?vehicle?.dailyPrice:null,driverRate:vehicle?.driverDailyPrice};
}
function jtDayEstimate(acts,date){
 let amount=0,unknown=0,booked=0;
 for(const a of acts){const s=a.sourceItem;if(!s)continue;const applies=s.type==='hotel'?date>=s.checkIn&&date<s.checkOut:s.type==='transport'?date>=s.startDate&&date<=s.endDate:date===s.visitDate;if(!applies)continue;
  if(a.orderId){booked++;continue}const m=jtActivityMeta(a);
  const valid=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>=0;
  if(!valid(m.rate)||(s.type==='transport'&&s.withDriver&&!valid(m.driverRate))||(s.type==='wisata'&&!valid(s.quantity))){unknown++;continue}
  amount+=s.type==='wisata'?Number(m.rate)*Number(s.quantity):Number(m.rate)+(s.type==='transport'&&s.withDriver?Number(m.driverRate):0);
 }
 return {amount,unknown,booked};
}
function jtInvalidateQuote(){
 integrated.quote=null;const out=ie('ibQuoteResult');if(out)out.textContent='Pilihan berubah. Periksa harga & stok kembali.';const customer=ie('ibCustomer');if(customer)customer.hidden=true;
}
function jtTimelineRefresh(){jtInvalidateQuote();integratedRender()}
function jtLocalAnalysis(acts){
 return acts.flatMap((a,i)=>[...(a.type==='wisata'&&!acts.some(h=>h.type==='hotel'&&h.date<=a.date)?['Wisata '+a.title+' belum memiliki rencana check-in sebelumnya (bukan bukti hotel tidak dibooking).']:[]),...jtConflicts(acts.slice(i+1),a).map(b=>'Jadwal '+a.title+' dan '+b.title+' bertabrakan pada '+a.date)]);
}
function jtRenderWarnings(warnings){
 const node=ie('planWarnings');if(node)node.innerHTML=warnings.length?'<div class="plan-alert"><strong>'+warnings.length+' catatan jadwal</strong>'+warnings.map(x=>'<p>'+escapeHTML(x)+'</p>').join('')+'</div>':'<div class="plan-good">'+uiIcon('check')+' Tidak ditemukan benturan berdasarkan aturan jadwal lokal.</div>';
}
function jtConfirmDialog(message){
 return new Promise(resolve=>{
  const prev=document.activeElement,d=document.createElement('dialog');d.className='jt-schedule-dialog';d.setAttribute('aria-label','Konfirmasi tindakan');
  d.innerHTML='<div class="jt-schedule-content"><h3>Konfirmasi</h3><p>'+escapeHTML(message)+'</p><div class="jt-schedule-actions"><button type="button" data-cancel>Batal</button><button type="button" class="dark" data-accept>Lanjutkan</button></div></div>';
  document.body.append(d);let done=false;const finish=value=>{if(done)return;done=true;d.close();d.remove();prev?.focus();resolve(value)};
  d.querySelector('[data-cancel]').onclick=()=>finish(false);d.querySelector('[data-accept]').onclick=()=>finish(true);d.addEventListener('cancel',e=>{e.preventDefault();finish(false)});d.showModal();d.querySelector('[data-cancel]').focus();
 });
}
function jtTimelineCard(a,acts,days){
 const i=acts.indexOf(a),m=jtActivityMeta(a),pos=days.find(d=>d.date===a.date)?.items.indexOf(a)??0,dayItems=days.find(d=>d.date===a.date)?.items||[];
 const icon=m.type==='hotel'?'home':m.type==='transport'?'car':m.type==='wisata'?'pin':'spark';
 const label=m.type==='hotel'?'Check-in':m.type==='transport'?'Pengambilan kendaraan':m.type==='wisata'?'Wisata':'Agenda pribadi';
 const conflicts=jtConflicts(acts,a).filter(b=>acts.indexOf(b)<i);
 const travel=jtTravelMinutes(a),status=a.bookingStatus||(a.sourceItem?'Belum dipesan':'Agenda pribadi');
 return (conflicts.length?'<div class="ib-conflict" role="alert">'+uiIcon('info')+' Benturan dengan '+escapeHTML(conflicts.map(b=>b.title).join(', '))+' (jadwal lokal)</div>':'')+
 '<article class="ib-day-line ib-timeline-card"><div class="ib-time">'+escapeHTML(a.startTime||'Jam belum dipilih')+(a.endTime?' – '+escapeHTML(a.endTime):'')+'<small>WIB · rencana</small></div><div class="ib-card-content"><div class="ib-card-top">'+(m.src?'<img class="ib-thumb" src="'+escapeHTML(m.src)+'" width="72" height="72" loading="lazy" decoding="async" alt="'+escapeHTML(a.title)+'" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="ib-thumb ib-thumb-icon" hidden>'+uiIcon(icon)+'</span>':'<span class="ib-thumb ib-thumb-icon">'+uiIcon(icon)+'</span>')+'<div><span class="section-tag">'+label+'</span><strong>'+escapeHTML(a.title||'Agenda tanpa judul')+'</strong><small>'+escapeHTML([m.room,m.region].filter(Boolean).join(' · ')||'Wilayah belum tersedia')+'</small><small class="ib-activity-status">'+uiIcon(a.orderId?'info':'check')+' '+escapeHTML(status)+'</small>'+(a.syncError?'<small class="sync-error">'+escapeHTML(a.syncError)+'</small>':'')+'</div></div>'+
 (a.orderId?'<p class="help-text">Terkunci: perubahan reservasi melalui penyedia.</p>':'<div class="ib-card-actions"><button type="button" class="ib-edit-time" data-ib-edit="'+i+'">Atur jam</button><label class="ib-move-field">Pindah ke hari <select data-ib-move="'+i+'" aria-label="Pindah '+escapeHTML(a.title||'agenda')+' ke hari lain">'+days.map((d,j)=>'<option value="'+escapeHTML(d.date)+'" '+(d.date===a.date?'selected':'')+'>Hari '+(j+1)+'</option>').join('')+'</select></label><button type="button" class="ib-edit-time" data-ib-order="'+i+'" data-delta="-1" '+(pos<=0||dayItems[pos-1]?.orderId?'disabled':'')+'>Naik</button><button type="button" class="ib-edit-time" data-ib-order="'+i+'" data-delta="1" '+(pos>=dayItems.length-1||dayItems[pos+1]?.orderId?'disabled':'')+'>Turun</button><label class="ib-travel-field">Estimasi menuju aktivitas (menit, opsional)<input type="number" min="0" max="1440" step="1" data-ib-travel="'+i+'" value="'+(travel??'')+'"></label></div>')+(travel!==null?'<p class="help-text">± '+travel+' menit (estimasi Anda)</p>':'')+'</div></article>';
}
function jtBoundaryCard(a){
 const m=jtActivityMeta(a),hotel=m.type==='hotel';
 return '<article class="ib-boundary"><span class="ib-thumb ib-thumb-icon">'+uiIcon(hotel?'home':'car')+'</span><div><span class="section-tag">'+(hotel?'Check-out':'Pengembalian kendaraan')+'</span><strong>'+escapeHTML(a.title.replace(/^Check-in |^Sewa /,''))+'</strong><small>'+escapeHTML(m.room||'')+'</small><small>Jam belum ditentukan · ikuti ketentuan provider</small></div></article>';
}
function jtRenderTimeline(acts,days){
 const fullEnd=acts.flatMap(a=>[a.date,a.sourceItem?.checkOut,a.sourceItem?.endDate]).filter(Boolean).concat([endDate(idate(),inights())]).sort().at(-1);
 const regions=[...new Set(acts.map(a=>jtActivityMeta(a).region).filter(Boolean))];
 const title=$('#planTitle').value||'Perjalanan Yogyakarta';
 ie('ibTitle').textContent=title;
 ie('ibTripMeta').innerHTML='<p>'+escapeHTML(days[0]?.date||idate())+' – '+escapeHTML(fullEnd)+' · '+Math.max(0,Math.round((Date.parse(fullEnd)-Date.parse(days[0]?.date||idate()))/86400000))+' malam · '+ipeople()+' wisatawan (rencana)</p><div class="ib-region-chips">'+regions.map(r=>'<span class="chip">'+escapeHTML(r)+'</span>').join('')+'</div>';
 ie('ibDays').innerHTML=days.map((d,i)=>`<section class="ib-day" data-ib-day="${i+1}"><div><b id="ibDayHeading${i+1}" tabindex="-1">Hari ${i+1}</b><small>${escapeHTML(d.date)}</small></div>${d.items.map(a=>jtTimelineCard(a,acts,days)).join("")}${d.boundaries.map(jtBoundaryCard).join("")}${!d.items.length&&!d.boundaries.length?`<div class="ib-free">${uiIcon("spark")} <strong>Waktu bebas</strong><p>Tambahkan kegiatan jika diperlukan.</p><button type="button" class="outlinewide" data-ib-add-day="${i+1}">Tambah wisata</button></div>`:""}</section>`).join('');
 const costs=days.map(d=>({date:d.date,...jtDayEstimate(acts,d.date)})),total=costs.reduce((n,d)=>n+d.amount,0),unknown=costs.reduce((n,d)=>n+d.unknown,0),booked=costs.some(d=>d.booked),budget=Number(ie('ibBudget').value)||0,truncated=days.at(-1)?.date!==fullEnd;
 ie('ibEstimate').innerHTML='<h4>Estimasi biaya perjalanan</h4>'+costs.map((d,i)=>'<div class="price-row"><span>Hari '+(i+1)+'</span><strong>'+money(d.amount)+(d.unknown?' + belum diketahui':'')+'</strong></div>').join('')+'<div class="price-row total"><span>'+((unknown||truncated)?'Subtotal diketahui':'Total estimasi layanan baru')+'</span><strong>'+money(total)+'</strong></div>'+(budget>0?'<label>Anggaran '+money(budget)+' · '+Math.round(total/budget*100)+'% (nilai diketahui)<progress max="'+budget+'" value="'+Math.min(total,budget)+'"></progress></label>'+(total>budget?'<p class="sync-error">Estimasi diketahui melebihi anggaran.</p>':''):'')+'<p class="help-text">Estimasi katalog, bukan quote final. '+(unknown?'Sebagian harga belum tersedia. ':'')+(booked?'Layanan yang telah dipesan tidak dihitung ulang. ':'')+(truncated?'Agenda ditampilkan maksimal 16 hari; estimasi hanya mencakup hari yang tampil. ':'')+'Transportasi merupakan simulasi.</p>';
 ie('ibTicket').innerHTML='<h3>Tiket perjalanan</h3><p><strong>'+escapeHTML(title)+'</strong> · '+escapeHTML(days[0]?.date||idate())+' – '+escapeHTML(fullEnd)+'</p><p>Kode simpan: '+escapeHTML(planState.id||'Belum disimpan')+'</p>'+days.map((d,i)=>'<h4>Hari '+(i+1)+' · '+escapeHTML(d.date)+'</h4><ul>'+d.items.map(a=>'<li>'+escapeHTML((a.startTime||'Jam belum dipilih')+' '+a.title)+'</li>').join('')+d.boundaries.map(a=>'<li>'+escapeHTML((a.sourceItem.type==='hotel'?'Check-out: ':'Pengembalian: ')+a.title)+'</li>').join('')+(!d.items.length&&!d.boundaries.length?'<li>Waktu bebas</li>':'')+'</ul>').join('')+'<p>Agenda rencana, bukan tiket reservasi. Tidak ada pembayaran riil.</p>';
 jtRenderWarnings(jtLocalAnalysis(acts));
}
function integratedRender(){
 if(!ie('ibHotelOptions'))return;
 const hotels=state.hotels||[],rooms=state.rooms||[],destinations=state.destinations||[];
 const area=($('#region').value||'').trim();const match=area?v4Region(area):'';
 const selectedHotel=planState.activities.find(a=>a.sourceItem?.type==='hotel');
 const hotelFiltered=hotels.filter(h=>!match||ihotelRegion(h)===match);
 ie('ibHotelOptions').setAttribute('aria-busy',String(state.catalogLoading));
 ie('ibHotelOptions').innerHTML=state.catalogLoading&&!hotelFiltered.length?jtSkeleton('Memuat hotel…',2):`<p class="ib-caption">Pilih hotel dan kamar melalui katalog JogjaStay.</p>${hotelFiltered.slice(0,30).map(h=>{const id=String(h.hotelId||h.id),related=rooms.filter(r=>String(r.hotelId||r.hotel_id)===id);const src=photoURL(h.imageUrl||h.image_url||'');return `<div class="ib-hotel"><div class="ib-hotel-top">${src?`<img loading="lazy" src="${escapeHTML(src)}" alt="Foto ${escapeHTML(h.name||'hotel')}" width="480" height="320" decoding="async">`:''}<div><strong>${escapeHTML(h.name)}</strong><small>${escapeHTML(ihotelRegion(h)||'Wilayah belum terpetakan')}</small><span>${related.length} tipe kamar</span></div></div><div class="ib-hotel-controls"><select data-ib-room="${escapeHTML(id)}" aria-label="Pilihan kamar">${related.map(r=>`<option value="${escapeHTML(String(r.roomId||r.id))}">${escapeHTML(r.roomType||r.type||'Kamar')} · ${money(r.pricePerNight||r.price_per_night)} / malam</option>`).join('')}</select><button data-ib-hotel="${escapeHTML(id)}" ${!related.length?'disabled':''}>${selectedHotel?.sourceItem?.hotelId===id?'Ganti kamar':'Pilih hotel'}</button></div></div>`}).join('')||'<p>Belum ada hotel. Periksa koneksi API atau filter wilayah.</p>'}`;
 ie('ibHotelOptions').querySelectorAll('[data-ib-hotel]').forEach(b=>b.onclick=async()=>{const id=b.dataset.ibHotel,h=hotels.find(x=>String(x.hotelId||x.id)===id),roomId=ie('ibHotelOptions').querySelector(`[data-ib-room="${CSS.escape(id)}"]`).value;if(!h)return;const current=planState.activities.find(a=>a.sourceItem?.type==='hotel'&&!a.orderId);const slot=await jtChooseSchedule({title:'check-in '+(h.name||'Hotel'),date:current?.date||idate(),minDate:idate(),maxDate:endDate(idate(),inights()),startTime:current?.startTime||'',endTime:current?.endTime||'',info:'Jam kedatangan yang Anda rencanakan; konfirmasi kebijakan check-in kepada JogjaStay.'});if(!slot)return;const entry={type:'hotel',title:'Check-in '+(h.name||'Hotel'),date:slot.date,startTime:slot.startTime,endTime:slot.endTime,region:ihotelRegion(h),notes:'Jam agenda pilihan wisatawan; kebijakan check-in tetap milik JogjaStay',sourceItem:{type:'hotel',hotelId:id,roomId,checkIn:slot.date,checkOut:endDate(slot.date,inights()),guests:ipeople(),plannedStartTime:slot.startTime,plannedEndTime:slot.endTime}};const existing=planState.activities.findIndex(a=>a.sourceItem?.type==='hotel'&&!a.orderId);if(existing>=0)planState.activities.splice(existing,1,entry);else planState.activities.unshift(entry);jtTimelineRefresh();await integratedRecommend(id)});
 const recommendations=integrated.recLoaded?integrated.rec:destinations.filter(d=>!match||idestinationRegion(d)===match);
 const budget=Number(ie('ibBudget').value)||0;
 ie('ibWisataOptions').setAttribute('aria-busy',String(state.catalogLoading));
 ie('ibWisataOptions').innerHTML=state.catalogLoading&&!recommendations.length?jtSkeleton('Memuat wisata…',2):`<p class="ib-caption">${integrated.recLoaded?'Rekomendasi dari API Wisata berdasarkan wilayah hotel (bukan jarak tempuh).':'Pilihan destinasi dari katalog Wisata. Pilih hotel untuk rekomendasi wilayah.'}</p>${recommendations.slice(0,50).map(d=>{const src=photoURL(d.imageUrl||d.image_url||(Array.isArray(d.photos)?d.photos[0]:''));const price=Number(d.price||0);return `<div class="ib-attraction">${src?`<img loading="lazy" src="${escapeHTML(src)}" alt="${escapeHTML(d.name)}" width="480" height="320" decoding="async">`:''}<div><strong>${escapeHTML(d.name)}</strong><small>${escapeHTML(idestinationRegion(d)||d.region||'Wilayah tidak diketahui')}</small><span>${price?`${money(price)} / tiket (katalog)`:'Harga dicek saat quote'}</span></div><button data-ib-wisata="${escapeHTML(String(d.id))}">Tambah</button></div>`}).join('')||'<p>Tidak ada destinasi pada wilayah yang dipilih.</p>'}`;
 ie('ibWisataOptions').querySelectorAll('[data-ib-wisata]').forEach(b=>b.onclick=async()=>{const d=recommendations.find(x=>String(x.id)===b.dataset.ibWisata);if(!d)return;const taken=planState.activities.filter(a=>a.sourceItem?.type==='wisata').length;const suggestedDay=Math.min(inights(),Math.floor(taken/2));const slot=await jtChooseSchedule({title:'wisata '+d.name,date:integrated.preferredDay||endDate(idate(),suggestedDay),minDate:jtPlanDays(planState.activities,idate(),endDate(idate(),inights()))[0].date,maxDate:jtPlanDays(planState.activities,idate(),endDate(idate(),inights())).at(-1).date,info:jtHoursInfo(d)});if(!slot)return;integrated.preferredDay=null;const a={type:'wisata',title:d.name,date:slot.date,startTime:slot.startTime,endTime:slot.endTime,region:idestinationRegion(d),notes:'Jam agenda dipilih pengguna; bukan slot provider yang terkonfirmasi',sourceItem:{type:'wisata',destinationId:Number(d.id),visitDate:slot.date,quantity:ipeople(),tier:'base',plannedStartTime:slot.startTime,plannedEndTime:slot.endTime}};planState.activities.push(a);integrated.quote=null;integratedRender();toast('Wisata ditambahkan ke itinerary — belum dipesan')});
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
 const days=jtPlanDays(acts,idate(),endDate(idate(),inights()));
 jtRenderTimeline(acts,days);
 const dayNav=ie('ibDayNav');
 dayNav.innerHTML='<a class="ib-day-link" href="#/itinerary">Semua hari</a>'+days.map((d,i)=>'<a class="ib-day-link" href="'+jtRouteHash('journey',i+1)+'" data-ib-day-link="'+(i+1)+'">Hari '+(i+1)+' <small>'+escapeHTML(d.date)+'</small></a>').join('');
 dayNav.querySelectorAll('a').forEach(a=>a.onclick=e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();page('journey',a.dataset.ibDayLink?Number(a.dataset.ibDayLink):null)});
 integratedApplyDayRoute();
 ie('ibDays').querySelectorAll('[data-ib-edit]').forEach(b=>b.onclick=async()=>{const a=acts[Number(b.dataset.ibEdit)];if(!a||a.orderId)return;const slot=await jtChooseSchedule({title:a.title,date:a.date,minDate:days[0].date,maxDate:days.at(-1).date,startTime:a.startTime||'',endTime:a.endTime||'',info:a.type==='hotel'?'Pastikan jadwal sesuai kebijakan check-in penginapan.':a.type==='transport'?'Jam pengambilan adalah rencana pribadi; ikuti ketentuan JogjaTrans.':jtHoursInfo((state.destinations||[]).find(d=>String(d.id)===String(a.sourceItem?.destinationId)))});if(!slot||!jtMoveDate(a,slot.date))return;a.startTime=slot.startTime;a.endTime=slot.endTime;if(a.sourceItem){a.sourceItem.plannedStartTime=slot.startTime;a.sourceItem.plannedEndTime=slot.endTime}jtTimelineRefresh()});
 ie('ibDays').querySelectorAll('[data-ib-move]').forEach(el=>el.onchange=()=>{const a=acts[Number(el.dataset.ibMove)];if(a&&days.some(d=>d.date===el.value)&&jtMoveDate(a,el.value)){jtTimelineRefresh();page('journey',days.findIndex(d=>d.date===el.value)+1)}});
 ie('ibDays').querySelectorAll('[data-ib-order]').forEach(el=>el.onclick=()=>{if(jtSwapDay(acts,Number(el.dataset.ibOrder),Number(el.dataset.delta)))jtTimelineRefresh()});
 ie('ibDays').querySelectorAll('[data-ib-travel]').forEach(el=>el.onchange=()=>{if(el.value!==''&&(!el.checkValidity()||!Number.isInteger(Number(el.value)))){toast('Isi menit 0–1440 atau kosongkan');return}jtSetTravelMinutes(acts[Number(el.dataset.ibTravel)],el.value);jtTimelineRefresh()});
 ie('ibDays').querySelectorAll('[data-ib-add-day]').forEach(el=>el.onclick=()=>{integrated.preferredDay=days[Number(el.dataset.ibAddDay)-1]?.date;document.querySelector('[data-ib-tab="wisata"]').click();ie('ibWisataOptions').scrollIntoView({block:'start'})});
 ie('ibSelected').innerHTML=acts.filter(a=>a.sourceItem).map(a=>`<div class="ib-pill"><span>${escapeHTML(a.title)} <small>${escapeHTML(a.bookingStatus||'Belum dipesan')}</small></span>${a.orderId?'<span class="ib-locked">Terkunci</span>':`<button data-ib-remove="${escapeHTML(a.id||'')}" data-ib-index="${acts.indexOf(a)}" aria-label="Hapus pilihan"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/icons.svg#close"></use></svg></button>`}</div>`).join('');
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
async function integratedQuote(){const btn=ie('ibQuote');btn.disabled=true;try{if(!planState.activities.some(a=>a.sourceItem&&!a.orderId)){toast('Tambahkan hotel, wisata, atau kendaraan yang belum dipesan');return}await integratedSave();const q=await request(`/api/itineraries/${encodeURIComponent(planState.id)}/quote`,{method:'POST',headers:{'X-Plan-Token':planState.accessToken},body:'{}'});integrated.quote=q;const limit=Number(ie('ibBudget').value)||0;const over=limit>0&&q.total>limit;ie('ibQuoteResult').innerHTML=`<div class="ib-cost"><h4>Rincian harga dari API</h4>${q.items.map(x=>`<div class="price-row"><span>${escapeHTML(x.title)} ${x.error?'<small>· '+escapeHTML(x.error)+'</small>':''}</span><strong>${x.available?money(x.amount):'Tidak tersedia'}</strong></div>`).join('')}<div class="price-row total"><span>Total sebelum diskon</span><strong>${money(q.total)}</strong></div>${over?'<p class="sync-error">Melebihi budget. Ubah pilihan layanan sebelum checkout.</p>':''}<small>Harga belum termasuk diskon curated package; quote akan diperiksa lagi saat booking.</small></div>`;q.available=!over&&q.available;ie('ibCustomer').hidden=!q.available;toast(q.available?'Quote live berhasil':'Periksa ketersediaan atau budget')}catch(e){integrated.quote=null;ie('ibCustomer').hidden=true;toast(e.message)}finally{btn.disabled=false}}
async function integratedBook(){if(!integrated.quote?.available)return;if(!ie('ibName').value.trim()||!ie('ibEmail').value.includes('@')||(planState.activities.some(x=>x.sourceItem?.type==='transport')&&!/^[+0-9 ()-]{9,20}$/.test(ie('ibPhone').value.trim()))){toast('Lengkapi nama dan email');return}if(!await jtConfirmDialog('Konfirmasi booking demo ke penyedia? Rental JogjaTrans merupakan simulasi.'))return;const b=ie('ibBook');b.disabled=true;try{const res=await request(`/api/itineraries/${encodeURIComponent(planState.id)}/book`,{method:'POST',headers:{'X-Plan-Token':planState.accessToken},body:JSON.stringify({customer:{name:ie('ibName').value,email:ie('ibEmail').value,phone:ie('ibPhone').value}})});state.orders.unshift({id:res.order.id,token:res.accessToken});localStorage.setItem('jt_orders',JSON.stringify(state.orders));planState.activities=res.itinerary?.activities||planState.activities;integrated.quote=null;integratedRender();ie('ibQuoteResult').innerHTML=`<div class="ib-cost"><h4>Pesanan ${escapeHTML(res.order.id)} · ${escapeHTML(res.order.status)}</h4><p>Referensi tercatat. Periksa detail dan sinkronisasi pada halaman Pesanan.</p></div>`;$('#lookupId').value=res.order.id;$('#lookupToken').value=res.accessToken;toast('Pesanan '+res.order.status+'. Jangan checkout ulang saat status UNKNOWN.')}catch(e){toast(e.message+' — Jika status tidak pasti, jangan checkout ulang; periksa order penyedia.')}finally{b.disabled=false}}
async function integratedSync(){if(!planState.id){toast('Simpan itinerary terlebih dahulu');return}try{const r=await request(`/api/itineraries/${encodeURIComponent(planState.id)}/sync`,{method:'POST',headers:{'X-Plan-Token':planState.accessToken},body:'{}'});planState.activities=r.itinerary.activities;integratedRender();toast('Status booking diperiksa kembali ke penyedia')}catch(e){toast(e.message)}}
integratedInit();
integratedTransportPreference();
// Main catalog is asynchronous. Refresh the integrated selection once loaded.
const oldRenderCatalog=renderCatalog;
renderCatalog=function(){oldRenderCatalog();if(ie('ibHotelOptions'))integratedRender()};
