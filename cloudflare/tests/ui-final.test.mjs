import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../web/'+p,import.meta.url),'utf8');
const js=['app.js','v2.js','packages.js','v4.js','integrated.js','orders.js'];
test('single-element selectors never iterate collections',()=>{
 for(const file of js)assert.doesNotMatch(read(file),/(?<!\$)\$\([^)\n]+\)\.forEach\s*\(/,file);
});
test('all authored images declare dimensions and alternative text',()=>{
 for(const file of ['index.html',...js])for(const image of read(file).matchAll(/<img\b[^>]*>/g)){
  for(const key of ['width','height','alt'])assert.match(image[0],new RegExp('\\b'+key+'='),file+' '+key);
 }
});
test('hero preload, accessible dialogs and private lookup token',()=>{
 const h=read('index.html');assert.match(h,/rel="preload" as="image" href="\/images\/prambanan.jpg"/);assert.match(h,/id="lookupToken" type="password"/);
 assert.match(read('integrated.js'),/aria-label','Atur jadwal kegiatan'/);
 assert.match(read('cloudflare-status.js'),/health.bookingEnabled !== false/);
});

test('initial deep link is resolved before first paint and released by router',()=>{assert.match(read('index.html'),/<script src="\/route-bootstrap\.js"><\/script><\/head>/);assert.match(read('route-bootstrap.js'),/dataset.initialPage=page/);assert.match(read('app.js'),/removeAttribute\?\.\('data-initial-page'\)/);assert.match(read('layout.css'),/html\[data-initial-page="packages"\] #packages/);assert.match(read('index.html'),/display=optional/)});

test('builder has a static first-paint structure and semantic page headings',()=>{const h=read('index.html');for(const id of ['ibDate','ibNights','ibHotelOptions','ibDays','ibSave','ibQuote','ibBook','ibTicket'])assert.ok(h.includes('id="'+id+'"'),id);assert.match(h,/<h2>Periksa kode pesanan<\/h2>/);assert.match(h,/<h2>Rencana perjalanan<\/h2>/);assert.doesNotMatch(read('integrated.js'),/box\.innerHTML=`<div class="ib-intro"/)});

test('empty cart and history render identically before and after initialization',()=>{const h=read('index.html');for(const [id,file] of [['cartItems','app.js'],['orderList','orders.js']]){const empty=h.match(new RegExp('id="'+id+'"[^>]*>(<div class="empty">[\\s\\S]*?<\\/div>)'));assert.ok(empty,id);assert.ok(read(file).includes(empty[1]),id)}assert.match(read('app.js'),/cartNode\.innerHTML!==cartMarkup/);assert.match(read('orders.js'),/el\.innerHTML!==historyMarkup/)});

import {webcrypto} from 'node:crypto';
await import('../web/interop-checkout.js');
test('I5: safe browser-only draft and stable checkout key',async()=>{
 const values=new Map(),store={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const make=globalThis.JTInteropI5.createDraftManager,quote={total:10000,available:true,items:[{amount:10000}]};
 const input={scope:'cart',items:[{type:'transport',vehicleId:'R-01'}],quote};
 const a=await make(store,webcrypto).prepare(input),b=await make(store,webcrypto).prepare(input);
 assert.equal(a.key,b.key);assert.equal(b.reused,true);
 assert.equal(typeof make(store,webcrypto).transition,'undefined');
 assert.doesNotMatch([...values.values()].join(''),/R-01|partnerToken/);
 assert.notEqual(a.key,(await make(store,webcrypto).prepare({...input,quote:{...quote,total:11000}})).key);
 assert.match(globalThis.JTInteropI5.inspect({...input,quote:null}),/Periksa harga/);
});
test('I5: script mounted safely, production booking flag remains off',()=>{
 const h=read('index.html'),source=read('interop-checkout.js');
 assert.match(h,/<script src="\/interop-checkout\.js" defer><\/script>/);
 assert.match(read('app.js'),/JTInteropI5Cart/);
 assert.match(read('integrated.js'),/JTInteropI5Plan/);
 assert.match(source,/root\.fetch\('\/api\/interop\/checkouts\//);
 assert.match(source,/method:'GET'/);
 assert.match(source,/cache:'no-store'/);
 assert.match(source,/X-Interop-Token/);
 assert.doesNotMatch(source,/\/api\/book|X-Order-Token|\/confirm|\/release/);
 assert.match(source,/\/api\/interop\/itineraries\//);
 assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"BOOKING_ENABLED"\s*:\s*"false"/);
});

test('I5 consent: no request until explicit consent and exact total; prepare-only request contains no provider credential',async()=>{
 const values=new Map(),store={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const m=globalThis.JTInteropI5.createDraftManager(store,webcrypto);
 const input={scope:'plan:TEST-1',items:[{type:'transport',vehicleId:'R-01'}],quote:{total:10000,available:true,items:[{amount:10000}]}};
 const approval={consent:true,priceAccepted:true,approvedTotal:10000,planToken:'a'.repeat(48),customer:{name:'Synthetic User',phone:'081234567890',email:'test@example.test'}};
 const calls=[];let token;
 const fetcher=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({orderId:'JT-'+'a'.repeat(32),created:true,bookingPerformed:false,state:'NOT_STARTED'}),{status:201})};
 for(const patch of [{consent:false},{priceAccepted:false},{approvedTotal:9000},{planToken:''},{customer:{name:'X',phone:'1'}}])await assert.rejects(m.prepareServer(input,{...approval,...patch},fetcher));
 assert.equal(calls.length,0);
 const result=await m.prepareServer(input,approval,fetcher,t=>token=t);assert.equal(result.bookingPerformed,false);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/interop/itineraries/TEST-1/prepare');
 const body=JSON.parse(calls[0].init.body);assert.equal(body.consent,true);assert.equal(body.approvedTotal,10000);assert.equal(body.accessToken,token);assert.deepEqual(body.approvedItems,input.items);assert.match(token,/^[a-f0-9]{64}$/);
 assert.doesNotMatch([...values.values()].join(''),/Synthetic User|081234567890|test@example.test|R-01/);assert.ok(![...values.values()].join('').includes(token));
 assert.equal(m.get(input.scope).state,'PREPARED');await assert.rejects(m.prepareServer(input,approval,fetcher),/CHECKOUT_STATE_LOCKED/);assert.equal(calls.length,1);
});
test('I5 consent: lost response locks preparation across reload with no automatic retry',async()=>{
 const values=new Map(),store={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const make=globalThis.JTInteropI5.createDraftManager;
 const input={scope:'plan:TEST-2',items:[{type:'transport',vehicleId:'R-01'}],quote:{total:10000,available:true,items:[{amount:10000}]}};
 const approval={consent:true,priceAccepted:true,approvedTotal:10000,planToken:'a'.repeat(48),customer:{name:'Synthetic User',phone:'081234567890',email:'test@example.test'}};
 let calls=0;const fetcher=async()=>{calls++;throw Error('lost reply')};
 await assert.rejects(make(store,webcrypto).prepareServer(input,approval,fetcher));
 assert.equal(make(store,webcrypto).get(input.scope).state,'UNKNOWN');
 await assert.rejects(make(store,webcrypto).prepareServer(input,approval,fetcher),/CHECKOUT_STATE_LOCKED/);assert.equal(calls,1);
});

test('I5 token recovery: original key and separately saved token recover lost prepare reply by GET only',async()=>{
 const values=new Map(),store={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const make=globalThis.JTInteropI5.createDraftManager,m=make(store,webcrypto),token=m.createToken();
 const input={scope:'plan:RECOVERY-1',items:[{type:'transport',vehicleId:'R-01'}],quote:{total:10000,available:true,items:[{amount:10000}]}};
 const approval={consent:true,priceAccepted:true,approvedTotal:10000,planToken:'a'.repeat(48),accessToken:token,customer:{name:'Synthetic User',phone:'081234567890',email:'test@example.test'}};
 let key;await assert.rejects(m.prepareServer(input,approval,async(url,init)=>{const b=JSON.parse(init.body);key=b.key;assert.equal(b.accessToken,token);throw Error('lost reply')}));
 const reloaded=make(store,webcrypto),id='JT-'+'c'.repeat(32);
 assert.equal(reloaded.get(input.scope).state,'UNKNOWN');let calls=0;
 const data=await reloaded.recoverServer(input.scope,approval.planToken,token,async(url,init)=>{calls++;assert.equal(url,'/api/interop/itineraries/RECOVERY-1/prepare');assert.equal(init.method,'GET');assert.equal(init.headers['X-Checkout-Key'],key);assert.equal(init.headers['X-Interop-Token'],token);assert.equal(init.body,undefined);return new Response(JSON.stringify({orderId:id,status:'NOT_STARTED',verifiedBy:'D1_JOURNAL',paymentVerified:false,bookingsAtomic:false}))});
 assert.equal(data.orderId,id);assert.equal(reloaded.get(input.scope).state,'PREPARED');assert.equal(calls,1);assert.ok(![...values.values()].join('').includes(token));
 await assert.rejects(reloaded.prepareServer(input,approval,()=>{throw Error('no POST')}),/CHECKOUT_STATE_LOCKED/);
});
