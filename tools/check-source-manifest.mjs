import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const m=JSON.parse(readFileSync(path.join(root,'docs/interop-source-manifest.json'),'utf8'));
for(const [name,expected] of Object.entries(m.gitBlobSha1)){
 const b=readFileSync(path.join(root,name));const hash=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 if(hash!==expected)throw Error('Canonical source mismatch: '+name);
}
console.log(Object.keys(m.gitBlobSha1).length+' canonical ZIP files match');
