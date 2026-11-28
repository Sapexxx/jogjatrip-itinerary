import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('CSS remains palette-tokenized',()=>{
 const output=execFileSync(process.execPath,[new URL('../tools/check-tokens.mjs',import.meta.url).pathname],{encoding:'utf8'});
 assert.match(output,/token check passed/);
});
