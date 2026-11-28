import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const tool=path.join(root,'tools/check-i6-release-evidence.mjs');
const evidence=path.join(root,'docs/i6-release-evidence.json');
const run=file=>spawnSync(process.execPath,[tool,...(file?[file]:[])],{encoding:'utf8',timeout:10000});
test('I6 release: source-pinned current snapshot is NO-GO while Wisata W2 remains unverified',()=>{
 const data=JSON.parse(readFileSync(evidence,'utf8'));
 assert.equal(data.contract,'0.2.0');assert.equal(data.status,'BLOCKED');
 assert.equal(data.providerEvidence.wisata.transactionAtomicityProven,false);
 assert.equal(data.required.e8AndE9RealStagingPassed,false);
 const result=run();assert.equal(result.status,1);
 assert.match(result.stderr,/I6 NO-GO: wisata/);
 assert.match(result.stderr,/I6 NO-GO: e8AndE9RealStagingPassed/);
});
test('I6 release: missing/unparseable evidence is fail-closed',()=>{
 const missing=run('/file-that-does-not-exist-i6-evidence.json');
 assert.equal(missing.status,1);
 assert.match(missing.stderr,/Evidence manifest missing or invalid/);
});
test('I6 release: a forged global GO cannot override missing provider proofs',()=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'i6-evidence-'));
 try{
  const data=JSON.parse(readFileSync(evidence,'utf8'));
  data.status='GO';
  data.required=Object.fromEntries(Object.keys(data.required).map(key=>[key,true]));
  const input=path.join(tmp,'evidence.json');
  writeFileSync(input,JSON.stringify(data));
  const result=run(input);
  assert.equal(result.status,1);
  assert.match(result.stderr,/I6 NO-GO: wisata/);
 }finally{rmSync(tmp,{recursive:true,force:true})}
});
test('I6 release: readiness checklist does not enable booking or execute provider mutations',()=>{
 const config=readFileSync(path.join(root,'wrangler.jsonc'),'utf8');
 const source=readFileSync(tool,'utf8');
 assert.match(config,/"BOOKING_ENABLED"\s*:\s*"false"/);
 assert.doesNotMatch(source,/\bfetch\s*\(|method\s*:\s*['"]POST['"]/);
});
