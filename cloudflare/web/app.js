'use strict';
const $=x=>document.querySelector(x), $$=x=>[...document.querySelectorAll(x)];
const state={hotels:[],rooms:[],destinations:[],vehicles:[],rentalLoading:false,rentalError:'',rentalKey:'',rentalSeq:0,rentalLimit:24,catalogSeq:0,catalogLoading:true,catalogResults:{},cart:[],tab:'all',quote:null,orders:JSON.parse(localStorage.getItem('jt_orders')||'[]')};
const money=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photoURL=x=>{try{const u=new URL(String(x||''));return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const uiIcon=name=>'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/icons.svg#'+(['home','pin','car','bike','arrow','info','close','refresh','download','check','next','spark'].includes(name)?name:'info')+'"></use></svg>';
const cardMedia=x=>{const src=photoURL(x.image);return `<div class="tile-visual ${x.kind}"><small>${x.kind.toUpperCase()}</small>${src?`<img src="${escapeHTML(src)}" alt="Foto ${escapeHTML(x.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false" width="480" height="320" decoding="async"><span class="media-fallback" hidden>${uiIcon(x.icon)}</span>`:`<span class="media-fallback">${uiIcon(x.icon)}</span>`}</div>`};
const dateStr=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};
const today=new Date();$('#tripDate').min=dateStr(today);$('#tripDate').value=dateStr(new Date(today.getTime()+86400000*7));
function toast(t){const el=$('#toast');el.textContent=t;el.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.style.display='none',5500)}
async function request(path,opts={}){let res;try{res=await fetch(path,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts})}catch(e){throw Error('Tidak dapat terhubung ke server Itinerary Jogja')};let data;try{data=await res.json()}catch{throw Error('Respons server bukan JSON')};if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);return data}
// Public navigation only: never serialize plan IDs, credentials or customer data.
const jtRoutes=Object.freeze({explore:'beranda',packages:'paket',planner:'pilihan',journey:'itinerary',orders:'pesanan'});
function jtRouteHash(name,day=null){
 const route=Object.prototype.hasOwnProperty.call(jtRoutes,name)?name:'explore';
 return '#/'+jtRoutes[route]+(route==='journey'&&Number.isInteger(day)&&day>=1&&day<=16?'/hari-'+day:'');
}
function jtParseRoute(hash){
 const match=/^#\/(beranda|paket|pilihan|itinerary|pesanan)(?:\/hari-([1-9]|1[0-6]))?$/.exec(String(hash||''));
 if(!match||(match[2]&&match[1]!=='itinerary'))return {name:'explore',day:null};
 return {name:Object.keys(jtRoutes).find(key=>jtRoutes[key]===match[1]),day:match[2]?Number(match[2]):null};
}
let jtActiveRoute={name:'explore',day:null},jtAppliedHash='';
function jtSetMenu(open){
 const nav=$('#mainNav'),btn=$('#mobileNavToggle');
 if(!nav||!btn)return;
 nav.dataset.open=String(open);btn.setAttribute('aria-expanded',String(open));
}
function jtApplyRoute(route,{focus=true,scroll=true}={}){
 jtActiveRoute=route;jtAppliedHash=jtRouteHash(route.name,route.day);
 $$('.page').forEach(x=>x.classList.toggle('active',x.id===route.name));
 $$('.navlink').forEach(x=>{const active=x.dataset.page===route.name;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});
 jtSetMenu(false);
 if(route.name==='planner')renderCart();
 if(route.name==='orders')renderOrders();
 if(route.name==='journey'&&typeof integratedApplyDayRoute==='function')integratedApplyDayRoute();
 const dayHeading=route.name==='journey'&&route.day?$('#ibDayHeading'+route.day):null;
 const target=dayHeading&&!dayHeading.closest('[hidden]')?dayHeading:$('#'+route.name+' h1');
 if(focus)target?.focus({preventScroll:true});
 if(scroll){
  if(dayHeading&&!dayHeading.closest('[hidden]'))dayHeading.scrollIntoView({block:'start'});
  else window.scrollTo({top:0,behavior:'instant'});
 }
}
function page(name,day=null){
 const hash=jtRouteHash(name,day);
 if(window.location.hash!==hash)window.history.pushState(null,'',hash);
 jtApplyRoute(jtParseRoute(hash));
}
function jtReadLocation({initial=false}={}){
 const raw=window.location.hash,route=jtParseRoute(raw);
 // The skip link is an in-page accessibility anchor, not a route.
 if(raw==='#mainContent'&&!initial)return;
 const hash=jtRouteHash(route.name,route.day);
 if(raw!==hash)window.history.replaceState(null,'',hash);
 if(initial||hash!==jtAppliedHash)jtApplyRoute(route,{focus:!initial||route.name!=='explore',scroll:!initial||route.name!=='explore'});
}
function jtHandleNav(e,link){
 if(e&&(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey))return;
 e?.preventDefault();page(link.dataset.page);
}
$$('[data-page]').forEach(x=>x.onclick=e=>jtHandleNav(e,x));
$('#heroPlan').onclick=()=>page('planner');
// Defer initial routing until all classic deferred scripts have initialized.
document.addEventListener?.('DOMContentLoaded',()=>{
 const menu=$('#mobileNavToggle'),nav=$('#mainNav');
 menu?.addEventListener('click',()=>jtSetMenu(menu.getAttribute('aria-expanded')!=='true'));
 nav?.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.dataset.open==='true'){e.preventDefault();jtSetMenu(false);menu?.focus()}});
 menu?.addEventListener('keydown',e=>{if(e.key==='Escape'){jtSetMenu(false);menu.focus()}});
 $('.skip-link')?.addEventListener('click',e=>{e.preventDefault();$('#mainContent')?.focus({preventScroll:true});$('#mainContent')?.scrollIntoView({block:'start'})});
 window.addEventListener('popstate',()=>jtReadLocation());
 window.addEventListener('hashchange',()=>jtReadLocation());
 jtReadLocation({initial:true});
});
$$('[data-tab]').forEach(x=>x.onclick=()=>selectCatalogTab(x.dataset.tab));
const region=()=>$('#region').value, tripDate=()=>$('#tripDate').value, guests=()=>Number($('#guests').value), nights=()=>Number($('#nights').value);
function endDate(start,n){const d=new Date(start+'T12:00:00');d.setDate(d.getDate()+n);return dateStr(d)}
// Keep the rental selection in the Explore catalog, just like Hotel and Wisata.
function exploreRentalParams(){
 return {startDate:$('#exploreRentStart').value,endDate:$('#exploreRentEnd').value,type:$('#exploreRentType').value,category:$('#exploreRentCategory').value,withDriver:$('#exploreRentDriver').value};
}
function exploreRentalDefaults(){
 $('#exploreRentStart').min=dateStr(new Date());$('#exploreRentStart').value=tripDate();
 $('#exploreRentEnd').value=endDate(tripDate(),nights());$('#exploreRentEnd').min=tripDate();
}
function exploreRentalDays(p){return Math.round((Date.parse(p.endDate+'T00:00:00Z')-Date.parse(p.startDate+'T00:00:00Z'))/86400000)+1}
function selectCatalogTab(tab){
 state.tab=tab;$$('[data-tab]').forEach(x=>{const active=x.dataset.tab===tab;x.classList.toggle('active',active);x.setAttribute?.('aria-pressed',String(active))});
 renderCatalog();
 if(tab==='transport'||tab==='all'){
  if(!$('#exploreRentStart').value)exploreRentalDefaults();
  if(!state.rentalLoading&&state.rentalKey!==new URLSearchParams(exploreRentalParams()).toString())loadExploreVehicles();
 }
}
async function loadExploreVehicles(){
 const p=exploreRentalParams(),seq=++state.rentalSeq,days=exploreRentalDays(p);
 state.vehicles=[];state.rentalError='';state.rentalLimit=24;state.rentalKey='';
 if(!p.startDate||!p.endDate||p.startDate<dateStr(new Date())||p.startDate>endDate(dateStr(new Date()),180)||p.endDate>endDate(dateStr(new Date()),180)||!Number.isInteger(days)||days<1||days>30){state.rentalLoading=false;state.rentalError='Pilih rentang sewa 1–30 hari dalam 180 hari ke depan.';renderCatalog();return}
 state.rentalLoading=true;renderCatalog();
 try{
  const query=new URLSearchParams(p).toString();const result=await request('/api/catalog/vehicles?'+query);
  if(seq!==state.rentalSeq)return;
  if(result.provider!=='transport'||!Array.isArray(result.items))throw Error('Format respons JogjaTrans tidak sesuai');
  state.vehicles=result.items;state.rentalKey=query;
 }catch(e){if(seq!==state.rentalSeq)return;state.rentalError=e.message}
 finally{if(seq===state.rentalSeq){state.rentalLoading=false;renderCatalog()}}
}
function invalidateExploreRental(){
 state.rentalSeq++;state.rentalLoading=false;state.rentalKey='';state.vehicles=[];state.rentalError='';state.rentalLimit=24;renderCatalog();
}
for(const id of ['exploreRentStart','exploreRentEnd','exploreRentType','exploreRentDriver','exploreRentCategory']){
 $('#'+id).onchange=()=>{
  if(id==='exploreRentStart')$('#exploreRentEnd').min=$('#exploreRentStart').value;
  if(id==='exploreRentType'){$('#exploreRentCategory').value='all';if($('#exploreRentType').value==='motor')$('#exploreRentDriver').value='false'}
  if(id==='exploreRentDriver'&&$('#exploreRentDriver').value==='true'&&$('#exploreRentType').value==='motor'){$('#exploreRentType').value='mobil';$('#exploreRentCategory').value='all'}
  invalidateExploreRental();loadExploreVehicles();
 };
}
$('#exploreRentSearch').onclick=loadExploreVehicles;
$('#exploreRentMoreButton').onclick=()=>{state.rentalLimit+=24;renderCatalog()};
for(const id of ['tripDate','nights'])$('#'+id).addEventListener('change',()=>{exploreRentalDefaults();invalidateExploreRental();if(['all','transport'].includes(state.tab))loadExploreVehicles()});
function updateCatalogNotice(){
 const target=$('#catalogNotice'),results=state.catalogResults;
 const checks=[['Hotel',results.hotels],['Kamar',results.rooms],['Wisata',results.destinations],['Transportasi',state.rentalLoading?'loading':state.rentalError?state.rentalError:state.rentalKey?'ok':undefined]];
 const errors=checks.filter(([,v])=>v&&v!=='ok'&&v!=='loading');
 const pending=checks.some(([,v])=>!v||v==='loading');
 const good=checks.filter(([,v])=>v==='ok').length;
 target.className='notice '+(errors.length?'error':!pending?'ok':'');
 target.textContent=pending?'Mengambil katalog penyedia… '+good+'/4 katalog dimuat.':good===4?'Hotel, Wisata, dan Transportasi terhubung. Katalog berhasil dimuat.':good+'/4 katalog berhasil dimuat.';
 if(errors.length)target.textContent+=' '+errors.map(([name,error])=>name+': '+error).join(' | ');
}
async function loadCatalog(){
 const seq=++state.catalogSeq;state.catalogLoading=true;
 state.catalogResults={hotels:'loading',rooms:'loading',destinations:'loading'};
 const query=region()?'?region='+encodeURIComponent(region()):'';
 const jobs=['hotels','rooms','destinations'].map(async key=>{
  try{
   const result=await request('/api/catalog/'+key+query);
   if(seq!==state.catalogSeq)return;
   if(!Array.isArray(result.items))throw Error('Format katalog tidak valid');
   state[key]=result.items;state.catalogResults[key]='ok';
  }catch(e){if(seq!==state.catalogSeq)return;state[key]=[];state.catalogResults[key]=e.message}
  renderCatalog();
 });
 if(!$('#exploreRentStart').value)exploreRentalDefaults();
 const rental=loadExploreVehicles();
 await Promise.allSettled([...jobs,rental]);
 if(seq!==state.catalogSeq)return;
 state.catalogLoading=false;renderCatalog();if(typeof renderPackages==='function')renderPackages();
}
function renderCatalog(){
 const rental=state.tab==='transport',showVehicles=rental||state.tab==='all';
 $('#exploreRentalFilters').hidden=!rental;
 $('#catalogNotice').hidden=rental;
 $('#exploreRentalNotice').hidden=!rental;
 $('#exploreRentalMore').hidden=!showVehicles||state.vehicles.length<=state.rentalLimit;
 $('#exploreRentSearch').disabled=state.rentalLoading;
 if(rental){
  const n=$('#exploreRentalNotice');n.className='notice '+(state.rentalError?'error':state.rentalKey?'ok':'');
  n.textContent=state.rentalLoading?'Mengambil katalog kendaraan langsung dari JogjaTrans…':state.rentalError?'JogjaTrans: '+state.rentalError:state.rentalKey?state.vehicles.length+' model kendaraan dari API JogjaTrans · harga simulasi':'Pilih tanggal dan cari kendaraan.';
 }
 updateCatalogNotice();
 const items=[];if(state.tab==='all'||state.tab==='hotel')state.hotels.forEach(h=>{const id=String(h.hotelId||h.id||'');const related=state.rooms.filter(r=>String(r.hotelId||r.hotel_id)===id);const minPrice=Math.min(...related.map(r=>Number(r.pricePerNight||r.price_per_night||Infinity)));items.push({kind:'hotel',id,name:h.name||h.hotelName||'Hotel',desc:[h.city,h.area].filter(Boolean).join(' · '),price:Number.isFinite(minPrice)?minPrice:0,icon:'home',image:h.imageUrl||h.image_url||h.photoUrl||'',data:h})});if(state.tab==='all'||state.tab==='wisata')state.destinations.forEach(d=>items.push({kind:'wisata',id:String(d.id),name:d.name,desc:d.region||'Yogyakarta',price:Number(d.price||0),icon:'pin',image:d.imageUrl||d.image_url||(Array.isArray(d.photos)?d.photos[0]:''),data:d}));if(showVehicles)state.vehicles.slice(0,state.rentalLimit).forEach(v=>items.push({kind:'transport',id:String(v.id),name:v.name,desc:[v.type==='motor'?'Motor':'Mobil',v.category,v.transmission,v.seats?String(v.seats)+' kursi':''].filter(Boolean).join(' · '),price:Number(v.dailyPrice),icon:v.type==='motor'?'bike':'car',image:v.imageUrl||'',data:v}));
 $('#catalog').innerHTML=items.length?items.map((x,i)=>`<article class="tile">${cardMedia(x)}<div class="tile-body"><div class="section-tag">${escapeHTML(x.desc)}</div><h3>${escapeHTML(x.name)}</h3><p>${x.kind==='hotel'?'Pilih tipe kamar untuk melanjutkan reservasi.':x.kind==='transport'?escapeHTML(x.data.description||'Sewa kendaraan dari JogjaTrans.'):'Tentukan tanggal dan tiket untuk itinerary.'}</p>${x.kind==='transport'?'<span class="rental-card-total">Total '+money(x.data.totalPrice)+' · '+escapeHTML(String(x.data.days))+' hari · '+escapeHTML(String(x.data.unitsAvailable))+' unit tersedia · '+(x.data.withDriver?'Dengan sopir':'Lepas kunci')+' · simulasi</span>':''}<div class="tile-row"><strong>${x.price?money(x.price):'—'} <small>${x.kind==='hotel'?'/ malam':x.kind==='transport'?'/ hari':''}</small></strong><button data-view="${i}" ${x.kind==='transport'&&(x.data.available!==true||Number(x.data.unitsAvailable)<1)?'disabled':''}>${x.kind==='transport'?(x.data.available===true&&Number(x.data.unitsAvailable)>0?'Pilih kendaraan':'Stok habis'):'Pilih layanan'}</button></div></div></article>`).join(''):(rental?'<div class="empty"><strong>'+escapeHTML(state.rentalLoading?'Memuat kendaraan…':state.rentalError?'Katalog tidak dapat dimuat':'Tidak ada kendaraan sesuai filter')+'</strong>'+escapeHTML(state.rentalError||'Ubah tanggal atau filter, lalu cari kembali.')+'</div>':'<div class="empty"><strong>'+(state.catalogLoading||state.rentalLoading?'Memuat katalog…':'Belum ada katalog')+'</strong>Periksa koneksi API penyedia atau filter wilayah Anda.</div>');$$('[data-view]').forEach(b=>b.onclick=()=>openDetail(items[Number(b.dataset.view)]))}
