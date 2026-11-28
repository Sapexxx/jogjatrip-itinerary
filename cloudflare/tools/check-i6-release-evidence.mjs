/** Review aid for Contract 0.2 final ZIP staging evidence.
 * Reads a local evidence snapshot only. It does NOT contact providers, verify
 * signatures or attest that a remote deployment is safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const file=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'../docs/i6-release-evidence.json');
const fail=reason=>{console.error('I6 NO-GO: '+reason);process.exitCode=1};
let data;
try{data=JSON.parse(fs.readFileSync(file,'utf8'))}
catch{fail('Evidence manifest missing or invalid');process.exit()}
if(data.schemaVersion!==1||data.contract!=='0.2.0')fail('Contract evidence version does not match');
const providers=['hotel','wisata','transport'];
for(const name of providers){
 const p=data.providerEvidence?.[name];
 if(!p||!p.mainSha||p.liveReadOnlyValidatedByThisPR!==true||p.durableStorageValidatedByThisPR!==true||!p.stagingContractRun)
  fail(name+': no verified authenticated staging capability + durable storage evidence');
}
if(data.providerEvidence?.wisata?.transactionAtomicityProven!==true||data.providerEvidence?.wisata?.remoteFallbackSafetyProven!==true)
 fail('wisata: remote atomicity and fail-closed fallback not independently verified');
for(const name of ['approvedContractVersionAndSha','approvedHandoffProducerExamples','authenticatedStagingAllThree','officialContractCheckerAllThree','wisataRemoteTransactionalW2','e8AndE9RealStagingPassed','paymentAndOperatorPolicyReviewed']){
 if(data.required?.[name]!==true)fail(name+' not verified');
}
if(data.status!=='GO')fail('Manifest decision is BLOCKED or unspecified');
if(!process.exitCode){
 console.log('I6 evidence checklist is complete ON PAPER only; independent reviewer must corroborate source URLs, authorized tests and service state before deploying.');
}
