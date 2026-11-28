import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../web/ux-status.js',import.meta.url),'utf8');
const ctx={};vm.runInNewContext(src,ctx);
test('reservation and payment are distinct',()=>{
 assert.equal(ctx.JTUXStatus.reservation('reserved'),'Terkonfirmasi');
 assert.equal(ctx.JTUXStatus.payment('unpaid'),'Belum dibayar (simulasi)');
 assert.match(ctx.JTUXStatus.item({provider:'wisata',reservationState:'reserved',paymentState:'unpaid'}),/belum dibayar/i);
 assert.doesNotMatch(ctx.JTUXStatus.item({provider:'hotel',reservationState:'reserved'}),/Dibayar \(simulasi\)/);
});
test('missing states do not invent a voucher, release or payment',()=>{
 assert.match(ctx.JTUXStatus.item({provider:'hotel'}),/belum diketahui/);
 assert.match(ctx.JTUXStatus.journal('UNKNOWN'),/jangan checkout ulang/);
 assert.doesNotMatch(src,/fetch\(|POST|localStorage|sessionStorage/);
});
