/** Opt-in, read-only Contract 0.2 staging verifier.
 * Never defaults to a production origin; no POST, secrets in URL, D1 or mutation.
 * This CLI is a *live evidence tool*, not proof of deployment on its own.
 */
import {createInteropClient} from '../src/interop.ts';
const env=process.env;
const allowed=new Set((env.INTEROP_STAGING_ALLOW_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
const providers=(env.INTEROP_STAGING_PROVIDERS||'').split(',').map(x=>x.trim()).filter(Boolean);
const providerSet=new Set(['hotel','wisata','transport']);
const safeOrigin=url=>{
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('STAGING_ORIGIN_INVALID');
 return parsed.origin;
};
const fail=message=>{console.error('BLOCKED '+message);process.exitCode=1;};
if(env.INTEROP_STAGING_READONLY_ACK!=='APPROVED_SANDBOX_ONLY')fail('Explicit staging read-only approval missing');
else if(!providers.length||providers.length>3||new Set(providers).size!==providers.length||providers.some(p=>!providerSet.has(p)))fail('Choose unique provider names using INTEROP_STAGING_PROVIDERS');
else if(!allowed.size)fail('No explicit staging origin allowlist');
else {
 let origins;
 try{origins=new Set([...allowed].map(safeOrigin))}catch{origins=null;fail('Staging allowlist contains an invalid HTTPS origin')}
 if(origins){
  const start=env.INTEROP_STAGING_START_DATE,end=env.INTEROP_STAGING_END_DATE;
  const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  if(!validDate(start)||!validDate(end)||end<=start)fail('Valid future start/end dates are required for read-only offers');
  else for(const provider of providers){
   const prefix='INTEROP_STAGING_'+provider.toUpperCase();
   const baseUrl=env[prefix+'_URL'],token=env[prefix+'_TOKEN'];
   let origin;
   try{origin=safeOrigin(baseUrl)}catch{fail(provider+': HTTPS URL missing or malformed');continue}
   if(!origins.has(origin)){fail(provider+': URL is not on staging allowlist');continue}
   if(typeof token!=='string'||token.length<24){fail(provider+': partner token missing');continue}
   const getOnly=async(url,init)=>{
    const target=new URL(url);
    if(init.method!=='GET'||target.origin!==origin||
       !['/api/v1/interop/capabilities','/api/v1/interop/offers'].includes(target.pathname))
     throw Error('READ_ONLY_ROUTE_DENIED');
    return fetch(url,{...init,redirect:'error'});
   };
   try{
    const client=createInteropClient({provider,baseUrl:origin,token,fetcher:getOnly,capabilitiesTimeoutMs:4000,timeoutMs:10000});
    const capabilities=await client.capabilities();
    if(!capabilities.holds||!capabilities.durableStorage)throw Error('CAPABILITY_NOT_READY');
    const query=provider==='wisata'?{startDate:start,quantity:1,limit:20}:{startDate:start,endDate:end,quantity:1,limit:20};
    const offers=await client.offers(query);
    console.log('PASS '+provider+' 0.2 capabilities + canonical offers; offers parsed='+offers.offers.length+'; no mutation');
   }catch(e){fail(provider+': '+(typeof e?.code==='string'?e.code:'READ_ONLY_CHECK_FAILED'))}
  }
 }
}
