import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const root=new URL('../web/',import.meta.url);
const dateSource=readFileSync(new URL('date-utils.js',root),'utf8');
function dates(){const ctx={};vm.runInNewContext(dateSource,ctx);return ctx.JTUXDates}
test('calendar dates use UTC and reject invalid dates',()=>{
 const d=dates();
 assert.equal(d.nightsBetween('2026-12-01','2026-12-04'),3);
 assert.equal(d.inclusiveDays('2026-12-01','2026-12-04'),4);
 assert.equal(d.addDays('2026-12-31',1),'2027-01-01');
 assert.equal(d.nightsBetween('2026-02-30','2026-03-01'),null);
 assert.equal(d.nightsBetween('2026-12-04','2026-12-01'),null);
 assert.equal(d.rentalValid('2026-12-01','2026-12-30'),true);
 assert.equal(d.rentalValid('2026-12-01','2026-12-31'),false);
});
test('progressive control scripts preserve classic loading order and native values',()=>{
 const html=readFileSync(new URL('index.html',root),'utf8');
 const source=readFileSync(new URL('controls.js',root),'utf8');
 assert.ok(html.indexOf('src="/controls.js"')<html.indexOf('src="/integrated.js"'));
 assert.match(html,/id="ibNights"><option value="1">/);
 assert.match(html,/value="2" selected>3 hari/);
 assert.match(source,/el\.dispatchEvent\(new Event\('change'/);
 assert.match(source,/stepper\('ibPeople'/);
 assert.match(source,/['"]ibNights['"]/);
 assert.match(source,/chips\(id\)/);
 assert.doesNotMatch(source,/import\s+/);
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|bookingEnabled\s*=/);
});

test('legacy prefill calls explicit display sync for enhanced controls',()=>{
 const integrated=readFileSync(new URL('integrated.js',root),'utf8'),app=readFileSync(new URL('app.js',root),'utf8');
 assert.match(integrated,/JTUXControls\?\.sync\('ibPeople'\)/);
 assert.match(integrated,/JTUXControls\?\.sync\('ibNights'\)/);
 assert.match(app,/JTUXControls\?\.sync\('exploreRentDriver'\)/);
});

test('guest counts use a consistent editable stepper, unlike sparse hotel nights',()=>{
 const s=readFileSync(new URL('controls.js',root),'utf8');
 assert.match(s,/stepper\('guests',\{min:1,max:4\}\)/);
 assert.match(s,/stepper\('ibPeople',\{min:1,max:20\}\)/);
 assert.match(s,/value\.addEventListener\('change',\(\)=>put\(Number\(value\.value\)\)\)/);
 assert.doesNotMatch(s,/stepper\('ibNights'/);
});

test('rental dependency switches keep displayed controls synchronized',()=>{
 const source=readFileSync(new URL('app.js',root),'utf8');
 assert.match(source,/JTUXControls\?\.sync\('exploreRentType'\)/);
 assert.match(source,/JTUXControls\?\.sync\('exploreRentDriver'\)/);
 const controls=readFileSync(new URL('controls.js',root),'utf8');
 assert.match(controls,/if\(id==='ibPhone'\)/);
});
