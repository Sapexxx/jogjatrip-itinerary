/* I5: isolated frontend checkout reference and status UX.
 * DRAFT is a local preparation only, NEVER a provider booking.
 * Explicitly opted-in plan preparation may contact the same-origin backend.
 * No customer PII or checkout credential is persisted in browser storage.
 */
(function(root){
'use strict';
const PREFIX='jt_i5_draft_';
const STATES=new Set(['PREPARED','DRAFT','IN_FLIGHT','UNKNOWN','AWAITING_CONFIRMATION','CONFIRMED','COMPENSATED','PARTIAL','BLOCKED']);
const LOCKED=new Set(['PREPARED','IN_FLIGHT','UNKNOWN','AWAITING_CONFIRMATION','CONFIRMED','PARTIAL']);
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
 function createToken(){const bytes=new Uint8Array(32);cryptoProvider.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
 // This is a prepare-only request, never a provider HOLD or CONFIRM.
 async function prepareServer(input,approval,fetcher,onToken=()=>{}){
  const problem=inspect(input);if(problem)throw Error(problem);
  assert(input.scope.startsWith('plan:')&&input.quote.available===true&&input.quote.items.length===input.items.length,'PLAN_QUOTE_REQUIRED');
  assert(approval?.consent===true&&approval?.priceAccepted===true&&approval.approvedTotal===input.quote.total,'EXPLICIT_CONSENT_AND_PRICE_REQUIRED');
  assert(typeof approval.planToken==='string'&&/^[a-f0-9]{48}$/.test(approval.planToken),'PLAN_AUTH_REQUIRED');
  const customer={name:String(approval.customer?.name||'').trim(),phone:String(approval.customer?.phone||'').trim(),email:String(approval.customer?.email||'').trim()};
  assert(customer.name.length>=2&&customer.name.length<=100&&/^[0-9+ -]{9,20}$/.test(customer.phone)&&customer.email.length<=120&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email),'INVALID_CUSTOMER');
  const scope=input.scope;
  assert(!LOCKED.has(get(scope)?.state),'CHECKOUT_STATE_LOCKED');
  // Copy the exact reviewed selection before awaiting crypto/storage.
  const approvedItems=JSON.parse(JSON.stringify(input.items));
  const draft=await prepare({...input,items:approvedItems});
  assert(!LOCKED.has(get(scope)?.state),'CHECKOUT_STATE_LOCKED');
  const accessToken=approval.accessToken??createToken();assert(typeof accessToken==='string'&&/^[a-f0-9]{64}$/.test(accessToken),'INVALID_CHECKOUT_TOKEN');
  // Persist a nonsecret lock before network I/O. Never automatically replay a
  // possibly persisted preparation; recovery is a separate operator/user flow.
  transition(scope,'IN_FLIGHT');
  try{
   onToken(accessToken);
   const response=await fetcher('/api/interop/itineraries/'+encodeURIComponent(scope.slice(5))+'/prepare',{
    method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',
    headers:{'Content-Type':'application/json','Accept':'application/json','X-Plan-Token':approval.planToken},
    body:JSON.stringify({key:draft.key,accessToken,consent:true,approvedTotal:approval.approvedTotal,approvedItems,customer})
   });
   if(!response.ok)throw Error('PREPARATION_NOT_VERIFIED');
   const result=await response.json();
   assert(/^JT-[a-f0-9]{32}$/.test(result.orderId)&&result.bookingPerformed===false&&result.state==='NOT_STARTED'&&typeof result.created==='boolean','INVALID_PREPARATION_RESPONSE');
   const current=get(scope);storage.setItem(slot(scope),JSON.stringify({...current,state:'PREPARED',orderId:result.orderId}));
   return {orderId:result.orderId,created:result.created,bookingPerformed:false};
  }catch(e){transition(scope,'UNKNOWN');throw e}
 }
 async function recoverServer(scope,planToken,token,fetcher){
  const prior=get(scope);
  assert(/^plan:[A-Za-z0-9_-]{1,128}$/.test(scope)&&prior&&LOCKED.has(prior.state),'RECOVERY_REFERENCE_REQUIRED');
  assert(typeof planToken==='string'&&/^[a-f0-9]{48}$/.test(planToken)&&typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'RECOVERY_AUTH_REQUIRED');
  const response=await fetcher('/api/interop/itineraries/'+encodeURIComponent(scope.slice(5))+'/prepare',{
   method:'GET',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',
   headers:{Accept:'application/json','X-Plan-Token':planToken,'X-Checkout-Key':prior.key,'X-Interop-Token':token}
  });
  if(!response.ok)throw Error('RECOVERY_NOT_VERIFIED');
  const data=await response.json();
  assert(data.verifiedBy==='D1_JOURNAL'&&/^JT-[a-f0-9]{32}$/.test(data.orderId)&&(!prior.orderId||prior.orderId===data.orderId)&&data.paymentVerified===false&&data.bookingsAtomic===false&&(data.status==='NOT_STARTED'||STATES.has(data.status)&&!['DRAFT','PREPARED'].includes(data.status)),'INVALID_RECOVERY_RESPONSE');
  // Always retain the local lock: even a terminal journal result is not proof
  // that the plan is editable or that a second checkout is authorized.
  const current=get(scope);assert(current&&current.key===prior.key,'RECOVERY_REFERENCE_CHANGED');
  storage.setItem(slot(scope),JSON.stringify({...current,state:data.status==='NOT_STARTED'?'PREPARED':LOCKED.has(data.status)?data.status:'PREPARED',orderId:data.orderId}));
  return data;
 }
 function reset(scope){
  const prior=get(scope);if(prior&&LOCKED.has(prior.state))throw new Error('CHECKOUT_STATE_LOCKED');
  storage.removeItem(slot(scope));
 }
 return Object.freeze({get,prepare,prepareServer,createToken,recoverServer,reset});
}
const descriptions={
 PREPARED:'Snapshot checkout tersimpan di D1. Belum ada HOLD, CONFIRM atau pembayaran. Jangan membuat checkout baru.',
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
 const panels=new Map();let preparationEnabled=false;
 for(const view of views){
  const anchor=doc.getElementById(view.anchor);if(!anchor)continue;
  const el=doc.createElement('section');el.className='jt-i5-checkout';el.setAttribute('aria-label','Persiapan perjalanan');
  const heading=doc.createElement('h3');heading.textContent='Persiapan perjalanan aman';
  const detail=doc.createElement('p');detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
  const action=doc.createElement('button');action.type='button';action.className='outlinewide';action.textContent='Simpan referensi rencana';
  const note=doc.createElement('small');note.textContent='Ini hanya menyimpan referensi rencana. Belum membuat pemesanan atau menghubungi penyedia.';
  // Read-only server journal lookup; credentials are typed, never persisted.
  const statusForm=doc.createElement('form');statusForm.setAttribute('aria-label','Periksa status referensi pesanan');
  const idLabel=doc.createElement('label');idLabel.textContent='Nomor referensi pesanan';
  const orderInput=doc.createElement('input');orderInput.type='text';orderInput.name='orderId';orderInput.placeholder='JT-...';orderInput.autocomplete='off';idLabel.append(orderInput);
  const tokenLabel=doc.createElement('label');tokenLabel.textContent='Kode rahasia pesanan';
  const tokenInput=doc.createElement('input');tokenInput.type='password';tokenInput.name='checkoutToken';tokenInput.autocomplete='off';tokenInput.spellcheck=false;tokenLabel.append(tokenInput);
  const check=doc.createElement('button');check.type='submit';check.className='outlinewide';check.textContent='Periksa status tersimpan (baca saja)';
  const statusOut=doc.createElement('p');statusOut.setAttribute('role','status');statusOut.setAttribute('aria-live','polite');
  const statusNote=doc.createElement('small');statusNote.textContent='Kode rahasia hanya digunakan untuk pemeriksaan ini, tidak disimpan atau dimasukkan ke URL.';
  statusForm.append(idLabel,tokenLabel,check,statusOut,statusNote);
  statusForm.addEventListener('submit',async e=>{
   e.preventDefault();
   const id=orderInput.value.trim(),token=tokenInput.value.trim();
   if(!/^JT-[a-f0-9]{32}$/.test(id)||!/^[a-f0-9]{64}$/.test(token)){
    statusOut.textContent='Format ID atau token tidak valid.';return;
   }
   check.disabled=true;
   try{
    const response=await root.fetch('/api/interop/checkouts/'+encodeURIComponent(id),{
     method:'GET',cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer',
     headers:{'X-Interop-Token':token,'Accept':'application/json'}
    });
    if(!response.ok)throw Error('Status belum tersedia atau token tidak sesuai.');
    const data=await response.json();
    if(data.verifiedBy!=='D1_JOURNAL'||data.orderId!==id||!STATES.has(data.status)&&data.status!=='NOT_STARTED')
     throw Error('Respons status tidak dapat diverifikasi.');
    const labels=Array.isArray(data.items)?data.items.map(x=>String(x.provider)+': '+String(x.state)+' (reservasi '+String(x.reservationState??'UNKNOWN')+', bayar '+String(x.paymentState??'UNKNOWN')+')').join(' · '):'';
    statusOut.textContent='D1 journal: '+data.status+'. '+labels+'. Tidak membuktikan pembayaran atau transaksi atomik.';
   }catch(_){statusOut.textContent='Status checkout tidak tersedia atau belum dapat diverifikasi. Jangan mengirim ulang transaksi.'}
   finally{tokenInput.value='';check.disabled=false}
  });
  let prep=null;
  if(view.id==='plan'){
   const section=doc.createElement('div');section.hidden=true;
   const dataLabel=doc.createElement('label'),consent=doc.createElement('input');consent.type='checkbox';consent.checked=false;
   dataLabel.append(consent,doc.createTextNode(' Saya setuju nama, telepon, dan email digunakan untuk menyiapkan checkout dan diteruskan ke penyedia yang dipilih hanya pada transaksi yang nanti diotorisasi.'));
   const priceLabel=doc.createElement('label'),price=doc.createElement('input');price.type='checkbox';price.checked=false;
   const amount=doc.createElement('span');priceLabel.append(price,amount);
   const submit=doc.createElement('button');submit.type='button';submit.className='outlinewide';submit.textContent='Simpan persiapan pesanan (tanpa booking)';
   const out=doc.createElement('p');out.setAttribute('role','status');out.setAttribute('aria-live','polite');
   const help=doc.createElement('small');help.textContent='Persetujuan ini tidak melakukan pembayaran atau reservasi. Simpan kode rahasia sebelum melanjutkan; kode tidak dapat dipulihkan.';
   const makeToken=doc.createElement('button');makeToken.type='button';makeToken.className='outlinewide';makeToken.textContent='Buat kode rahasia pesanan';
   const savedLabel=doc.createElement('label'),saved=doc.createElement('input');saved.type='checkbox';saved.checked=false;savedLabel.append(saved,doc.createTextNode(' Saya sudah menyimpan kode rahasia ini secara aman.'));
   section.append(dataLabel,priceLabel,makeToken,savedLabel,submit,out,help);el.append(heading,detail,action,note,section,statusForm);
   prep={section,consent,price,amount,submit,out,makeToken,saved,token:null,busy:false,signature:null};
   makeToken.addEventListener('click',()=>{if(makeToken.disabled)return;prep.token=manager.createToken();tokenInput.value=prep.token;saved.checked=false;out.textContent='Token tersedia pada kolom status. Salin dan simpan secara aman sebelum melanjutkan.';refresh('plan')});
   const copyToken=doc.createElement('button');copyToken.type='button';copyToken.className='outlinewide';copyToken.textContent='Salin kode rahasia';
   copyToken.addEventListener('click',async()=>{if(!/^[a-f0-9]{64}$/.test(tokenInput.value))return;try{await root.navigator.clipboard.writeText(tokenInput.value);statusOut.textContent='Kode disalin. Simpan secara aman.'}catch{statusOut.textContent='Salin token secara manual dari kolom token.';tokenInput.select()}});
   const downloadToken=doc.createElement('button');downloadToken.type='button';downloadToken.className='outlinewide';downloadToken.textContent='Unduh kode rahasia (.txt)';
   downloadToken.addEventListener('click',()=>{
    const value=tokenInput.value.trim();if(!/^[a-f0-9]{64}$/.test(value))return;
    const blob=new Blob([value+'\n'],{type:'text/plain;charset=utf-8'});
    const file=root.URL.createObjectURL(blob),link=doc.createElement('a');
    link.href=file;link.download='kode-rahasia-jogjatrip.txt';link.style.display='none';
    doc.body.append(link);link.click();link.remove();root.setTimeout(()=>root.URL.revokeObjectURL(file),0);
    statusOut.textContent='File kode rahasia diunduh. Simpan di tempat yang aman; jangan bagikan kepada orang lain.';
   });
   const recover=doc.createElement('button');recover.type='button';recover.className='outlinewide';recover.textContent='Cari kembali nomor pesanan (baca saja)';
   recover.addEventListener('click',async()=>{const input=view.get(),live=root.JTInteropI5Plan?.();if(!input||!live||recover.disabled)return;recover.disabled=true;try{const data=await manager.recoverServer(input.scope,live.planToken,tokenInput.value.trim(),root.fetch.bind(root));orderInput.value=data.orderId;statusOut.textContent='D1 journal: '+data.status+'. ID checkout berhasil dipulihkan. Tidak ada transaksi baru.'}catch{statusOut.textContent='Pemulihan belum terverifikasi. Jangan membuat checkout baru.'}finally{tokenInput.value='';refresh('plan')}});
   statusForm.append(copyToken,downloadToken,recover);prep.recover=recover;
   saved.addEventListener('change',()=>refresh('plan'));
   const reset=()=>{consent.checked=false;price.checked=false;refresh('plan')};
   for(const id of ['ibName','ibPhone','ibEmail'])doc.getElementById(id)?.addEventListener('input',reset);
   consent.addEventListener('change',()=>refresh('plan'));price.addEventListener('change',()=>refresh('plan'));
   submit.addEventListener('click',async()=>{
    const input=view.get(),live=root.JTInteropI5Plan?.();
    if(!preparationEnabled||prep.busy||!input||!live||!consent.checked||!price.checked||!prep.saved.checked||!prep.token)return;
    if(prep.signature!==canonical({scope:input.scope,items:input.items,quote:input.quote,revision:live.quoteRevision??0})){reset();return}
    const customer={name:doc.getElementById('ibName')?.value,phone:doc.getElementById('ibPhone')?.value,email:doc.getElementById('ibEmail')?.value};
    prep.busy=true;submit.disabled=true;
    try{
     const result=await manager.prepareServer(input,{consent:consent.checked,priceAccepted:price.checked,approvedTotal:input.quote.total,planToken:live.planToken,accessToken:prep.token,customer},root.fetch.bind(root),token=>{tokenInput.value=token;orderInput.value=''});
     orderInput.value=result.orderId;out.textContent='Checkout '+result.orderId+' tersimpan. Belum ada booking. Simpan token akses pada kolom status.';
    }catch(e){out.textContent='Persiapan belum dapat diverifikasi. Periksa status atau minta bantuan operator; jangan ulangi jika hasil belum pasti.'}
    finally{prep.busy=false;prep.token=null;prep.saved.checked=false;consent.checked=false;price.checked=false;refresh('plan')}
   });
  }else el.append(heading,detail,action,note,statusForm);
  anchor.parentNode.insertBefore(el,anchor);panels.set(view.id,{view,detail,action,prep});
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
  for(const [id,{view,detail,action,prep}] of panels){
   if(which&&which!==id)continue;
   const input=view.get(),problem=input?inspect(input):'Data itinerary belum tersedia.';
   const prior=input?manager.get(input.scope):null;
   if(prep){
    const live=root.JTInteropI5Plan?.(),signature=input?canonical({scope:input.scope,items:input.items,quote:input.quote,revision:live?.quoteRevision??0}):null;
    if(signature!==prep.signature){prep.signature=signature;prep.consent.checked=false;prep.price.checked=false;prep.token=null;prep.saved.checked=false}
    prep.section.hidden=!preparationEnabled;
    prep.amount.textContent=' Saya menyetujui total '+(input?.quote?'Rp '+input.quote.total.toLocaleString('id-ID'):'(belum tersedia)')+' (simulasi).';
    const blocked=!!problem||!input?.quote?.available||!!(prior&&LOCKED.has(prior.state))||prep.busy;
    prep.consent.disabled=blocked;prep.price.disabled=blocked;prep.makeToken.disabled=blocked;prep.saved.disabled=blocked||!prep.token;prep.recover.disabled=!(prior&&LOCKED.has(prior.state))||prep.busy;prep.submit.disabled=blocked||!prep.consent.checked||!prep.price.checked||!prep.saved.checked||!prep.token;
   }
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
 return Object.freeze({refresh,manager,setPreparationEnabled(enabled){preparationEnabled=enabled===true;refresh('plan')}});
}
const api={createDraftManager,inspect,description,mount};
root.JTInteropI5=api;
if(root.document)root.JTInteropI5Mounted=mount();
})(typeof window==='undefined'?globalThis:window);
