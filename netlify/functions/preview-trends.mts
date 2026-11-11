import {makeTrendSnapshot,snapshotDigest,needsUpdate,type TrendRecord} from '../../src/trends.mts';
declare const Netlify:{env:{get(name:string):string|undefined}};
/** Authorized, read-free, write-free shadow processor for at most 200 trend observations per request. */
export default async function(request:Request):Promise<Response>{
 if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
 const secret=Netlify.env.get('ATN_WORKER_SECRET');
 if(!secret||secret.length<24||request.headers.get('x-atn-worker-secret')!==secret)return Response.json({error:'unauthorized'},{status:401});
 if(Number(request.headers.get('content-length')||0)>100000)return Response.json({error:'payload_too_large'},{status:413});
 let text:string;
 try{text=await request.text();}catch{return Response.json({error:'bad_request'},{status:400});}
 if(text.length>100000)return Response.json({error:'payload_too_large'},{status:413});
 let body:unknown;
 try{body=JSON.parse(text);}catch{return Response.json({error:'invalid_json'},{status:400});}
 if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'invalid_body'},{status:400});
 const input=body as Record<string,unknown>;
 if(typeof input.country!=='string'||typeof input.day!=='string'||!Array.isArray(input.rows)||input.rows.length>200)return Response.json({error:'invalid_batch'},{status:400});
 if(input.previousDigest!==undefined&&(typeof input.previousDigest!=='string'||!/^[0-9a-f]{64}$/.test(input.previousDigest)))return Response.json({error:'invalid_digest'},{status:400});
 let snapshot;
 try{snapshot=makeTrendSnapshot(input.country,input.day,input.rows as TrendRecord[]);}catch{return Response.json({error:'invalid_snapshot'},{status:400});}
 const digest=await snapshotDigest(snapshot);
 return Response.json({service:'arabiatrend-worker',mode:'shadow',country:snapshot.country,day:snapshot.day,digest,changed:needsUpdate((input.previousDigest as string|undefined)??null,digest),termCount:snapshot.terms.length,terms:snapshot.terms},{headers:{'cache-control':'no-store'}});
}