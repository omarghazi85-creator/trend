import {readBoundedJson} from '../../src/bounded-json.mts';
import {planCandidate,validateCandidate,wordpressPayload,type RemotePost} from '../../src/core.mts';
declare const Netlify:{env:{get(name:string):string|undefined}};
const ORIGIN='https://arabiatrend.com';
const MAX_ITEMS=3;
function authorized(request:Request):boolean {
  const secret=Netlify.env.get('ATN_WORKER_SECRET');
  return !!secret && secret.length>=24 && request.headers.get('x-atn-worker-secret')===secret;
}
async function requestWP(path:string,options:RequestInit):Promise<Response>{
  return fetch(ORIGIN+path,{...options,redirect:'error',signal:AbortSignal.timeout(8000)});
}
export default async function(request:Request):Promise<Response>{
  if(request.method!=='POST') return Response.json({error:'method_not_allowed'},{status:405});
  if(!authorized(request)) return Response.json({error:'unauthorized'},{status:401});
  if(Number(request.headers.get('content-length')||0)>120000) return Response.json({error:'payload_too_large'},{status:413});
  let body:unknown;
  try{body=await readBoundedJson(request,120000);}catch(error){
    const tooLarge=error instanceof Error&&error.message==='payload_too_large';
    return Response.json({error:tooLarge?'payload_too_large':'invalid_json'},{status:tooLarge?413:400});
  }
  if(!body||typeof body!=='object'||!('candidates' in body)) return Response.json({error:'missing_candidates'},{status:400});
  const items=(body as {candidates?:unknown}).candidates;
  if(!Array.isArray(items)||items.length<1||items.length>MAX_ITEMS)return Response.json({error:'invalid_batch'},{status:400});
  let candidates;
  try{candidates=items.map(validateCandidate);}catch(e){return Response.json({error:String(e)},{status:400});}
  if(new Set(candidates.map(c=>c.slug)).size!==candidates.length)return Response.json({error:'duplicate_slug_in_batch'},{status:400});
  const writeRequested=(body as {writeDrafts?:unknown}).writeDrafts===true;
  const writeEnabled=Netlify.env.get('WP_WRITE_ENABLED')==='true';
  const username=Netlify.env.get('WP_USERNAME');
  const password=Netlify.env.get('WP_APPLICATION_PASSWORD');
  if(writeRequested&&(!writeEnabled||!username||!password))return Response.json({error:'draft_write_not_configured'},{status:403});
  const auth=username&&password?'Basic '+btoa(username+':'+password):undefined;
  const results:Array<Record<string,unknown>>=[];
  for(const candidate of candidates){
    let found:RemotePost[]=[];
    try{
      const query=new URLSearchParams({slug:candidate.slug,per_page:'1',_fields:'id,slug,status'});
      // Authorized lookups must include drafts/pending/private posts. A published-only lookup
      // would miss an existing draft and create a duplicate on every retry.
      if(auth)query.set('status','any');
      const res=await requestWP('/wp-json/wp/v2/posts?'+query.toString(),{method:'GET',headers:auth?{authorization:auth}:{}});
      if(!res.ok)return Response.json({error:'wordpress_lookup_failed',status:res.status,results},{status:502});
      const lookup:unknown=await res.json();
      // An unexpected or partial lookup cannot prove absence of a post.
      // Fail closed instead of creating a draft alongside an editor's work.
      if(!Array.isArray(lookup)||lookup.length>1||
         !lookup.every(post=>post&&typeof post==='object'&&
          Number.isSafeInteger(post.id)&&post.id>0&&post.slug===candidate.slug&&
          typeof post.status==='string'&&post.status.trim().length>0))
       return Response.json({error:'wordpress_lookup_not_confirmed',results},{status:502});
      found=lookup as RemotePost[];
    }catch{return Response.json({error:'wordpress_unreachable',results},{status:502});}
    const plan=planCandidate(candidate,found);
    if(!writeRequested||plan.action==='skip_existing'){
      results.push({slug:candidate.slug,action:!writeRequested&&plan.action==='create_draft'?'preview_create_draft':plan.action,reason:plan.reason});
      continue;
    }
    try{
      const res=await requestWP('/wp-json/wp/v2/posts',{method:'POST',headers:{authorization:auth!,'content-type':'application/json'},body:JSON.stringify(wordpressPayload(candidate))});
      if(!res.ok)return Response.json({error:'wordpress_draft_failed',status:res.status,results},{status:502});
      const created=await res.json() as {id?:number;slug?:string;status?:string};
      // A WordPress success HTTP status does not prove the exact requested draft was created.
      if(!Number.isSafeInteger(created?.id)||(created.id as number)<=0||created.slug!==candidate.slug||created.status!=='draft')return Response.json({error:'wordpress_draft_not_confirmed',results},{status:502});
      results.push({slug:candidate.slug,action:'created_draft',id:created.id});
    }catch{return Response.json({error:'wordpress_draft_unreachable',results},{status:502});}
  }
  return Response.json({version:'0.1.0',writeRequested,results},{headers:{'cache-control':'no-store'}});
}