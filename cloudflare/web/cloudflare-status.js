// The Worker remains authoritative; the browser must deny unknown health states.
(() => {
 const notice=document.getElementById('uxJourneyNotice');
 const targets='#bookBtn, #ibBook, #packageBookBtn';
 let bookingAllowed=false;
 const previouslyDisabled=new WeakMap();
 const show=message=>{if(notice)notice.textContent=message};
 const disable=()=>document.querySelectorAll(targets).forEach(button=>{
  if(!previouslyDisabled.has(button))previouslyDisabled.set(button,button.disabled);
  button.disabled=true;button.setAttribute('aria-disabled','true');
 });
 // Install this guard before the asynchronous health call.
 document.addEventListener('click',event=>{
  if(bookingAllowed)return;
  const button=event.target.closest?.(targets);
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  show('Checkout belum terverifikasi. Tidak ada reservasi atau pembayaran yang dibuat.');
 },true);
 disable();
 (async()=>{
  try{
   const response=await fetch('/api/health',{cache:'no-store'});
   if(!response.ok){show('Kesiapan checkout belum dapat diverifikasi. Simpan rencana; jangan melakukan booking.');disable();return}
   const health=await response.json();
   window.JTInteropI5Mounted?.setPreparationEnabled(health.interopPreparationEnabled===true);
   if(health.bookingEnabled !== false && health.bookingEnabled===true){
    bookingAllowed=true;
    document.querySelectorAll(targets).forEach(button=>{
     if(previouslyDisabled.has(button))button.disabled=previouslyDisabled.get(button);
     button.removeAttribute('aria-disabled');
    });
    show('Checkout hanya berjalan jika telah diotorisasi oleh server dan penyedia.');
    return;
   }
   show('Checkout belum aktif. Anda tetap bisa menyusun perjalanan dan memeriksa harga simulasi.');
   disable();
  }catch{
   show('Kesiapan checkout tidak dapat diverifikasi. Pemesanan tidak tersedia.');
   disable();
  }
 })();
})();