function openDetail(x){if(!x)return;if(x.kind==='transport'){openRentalDetail(x);return;}let html=`<div class="section-tag">${x.kind==='hotel'?'JOGJASTAY HOTEL':'WISATA JOGJA'}</div><h2 class="dialog-title">${escapeHTML(x.name)}</h2><p class="dialog-sub">${escapeHTML(x.desc)}</p><div class="modalfields">`;if(x.kind==='hotel'){const rooms=state.rooms.filter(r=>String(r.hotelId||r.hotel_id)===x.id);if(!rooms.length){toast('Belum ada kamar untuk hotel ini');return}html+=`<label>Pilih kamar<select id="mRoom">${rooms.map(r=>`<option value="${escapeHTML(String(r.roomId||r.id))}">${escapeHTML(r.roomType||r.type||'Kamar')} — ${money(r.pricePerNight||r.price_per_night)}</option>`).join('')}</select></label><label>Check-in<input id="mIn" type="date" min="${dateStr(today)}" value="${tripDate()}"></label><label>Check-out<input id="mOut" type="date" value="${endDate(tripDate(),nights())}"></label><label>Jumlah tamu<input id="mGuests" type="number" min="1" max="20" value="${guests()}"></label>`}else{html+=`<label>Tanggal kunjungan<input id="mDate" type="date" min="${dateStr(today)}" value="${tripDate()}"></label><label>Jumlah tiket<input id="mQty" type="number" min="1" max="20" value="${guests()}"></label><label>Tipe tiket<select id="mTier"><option value="base">Reguler</option><option value="plus">Plus (jika tersedia)</option></select></label>`}html+=`<label>${x.kind==='hotel'?'Perkiraan jam tiba di hotel':'Jam kunjungan yang diinginkan'}<input id="mStartTime" type="time" required></label><label>${x.kind==='hotel'?'Perkiraan akhir proses check-in':'Perkiraan jam selesai kunjungan'}<input id="mEndTime" type="time" required></label><p class="help-text">Jam adalah rencana pribadi di Itinerary Jogja; tiket/kamar tidak otomatis dipesan untuk slot waktu tersebut. Periksa jam operasional dan aturan penyedia.</p></div><button id="addItem" class="primary wide">+ Tambahkan ke itinerary</button>`;$('#detailContent').innerHTML=html;$('#detailDialog').showModal();$('#addItem').onclick=()=>{let item;if(x.kind==='hotel')item={type:'hotel',hotelId:x.id,roomId:$('#mRoom').value,checkIn:$('#mIn').value,checkOut:$('#mOut').value,guests:Number($('#mGuests').value)};else item={type:'wisata',destinationId:Number(x.id),visitDate:$('#mDate').value,quantity:Number($('#mQty').value),tier:$('#mTier').value};if(item.type==='hotel'&&(item.checkOut<=item.checkIn||item.guests<1)){toast('Periksa tanggal dan jumlah tamu');return}if(item.type==='wisata'&&item.quantity<1){toast('Jumlah tiket tidak valid');return}const start=$('#mStartTime').value,end=$('#mEndTime').value;if(!jtValidTimes(start,end)){toast('Pilih jam mulai dan jam selesai yang valid');return}item.plannedStartTime=start;item.plannedEndTime=end;if(state.cart.length>=5){toast('Maksimal lima layanan per paket');return}state.cart.push({item,name:x.name,estimate:x.price});state.quote=null;saveCart();$('#detailDialog').close();toast(x.name+' berhasil ditambahkan');page('planner')}}
async function openRentalDetail(x){
 const v=x.data;if(v.available!==true||Number(v.unitsAvailable)<1){toast('Kendaraan tidak tersedia');return}
 if(state.cart.length>=5){toast('Maksimal lima layanan per paket');return}
 const p={startDate:v.startDate,endDate:v.endDate,withDriver:v.withDriver===true};
 if(!p.startDate||!p.endDate){toast('Tanggal dari JogjaTrans tidak lengkap. Muat ulang katalog.');return}
 const slot=await jtChooseSchedule({title:'pengambilan '+v.name,date:p.startDate,minDate:p.startDate,maxDate:p.startDate,info:'Sewa '+p.startDate+' sampai '+p.endDate+' · '+(p.withDriver?'dengan sopir':'lepas kunci')+' · estimasi '+money(v.totalPrice)+'. Jam pengambilan merupakan rencana pribadi.'});
 if(!slot)return;
 const item={type:'transport',vehicleId:String(v.id),startDate:p.startDate,endDate:p.endDate,withDriver:p.withDriver,plannedStartTime:slot.startTime,plannedEndTime:slot.endTime};
 if(state.cart.some(c=>c.item.type==='transport'&&c.item.vehicleId===item.vehicleId&&c.item.startDate===item.startDate&&c.item.endDate===item.endDate&&c.item.withDriver===item.withDriver)){toast('Kendaraan sudah dipilih untuk periode ini');return}
 state.cart.push({item,name:v.name,estimate:Number(v.totalPrice)});state.quote=null;
 $('#v4UseTransport').checked=true;
 saveCart();toast(v.name+' ditambahkan ke itinerary. Belum dipesan.');page('planner');
}
$('#closeDialog').onclick=()=>$('#detailDialog').close();
function saveCart(){sessionStorage.setItem('jt_cart',JSON.stringify(state.cart));$('#cartCount').textContent=state.cart.length;if(typeof integratedTransportSummary==='function')integratedTransportSummary()}
function jtValidTimes(start,end){return /^([01]\d|2[0-3]):[0-5]\d$/.test(start||'')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(end||'')&&end>start}
function jtItemDate(item){return item.type==='hotel'?item.checkIn:item.type==='transport'?item.startDate:item.visitDate}
function jtCartScheduleLabel(item){return item.plannedStartTime&&item.plannedEndTime?`${item.plannedStartTime}–${item.plannedEndTime} WIB (rencana)`:'Jam belum dipilih'}
async function jtEditCartSchedule(index){
 const c=state.cart[index];if(!c)return;
 const item=c.item;
 if(typeof jtChooseSchedule!=='function'){toast('Editor jadwal belum siap. Refresh halaman.');return}
 const selected=await jtChooseSchedule({title:c.name,date:jtItemDate(item),minDate:dateStr(today),startTime:item.plannedStartTime||'',endTime:item.plannedEndTime||'',info:item.type==='hotel'?'Jam kedatangan pribadi; pastikan kebijakan check-in JogjaStay.':'Jam kunjungan pribadi, bukan slot tiket yang dikonfirmasi Wisata Service.'});
 if(!selected)return;
 if(item.type==='hotel'){
  const nightsCount=Math.max(1,Math.round((new Date(item.checkOut+'T12:00:00')-new Date(item.checkIn+'T12:00:00'))/86400000));
  item.checkIn=selected.date;item.checkOut=endDate(selected.date,nightsCount);
 }else if(item.type==='transport'){const days=exploreRentalDays(item);item.startDate=selected.date;item.endDate=endDate(selected.date,days-1)}else item.visitDate=selected.date;
 item.plannedStartTime=selected.startTime;item.plannedEndTime=selected.endTime;
 state.quote=null;renderCart();toast('Jadwal berubah. Periksa harga dan stok kembali sebelum checkout.');
}
function renderCart(){
 saveCart();$('#itemCount').textContent=state.cart.length+' layanan';
 $('#cartItems').innerHTML=state.cart.length?state.cart.map((c,i)=>`<div class="cart-row"><div><h4>${escapeHTML(c.name)}</h4><p>${c.item.type==='hotel'?`${escapeHTML(c.item.checkIn)} → ${escapeHTML(c.item.checkOut)} · ${c.item.guests} tamu`:c.item.type==='transport'?`${escapeHTML(c.item.startDate)} → ${escapeHTML(c.item.endDate)} · ${c.item.withDriver?'Dengan sopir':'Lepas kunci'} · simulasi`:`${escapeHTML(c.item.visitDate)} · ${c.item.quantity} tiket`}</p><p class="jt-cart-clock">${escapeHTML(jtCartScheduleLabel(c.item))}</p><small class="jt-cart-disclaimer">Waktu adalah rencana, bukan slot reservasi provider</small></div><div class="jt-cart-actions"><button class="jt-cart-edit" data-edit-schedule="${i}">Atur jadwal</button><button class="remove" data-remove="${i}">Hapus</button></div></div>`).join(''):'<div class="empty"><strong>Itinerary masih kosong</strong>Pilih hotel, wisata, atau transportasi di halaman Jelajahi.</div>';
 $$('[data-remove]').forEach(x=>x.onclick=()=>{state.cart.splice(Number(x.dataset.remove),1);state.quote=null;renderCart()});
 $$('[data-edit-schedule]').forEach(x=>x.onclick=()=>jtEditCartSchedule(Number(x.dataset.editSchedule)));
 $('#summaryItems').innerHTML=state.cart.map((c,i)=>`<div class="price-row"><span>${escapeHTML(c.name)}<small class="jt-summary-clock">${escapeHTML(jtCartScheduleLabel(c.item))}</small></span><span>${state.quote?.items?.[i]?money(state.quote.items[i].amount):'Belum dicek'}</span></div>`).join('');
 $('#cartTotal').textContent=state.quote?money(state.quote.total):'—';
 $('#summaryDesc').textContent=state.cart.length?`${state.cart.length} pilihan dalam satu rencana perjalanan.`:'Tambahkan layanan untuk membentuk paketmu.';
 $('#bookBtn').disabled=!state.quote||!state.cart.length;
}
function payload(){return {customer:{name:$('#customerName').value.trim(),email:$('#customerEmail').value.trim(),phone:$('#customerPhone').value.trim()},items:state.cart.map(c=>c.item)}}
$('#quoteBtn').onclick=async()=>{if(!state.cart.length){toast('Tambahkan layanan dahulu');return}if(state.cart.some(c=>!jtValidTimes(c.item.plannedStartTime,c.item.plannedEndTime))){toast('Atur jam rencana pada setiap layanan sebelum quote');return}const b=$('#quoteBtn');b.disabled=true;b.textContent='Memeriksa API...';try{state.quote=await request('/api/quote',{method:'POST',body:JSON.stringify(payload())});renderCart();toast('Harga dan stok berhasil diverifikasi')}catch(e){state.quote=null;renderCart();toast(e.message)}finally{b.disabled=false;b.textContent='Periksa harga & stok'}};
$('#bookBtn').onclick=async()=>{if(!state.quote)return;if(state.cart.some(c=>!jtValidTimes(c.item.plannedStartTime,c.item.plannedEndTime))){toast('Jadwal layanan belum lengkap');return}if(!$('#customerName').value.trim()||!$('#customerEmail').value.includes('@')){toast('Lengkapi nama dan email');return}if(!confirm('Konfirmasi reservasi DEMO ke layanan hotel/wisata? Booking akan tercatat pada database provider.'))return;const b=$('#bookBtn');b.disabled=true;b.textContent='Mengirim ke provider...';try{const res=await request('/api/book',{method:'POST',body:JSON.stringify(payload())});state.orders.unshift({id:res.order.id,token:res.accessToken});localStorage.setItem('jt_orders',JSON.stringify(state.orders));state.cart=[];state.quote=null;saveCart();page('orders');toast('Status paket: '+res.order.status+'. Kode: '+res.order.id)}catch(e){toast(e.message+' — Periksa status sebelum mencoba lagi.')}finally{b.disabled=false;b.textContent='Konfirmasi booking'}};
function renderOrders(){$('#orderList').innerHTML=state.orders.length?state.orders.map(o=>`<div class="ordercard"><h3>${escapeHTML(o.id)}</h3><p>Token disimpan di browser ini. Pilih untuk memeriksa status dan sinkronkan jika ada perubahan provider.</p><button class="dark" data-order="${escapeHTML(o.id)}">Lihat rincian <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/icons.svg#arrow"></use></svg></button></div>`).join(''):'<div class="empty"><strong>Belum ada pesanan di browser ini</strong>Setelah checkout, data pesanan muncul di sini.</div>';$$('[data-order]').forEach(x=>x.onclick=()=>{const o=state.orders.find(n=>n.id===x.dataset.order);$('#lookupId').value=o.id;$('#lookupToken').value=o.token;lookup()})}
async function lookup(){const id=$('#lookupId').value.trim(),token=$('#lookupToken').value.trim();if(!id||!token){toast('ID dan token akses harus diisi');return}try{const o=await request('/api/orders/'+encodeURIComponent(id),{headers:{'X-Order-Token':token}});$('#lookupResult').innerHTML=`<div class="ordercard"><h3>${escapeHTML(o.id)} <span class="status ${escapeHTML(o.status)}">${escapeHTML(o.status)}</span></h3><p>${escapeHTML(o.customer.name)} · ${escapeHTML(o.createdAt)}</p>${o.items.map((x,i)=>`<div class="price-row"><div><strong>${escapeHTML(x.item.type.toUpperCase())}</strong><br><small>${escapeHTML(x.bookingId||x.error||'Belum diproses')}<br><small>${escapeHTML(jtCartScheduleLabel(x.item))}</small>${x.syncError?'<br><em class="sync-error">Gagal verifikasi: '+escapeHTML(x.syncError)+'</em>':''}</small></div><span class="status ${escapeHTML(x.status)}">${escapeHTML(x.status)}</span></div>`).join('')}<div class="price-row total">Total terkonfirmasi <strong>${money(o.total)}</strong></div></div>`}catch(e){toast(e.message)}}
$('#lookupBtn').onclick=lookup;$('#findBtn').onclick=loadCatalog;state.cart=JSON.parse(sessionStorage.getItem('jt_cart')||'[]');renderCatalog();saveCart();loadCatalog();
