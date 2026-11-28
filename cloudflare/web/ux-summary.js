/* Read-only summary of existing quotes. Never converts a draft into an order. */
(function(root){
'use strict';
function describe(source){
 if(!source||!Array.isArray(source.items))return 'Pilih layanan, lalu periksa harga dan stok dari penyedia.';
 const n=source.items.length;
 if(!n)return 'Belum ada layanan yang dipilih.';
 const amount=source.quote&&source.quote.available===true&&Number.isFinite(source.quote.total)&&source.quote.total>=0;
 const label=n+' layanan dipilih';
 return amount?label+' · Estimasi Rp '+source.quote.total.toLocaleString('id-ID')+' (simulasi; belum dipesan).':label+' · Harga belum diverifikasi; belum ada booking.';
}
function refresh(){
 const node=root.document?.getElementById('uxLiveSummary');if(!node)return;
 const hash=String(root.location?.hash||'');
 const source=hash.startsWith('#/itinerary')?root.JTInteropI5Plan?.():hash.startsWith('#/pilihan')?root.JTInteropI5Cart?.():null;
 node.textContent=source?describe(source):'Pilih layanan sesuai kebutuhan. Harga akhir belum diverifikasi dan belum ada booking.';
}
function init(){
 refresh();root.addEventListener('hashchange',refresh);
 root.document.addEventListener('change',()=>root.requestAnimationFrame?root.requestAnimationFrame(refresh):refresh());
 root.document.addEventListener('click',()=>root.requestAnimationFrame?root.requestAnimationFrame(refresh):refresh());
}
root.JTUXSummary=Object.freeze({describe,refresh});
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init()}
})(typeof window==='undefined'?globalThis:window);
