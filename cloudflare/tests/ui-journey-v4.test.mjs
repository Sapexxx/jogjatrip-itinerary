import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const r=new URL('../web/',import.meta.url);
const get=path=>readFileSync(new URL(path,r),'utf8');
test('journey display links only to the existing routes',()=>{
 const h=get('index.html'),js=get('journey-ux.js');
 for(const route of ['#/beranda','#/paket','#/pilihan','#/itinerary','#/pesanan'])assert.ok(h.includes('href="'+route+'"'));
 assert.match(h,/data-ux-step="setujui"/);
 assert.doesNotMatch(js,/fetch\(|POST|bookingEnabled\s*=|location\.search/);
 assert.ok(h.indexOf('src="/journey-ux.js"')<h.indexOf('src="/integrated.js"'));
});
