/* Progressive enhancements for classic-script JogjaTrip. Never change checkout authority. */
(function(root){
'use strict';
const instances=new WeakMap();
function labelFor(el){
 const raw=(el.closest('label')?.childNodes?.[0]?.textContent||root.document.querySelector('label[for="'+el.id+'"]')?.textContent||el.getAttribute('aria-label')||el.id);
 return String(raw).trim().replace(/\s+/g,' ')||el.id;
}
function notify(el){
 el.dispatchEvent(new Event('input',{bubbles:true}));
 el.dispatchEvent(new Event('change',{bubbles:true}));
}
function hideOriginal(el){
 el.classList.add('ux-original-hidden');
 el.setAttribute('aria-hidden','true');el.tabIndex=-1;
}
function stepper(id,settings={}){
 const el=root.document.getElementById(id);
 const select=el?.tagName==='SELECT';
 if(!el||instances.has(el)||!(select||(el.tagName==='INPUT'&&el.type==='number')))return false;
 const min=Number.isFinite(settings.min)?settings.min:Number(el.min||1);
 const max=Number.isFinite(settings.max)?settings.max:Number(el.max||20);
 if(!Number.isInteger(min)||!Number.isInteger(max)||max<min)return false;
 if(select){const values=[...el.options].filter(o=>!o.disabled).map(o=>o.value);if(values.length!==max-min+1||values.some((v,i)=>v!==String(i+min)))return false;}
 const group=root.document.createElement('div');group.className='ux-stepper';group.setAttribute('role','group');group.setAttribute('aria-label',labelFor(el));
 const minus=root.document.createElement('button'),plus=root.document.createElement('button'),value=root.document.createElement('input');
 for(const [button,symbol,word] of [[minus,'−','Kurangi'],[plus,'+','Tambah']]){
  button.type='button';button.className='ux-stepper-btn';button.textContent=symbol;
  button.setAttribute('aria-label',word+' '+labelFor(el));
 }
 value.className='ux-stepper-value';value.type='number';value.min=String(min);value.max=String(max);value.step='1';value.inputMode='numeric';value.setAttribute('aria-label',labelFor(el));
 const sync=()=>{const n=Number(el.value);value.value=String(Number.isFinite(n)?n:min);minus.disabled=!Number.isFinite(n)||n<=min||el.disabled;plus.disabled=!Number.isFinite(n)||n>=max||el.disabled;value.disabled=!!el.disabled};
 const put=raw=>{if(!Number.isFinite(raw))return sync();const n=Math.max(min,Math.min(max,Math.round(raw)));if(String(n)!==el.value){el.value=String(n);notify(el)}sync()};
 const set=delta=>{const n=Number(el.value);put((Number.isFinite(n)?n:min)+delta)};
 minus.addEventListener('click',()=>set(-1));plus.addEventListener('click',()=>set(1));value.addEventListener('change',()=>put(Number(value.value)));
 el.addEventListener('change',sync);el.addEventListener('input',sync);
 group.append(minus,value,plus);el.before(group);hideOriginal(el);sync();
 instances.set(el,{kind:'stepper',sync});return true;
}
function chips(id){
 const el=root.document.getElementById(id);
 if(!el||el.tagName!=='SELECT'||instances.has(el)||el.multiple)return false;
 const opts=[...el.options].filter(o=>!o.disabled);
 if(opts.length<2||opts.length>5)return false;
 const name=labelFor(el),group=root.document.createElement('div');group.className='ux-chip-group';
 group.setAttribute('role','radiogroup');group.setAttribute('aria-label',name);
 const buttons=opts.map((opt,index)=>{
  const button=root.document.createElement('button');button.type='button';button.className='ux-chip';button.textContent=opt.textContent.trim();
  button.setAttribute('role','radio');button.setAttribute('aria-label',name+': '+button.textContent);
  button.dataset.value=opt.value;
  const activate=()=>{if(el.value!==opt.value){el.value=opt.value;notify(el)}sync();};
  button.addEventListener('click',activate);
  button.addEventListener('keydown',event=>{
   const next=event.key==='ArrowRight'||event.key==='ArrowDown'?1:event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:0;
   if(!next)return;event.preventDefault();const target=buttons[(index+next+buttons.length)%buttons.length];target.click();target.focus();
  });
  return button;
 });
 const sync=()=>buttons.forEach(b=>{const chosen=b.dataset.value===el.value;b.setAttribute('aria-checked',String(chosen));b.tabIndex=chosen?0:-1;b.disabled=el.disabled});
 el.addEventListener('change',sync);el.addEventListener('input',sync);
 group.append(...buttons);el.before(group);hideOriginal(el);sync();
 instances.set(el,{kind:'chips',sync});return true;
}
function contact(id){
 const el=root.document.getElementById(id);if(!el)return false;
 el.type='tel';el.inputMode='tel';el.autocomplete='tel';el.maxLength=20;el.setAttribute('pattern','[0-9+\\- ]{9,20}');
 return true;
}
function messageForDates(config){
 const {start,end,output,mode}=config,one=root.document.getElementById(start),two=end&&root.document.getElementById(end);
 if(!one)return false;
 const label=root.document.createElement('small');label.className='ux-date-hint';label.setAttribute('aria-live','polite');
 const host=root.document.getElementById(output)||two?.closest('label')||one.closest('label')||one.parentElement;
 host.append(label);
 const refresh=()=>{if(mode==='visit'||mode==='trip'){label.textContent=mode==='visit'?'Satu hari kunjungan':'Tanggal mulai perjalanan';return}
  const days=mode==='lodging'?root.JTUXDates?.nightsBetween(one.value,two?.value):root.JTUXDates?.inclusiveDays(one.value,two?.value);
  label.textContent=days===null||days===undefined?'Pilih tanggal yang valid':mode==='rental'&&days>30?'Maksimum 30 hari':String(days)+(mode==='lodging'?' malam':' hari');
  if(two&&one.value&&mode==='lodging')two.min=root.JTUXDates.addDays(one.value,1)||'';
  if(two&&one.value&&mode==='rental')two.max=root.JTUXDates.addDays(one.value,29)||'';
 };
 one.addEventListener('change',refresh);two?.addEventListener('change',refresh);refresh();return true;
}
function init(){
 stepper('ibPeople',{min:1,max:20});stepper('packageGuests',{min:1,max:20});stepper('guests',{min:1,max:4});
 for(const id of ['ibNights','nights','v4Duration','v4Budget','exploreRentType','exploreRentDriver'])chips(id);
 for(const id of ['customerPhone','packagePhone','ibPhone'])contact(id);
 messageForDates({start:'exploreRentStart',end:'exploreRentEnd',mode:'rental'});
 messageForDates({start:'tripDate',mode:'trip'});
}
function sync(id){const el=root.document?.getElementById(id);const record=el&&instances.get(el);if(!record)return false;record.sync();return true}
const api=Object.freeze({stepper,chips,contact,messageForDates,sync,init});
root.JTUXControls=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
})(typeof window==='undefined'?globalThis:window);
