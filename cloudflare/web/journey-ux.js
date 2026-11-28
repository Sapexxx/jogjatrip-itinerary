/* Informational route steps only; preserve the existing hash router and booking gates. */
(function(root){
'use strict';
function active(){
 const path=String(root.location?.hash||'#/beranda');
 if(path.startsWith('#/pesanan'))return 'pantau';
 if(path.startsWith('#/pilihan'))return 'tinjau';
 if(path.startsWith('#/itinerary')||path.startsWith('#/paket')||path.startsWith('#/beranda'))return 'susun';
 return 'susun';
}
function refresh(){
 if(!root.document)return;
 const current=active();
 for(const el of root.document.querySelectorAll('[data-ux-step]')){
  if(el.dataset.uxStep===current)el.setAttribute('aria-current','step');
  else el.removeAttribute('aria-current');
 }
}
function init(){
 refresh();root.addEventListener('hashchange',refresh);
}
root.JTUXJourney=Object.freeze({refresh});
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init()}
})(typeof window==='undefined'?globalThis:window);
