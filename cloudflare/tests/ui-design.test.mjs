import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../web/'+p,import.meta.url),'utf8');
test('design system uses local modules and declared color tokens',()=>{
 const entry=read('style.css');
 const files=[...entry.matchAll(/@import url\("\.\/([^"]+)"\);/g)].map(m=>m[1]);
 assert.equal(files.length,7);
 const css=files.map(read).join('\n'),tokens=read('tokens.css');
 assert.equal((css.match(/#[0-9a-f]{3,8}\b/gi)||[]).length,0);
 const declared=new Set([...tokens.matchAll(/--([\w-]+)\s*:/g)].map(m=>m[1]));
 for(const m of css.matchAll(/var\(--([\w-]+)\)/g))assert.ok(declared.has(m[1]),m[1]);
 const breakpoints=new Set([...css.matchAll(/@media\s*\(max-width:(\d+)px\)/g)].map(m=>Number(m[1])));
 assert.deepEqual([...breakpoints].sort((a,b)=>a-b),[600,800,1100]);
});
test('accessible local icon sprite and transport controls retain DOM contracts',()=>{
 const h=read('index.html'),icons=read('icons.svg');
 assert.match(h,/Itinerary Jogja/);
 assert.match(h,/id="openTransportPlanner" data-v4-service="transport"/);
 assert.match(h,/id="closeDialog"[^>]*aria-label="Tutup dialog"/);
 for(const m of h.matchAll(/href="\/icons\.svg#([^"]+)"/g))assert.ok(icons.includes('id="'+m[1]+'"'));
 assert.doesNotMatch(h,/[⌂✧↝↗⚑✕↻↓✓]/);
});

test('responsive layout overrides follow page and component styles',()=>{
 const entry=read('style.css');
 assert.ok(entry.indexOf('./layout.css')>entry.indexOf('./components.css'));
 assert.ok(entry.indexOf('./layout.css')>entry.indexOf('./pages/explore.css'));
 assert.match(read('layout.css'),/@media\(max-width:800px\).*?\.layout\{grid-template-columns:minmax\(0,1fr\)/s);
 assert.match(read('components.css'),/grid-template-columns:minmax\(0,1.5fr\) minmax\(0,1fr\)/);
});
