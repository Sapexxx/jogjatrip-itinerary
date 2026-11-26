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
 assert.doesNotMatch(source,/method:'POST'|\/api\/book|X-Order-Token/);
 assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"BOOKING_ENABLED"\s*:\s*"false"/);
});
