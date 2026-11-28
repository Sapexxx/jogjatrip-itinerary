import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const r=new URL('../web/',import.meta.url),get=s=>readFileSync(new URL(s,r),'utf8');
test('all native confirms replaced by accessible async dialog',()=>{
 for(const file of ['app.js','integrated.js','v4.js']){assert.doesNotMatch(get(file),/(^|[^\w.])confirm\(/);}
 const source=get('ux-dialog.js');assert.match(source,/showModal\(\)/);assert.match(source,/addEventListener\('cancel'/);assert.match(source,/prior\?\.focus/);
});
test('checkout credential presentation does not change its state machine',()=>{
 const s=get('interop-checkout.js');
 assert.match(s,/Kode rahasia pesanan/);
 assert.match(s,/downloadToken/);
 assert.match(s,/root\.URL\.revokeObjectURL/);
 assert.match(s,/prep\.consent\.checked=false/);
 assert.match(s,/prep\.price\.checked=false/);
 assert.match(s,/!preparationEnabled\|\|prep\.busy/);
 assert.match(get('cloudflare-status.js'),/bookingEnabled!==false/);
});
