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
