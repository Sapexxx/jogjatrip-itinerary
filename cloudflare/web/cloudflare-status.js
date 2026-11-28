// UX-only health notice. The Worker remains the sole booking authority.
(async () => {
 const notice=document.getElementById('uxJourneyNotice');
 const show=message=>{if(notice)notice.textContent=message};
 try {
  const response=await fetch('/api/health',{cache:'no-store'});
  if(!response.ok){show('Kesiapan checkout belum dapat diverifikasi. Simpan rencana; jangan melakukan booking.');return}
  const health=await response.json();
  window.JTInteropI5Mounted?.setPreparationEnabled(health.interopPreparationEnabled===true);
  if(health.bookingEnabled !== false){show('Gunakan hanya tindakan yang telah disetujui server dan penyedia.');return}
  show('Checkout belum aktif. Anda tetap bisa menyusun perjalanan, menyimpan rencana, dan memeriksa harga simulasi.');
  document.addEventListener('click',event=>{
   const button=event.target.closest?.('#bookBtn, #ibBook, #packageBookBtn');
   if(!button)return;
   event.preventDefault();event.stopImmediatePropagation();
   show('Checkout belum tersedia. Tidak ada reservasi atau pembayaran yang dibuat.');notice?.focus?.();
  },true);
 }catch {
  show('Kesiapan checkout tidak dapat dipastikan. Pembuatan reservasi tetap mengikuti pemeriksaan server.');
 }
})();
