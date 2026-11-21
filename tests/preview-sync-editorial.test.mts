import test from 'node:test';
import assert from 'node:assert/strict';
import previewSync from '../netlify/functions/preview-sync.mts';

test('unacceptable trend candidate never reaches a WordPress read or draft write',async()=>{
  const prevNetlify=(globalThis as any).Netlify;
  const prevFetch=globalThis.fetch;
  const secret='test-secret-12345678901234567890';
  let requests=0;
  (globalThis as any).Netlify={env:{get:(key:string)=>({
    ATN_WORKER_SECRET:secret,
    WP_WRITE_ENABLED:'true',
    WP_USERNAME:'fake-test-user',
    WP_APPLICATION_PASSWORD:'fake-test-password'
  } as Record<string,string>)[key]}};
  globalThis.fetch=async()=>{requests++;throw new Error('unexpected_network_call');};
  try{
    const candidate={title:'عنوان خبر يتناول آمارنا ميلر',slug:'editorial-block-test',content:'<p>'+'خبر عربي موثق '.repeat(55)+'</p>'};
    const request=new Request('https://example.net/.netlify/functions/preview-sync',{
      method:'POST',headers:{'x-atn-worker-secret':secret,'content-type':'application/json'},
      body:JSON.stringify({writeDrafts:true,candidates:[candidate]})
    });
    const response=await previewSync(request);
    assert.equal(response.status,400);
    assert.match(JSON.stringify(await response.json()),/editorial_title_blocked/);
    assert.equal(requests,0);
  }finally{
    globalThis.fetch=prevFetch;
    (globalThis as any).Netlify=prevNetlify;
  }
});
