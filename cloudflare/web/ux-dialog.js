/* Accessible, asynchronous confirmation; no booking or auth logic. */
(function(root){
'use strict';
function ask(message,confirmMode=true){
 return new Promise(resolve=>{
  const prior=root.document.activeElement;
  const dlg=root.document.createElement('dialog');dlg.className='ux-confirm-dialog';dlg.setAttribute('aria-label',confirmMode?'Konfirmasi pilihan':'Informasi');
  const title=root.document.createElement('h2');title.textContent=confirmMode?'Konfirmasi tindakan':'Informasi';
  const body=root.document.createElement('p');body.textContent=String(message);
  const actions=root.document.createElement('div');actions.className='ux-dialog-actions';
  const ok=root.document.createElement('button');ok.type='button';ok.textContent=confirmMode?'Lanjutkan':'Mengerti';ok.className='btn btn--primary';
  const cancel=root.document.createElement('button');cancel.type='button';cancel.textContent='Batal';cancel.className='btn btn--secondary';
  const finish=answer=>{if(!dlg.isConnected)return;dlg.close();dlg.remove();prior?.focus?.();resolve(answer)};
  ok.addEventListener('click',()=>finish(true));cancel.addEventListener('click',()=>finish(false));
  dlg.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
  actions.append(...(confirmMode?[cancel,ok]:[ok]));dlg.append(title,body,actions);root.document.body.append(dlg);
  dlg.showModal();(confirmMode?cancel:ok).focus();
 });
}
root.JTUXDialog=Object.freeze({confirm:message=>ask(message,true),alert:message=>ask(message,false)});
})(typeof window==='undefined'?globalThis:window);
