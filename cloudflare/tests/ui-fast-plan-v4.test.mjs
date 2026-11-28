import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../web/'+p,import.meta.url),'utf8');
test('builder quick schedule uses native submit validation with explicit planning disclaimer',()=>{
 const s=read('integrated.js');
 assert.match(s,/data-suggested-time/);
 assert.match(s,/form\.requestSubmit\(\)/);
 assert.match(s,/Jam contoh hanya untuk agenda pribadi/);
 assert.match(s,/form\.onsubmit=e=>/);
});
test('package bulk-fill and catalog quick-add retain review and cart flows',()=>{
 const p=read('v4.js'),c=read('app.js');
 assert.match(p,/id="v4QuickFillTimes"/);
 assert.match(p,/v4OpenCandidate\(p,false\)/);
 assert.match(p,/v4El\('v4ToPlan'\)\.onclick=.+v4SelectCandidate/);
 assert.match(c,/id="addItemSuggested"/);
 assert.match(c,/\$\('#addItem'\)\.click\(\)/);
 assert.match(c,/if\(!jtValidTimes\(start,end\)\)/);
 assert.doesNotMatch(p,/\/api\/book|\/api\/hold|\/api\/confirm/);
});
