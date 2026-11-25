/* I5: isolated frontend checkout reference and status UX.
 * DRAFT is a local preparation only, NEVER a provider booking.
 * No route is called; no customer PII, provider credential, or access token stored.
 */
(function(root){
'use strict';
const PREFIX='jt_i5_draft_';
const STATES=new Set(['DRAFT','IN_FLIGHT','UNKNOWN','AWAITING_CONFIRMATION','CONFIRMED','COMPENSATED','PARTIAL','BLOCKED']);
const LOCKED=new Set(['IN_FLIGHT','UNKNOWN','AWAITING_CONFIRMATION','CONFIRMED','PARTIAL']);
function assert(ok,message){if(!ok)throw new Error(message)}
function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 assert(v!==undefined&&typeof v==='object','INVALID_SELECTION');
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
function inspect({scope,items,quote}){
 if(!/^(cart|plan:[A-Za-z0-9_-]{1,128})$/.test(scope||''))return 'Simpan itinerary terlebih dahulu sebelum menyiapkan referensi.';
 if(!Array.isArray(items)||!items.length||items.length>3)return 'Contract 0.2 memerlukan 1–3 pilihan provider yang berbeda.';
 const allowed=new Set(['hotel','wisata','transport']);
 if(items.some(x=>!x||!allowed.has(x.type))||new Set(items.map(x=>x.type)).size!==items.length)
  return 'Satu provider hanya boleh muncul satu kali; perbaiki pilihan terlebih dahulu.';
 if(!quote||!Number.isSafeInteger(quote.total)||quote.total<0||quote.available===false||
    !Array.isArray(quote.items)||quote.items.length<items.length)
  return 'Periksa harga dan stok untuk pilihan terbaru terlebih dahulu.';
 return null;
}
function createDraftManager(storage,cryptoProvider,clock=()=>Date.now()){
 assert(storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function','INVALID_STORAGE');
 assert(cryptoProvider&&typeof cryptoProvider.getRandomValues==='function'&&cryptoProvider.subtle,'SECURE_RANDOM_REQUIRED');
 const slot=scope=>PREFIX+scope;
 function get(scope){
  try{
   const data=JSON.parse(storage.getItem(slot(scope))||'null');
   return data&&/^[A-Za-z0-9_-]{16,100}$/.test(data.key)&&/^[a-f0-9]{64}$/.test(data.fingerprint)&&STATES.has(data.state)?data:null;
  }catch{return null}
 }
 async function prepare(input){
  const problem=inspect(input);if(problem)throw new Error(problem);
  const plain=canonical({scope:input.scope,items:input.items,quote:{total:input.quote.total,items:input.quote.items}});
  const digest=await cryptoProvider.subtle.digest('SHA-256',new TextEncoder().encode(plain));
  const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const old=get(input.scope);
  if(old?.fingerprint===fingerprint)return {...old,reused:true};
  if(old&&LOCKED.has(old.state))throw new Error('CHECKOUT_STATE_LOCKED: jangan membuat ulang checkout yang mungkin sudah diproses');
  const random=new Uint8Array(24);cryptoProvider.getRandomValues(random);
  const key='jt_i5_'+Array.from(random,b=>b.toString(16).padStart(2,'0')).join('');
  const next={key,fingerprint,state:'DRAFT',createdAt:clock(),scope:input.scope};
  storage.setItem(slot(input.scope),JSON.stringify(next));
  return {...next,reused:false};
 }
 function transition(scope,next){
  assert(STATES.has(next),'INVALID_STATE');
  const previous=get(scope);assert(previous,'DRAFT_NOT_FOUND');
  const transitions={
   DRAFT:['IN_FLIGHT','BLOCKED'],IN_FLIGHT:['UNKNOWN','AWAITING_CONFIRMATION','PARTIAL','COMPENSATED','BLOCKED'],
   UNKNOWN:['AWAITING_CONFIRMATION','PARTIAL','CONFIRMED','COMPENSATED','BLOCKED'],
   AWAITING_CONFIRMATION:['IN_FLIGHT','UNKNOWN','CONFIRMED','COMPENSATED','BLOCKED'],
   PARTIAL:['UNKNOWN','CONFIRMED','COMPENSATED','BLOCKED'],BLOCKED:[],CONFIRMED:[],COMPENSATED:[]
  };
  assert(transitions[previous.state].includes(next),'INVALID_TRANSITION');
  const updated={...previous,state:next};
  storage.setItem(slot(scope),JSON.stringify(updated));
  return updated;
 }
 function reset(scope){
  const prior=get(scope);if(prior&&LOCKED.has(prior.state))throw new Error('CHECKOUT_STATE_LOCKED');
  storage.removeItem(slot(scope));
 }
 return Object.freeze({get,prepare,transition,reset});
}
const descriptions={
 DRAFT:'Referensi checkout lokal tersedia. Belum ada HOLD, CONFIRM, pembayaran atau panggilan provider.',
 IN_FLIGHT:'Permintaan mungkin masih diproses. Jangan lakukan checkout ulang.',
 UNKNOWN:'Hasil transaksi belum diketahui. Jangan kirim ulang; diperlukan reconciliation dari server.',
 AWAITING_CONFIRMATION:'Hold tercatat, tetapi belum berarti reservasi terkonfirmasi atau dibayar.',
 CONFIRMED:'Provider telah mengonfirmasi sesuai bukti backend; pembayaran tetap diverifikasi terpisah.',
 COMPENSATED:'Kompensasi tercatat; periksa status aktual setiap provider.',
 PARTIAL:'Sebagian provider berhasil, sebagian belum. Periksa rincian sebelum tindakan lanjutan.',
 BLOCKED:'Checkout tidak dapat dilanjutkan. Periksa syarat transaksi.'
};
function description(state){return descriptions[state]||'Belum ada referensi checkout.'}
function mount(){
 if(!root.document||!root.localStorage)return null;
 const doc=root.document,manager=createDraftManager(root.localStorage,root.crypto);
 const views=[
  {id:'cart',anchor:'bookBtn',get:()=>{
   const s=root.JTInteropI5Cart?.();
   return s?{scope:'cart',items:s.items,quote:s.quote}:null;
  }},
  {id:'plan',anchor:'ibCustomer',get:()=>{
   const s=root.JTInteropI5Plan?.();
   return s?{scope:s.id?'plan:'+s.id:'plan:',items:s.items,quote:s.quote}:null;
  }}
 ];
 const panels=new Map();
 for(const view of views){
  const anchor=doc.getElementById(view.anchor);if(!anchor)continue;
  const el=doc.createElement('section');el.className='jt-i5-checkout';el.setAttribute('aria-label','Kesiapan Contract 0.2');
  const heading=doc.createElement('h3');heading.textContent='Contract 0.2 · Checkout aman';
  const detail=doc.createElement('p');detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
  const action=doc.createElement('button');action.type='button';action.className='outlinewide';action.textContent='Siapkan referensi checkout lokal';
  const note=doc.createElement('small');note.textContent='Tahap I5: hanya menyiapkan identitas transaksi. Tidak membuat booking atau menghubungi provider. Integrasi transaksi belum diaktifkan.';
  el.append(heading,detail,action,note);anchor.parentNode.insertBefore(el,anchor);panels.set(view.id,{view,detail,action});
  action.addEventListener('click',async()=>{
   const input=view.get();if(!input)return;
   action.disabled=true;
   try{
    const draft=await manager.prepare(input);
    detail.textContent='Referensi '+draft.key.slice(0,16)+'… '+(draft.reused?'digunakan kembali. ':'disiapkan. ')+description(draft.state);
   }catch(e){detail.textContent=e.message}
   finally{refresh(view.id)}
  });
 }
 function refresh(which){
  for(const [id,{view,detail,action}] of panels){
   if(which&&which!==id)continue;
   const input=view.get(),problem=input?inspect(input):'Data itinerary belum tersedia.';
   const prior=input?manager.get(input.scope):null;
   if(prior&&LOCKED.has(prior.state)){
    action.disabled=true;detail.textContent=description(prior.state);
   }else{
    action.disabled=!!problem;
    detail.textContent=problem|| (prior?description(prior.state):
     'Quote sebelumnya belum membuktikan kemampuan HOLD provider. Referensi ini hanya untuk draft.');
   }
  }
 }
 refresh();
 return Object.freeze({refresh,manager});
}
const api={createDraftManager,inspect,description,mount};
root.JTInteropI5=api;
})(typeof window==='undefined'?globalThis:window);
