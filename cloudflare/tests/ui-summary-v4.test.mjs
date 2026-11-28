import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const src=readFileSync(new URL('../web/ux-summary.js',import.meta.url),'utf8');
test('summary is read only and uses server-priced quotes only',()=>{
 const context={};vm.runInNewContext(src,context);const d=context.JTUXSummary.describe;
 assert.match(d({items:[{type:'hotel'}],quote:null}),/belum diverifikasi/i);
 assert.match(d({items:[{type:'hotel'}],quote:{total:105000,available:true}}),/105.000/);
 assert.doesNotMatch(d({items:[{type:'hotel'}],quote:{total:105000,available:false}}),/105.000/);
 assert.doesNotMatch(src,/fetch\(|POST|localStorage|sessionStorage/);
});
