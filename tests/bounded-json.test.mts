import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedJsonStream} from '../src/bounded-json.mts';
const encode=(s:string)=>new TextEncoder().encode(s);

test('oversized streams reject promptly even if cancellation never settles or rejects', {timeout:1000}, async()=>{
 for(const cancel of [()=>new Promise<void>(()=>{}),()=>Promise.reject(new Error('upstream cancel failed'))]){
  for(const declared of [null,'1','100']){
   let cancellations=0;
   const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(encode('"السودان"'));},cancel(){cancellations++;return cancel();}});
   await assert.rejects(readBoundedJsonStream(body,declared,8),{message:'payload_too_large'});
   assert.equal(cancellations,1);
   assert.equal(body.locked,false);
  }
 }
});

test('valid multilingual JSON at the byte limit still parses, including split UTF-8',async()=>{
 for(const label of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر','Comores']){
  const bytes=encode(JSON.stringify({label}));
  const body=new ReadableStream<Uint8Array>({start(c){for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close();}});
  assert.deepEqual(await readBoundedJsonStream(body,String(bytes.length),bytes.length),{label});
  assert.equal(body.locked,false);
 }
});

test('copies reused chunks on receipt and tolerates empty chunks across buffer growth',async()=>{
 const expected={label:'السعودية مصر السودان الصومال جيبوتي جزر القمر Comores'.repeat(200)};
 const input=encode(JSON.stringify(expected));
 const reused=new Uint8Array(1);let offset=0,empty=true;
 const body=new ReadableStream<Uint8Array>({pull(c){
  if(offset===input.length){c.close();return;}
  if(empty){empty=false;c.enqueue(new Uint8Array(0));return;}
  empty=true;reused[0]=input[offset++];c.enqueue(reused);
 }},{highWaterMark:0});
 assert.deepEqual(await readBoundedJsonStream(body,null,input.length),expected);
 assert.equal(body.locked,false);
});

test('rejects an extra byte after growing to the exact limit',async()=>{
 let cancellations=0;
 const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(4096));c.enqueue(new Uint8Array(1));},cancel(){cancellations++;}});
 await assert.rejects(readBoundedJsonStream(body,null,4096),{message:'payload_too_large'});
 assert.equal(cancellations,1);
 assert.equal(body.locked,false);
});
