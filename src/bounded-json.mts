/** Bound JSON streams by UTF-8 bytes before parsing or allocating strings.
 * Shared by authenticated preview requests and the read-only archive transport.
 */
export async function readBoundedJsonStream(body:ReadableStream<Uint8Array>|null,declared:string|null,maxBytes:number):Promise<unknown>{
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes)){
  // Request cancellation but never wait for an uncooperative upstream.
  if(body)void body.cancel('payload_too_large').catch(()=>{});
  throw new Error('payload_too_large');
 }
 if(!body)throw new Error('invalid_json');
 const reader=body.getReader();
 // Store bytes immediately in a geometrically growing buffer rather than
 // retaining a separate allocation/view for every upstream chunk. Empty
 // chunks do not consume storage; capacity never exceeds the byte limit.
 let bytes=new Uint8Array(0);
 let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!value||value.byteLength===0)continue;
   const nextSize=size+value.byteLength;
   if(nextSize>maxBytes){
    // Cancellation may reject or remain pending; preserve the size-limit error.
    void reader.cancel('payload_too_large').catch(()=>{});
    throw new Error('payload_too_large');
   }
   if(nextSize>bytes.length){
    const grown=new Uint8Array(Math.min(maxBytes,Math.max(4096,bytes.length*2,nextSize)));
    grown.set(bytes.subarray(0,size));
    bytes=grown;
   }
   bytes.set(value,size);
   size=nextSize;
  }
 }finally{reader.releaseLock();}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));}
 catch{throw new Error('invalid_json');}
}

/** Preserve the existing authenticated preview-request API. */
export async function readBoundedJson(request:Request,maxBytes:number):Promise<unknown>{
 return readBoundedJsonStream(request.body,request.headers.get('content-length'),maxBytes);
}
