/** Bound JSON streams by UTF-8 bytes before parsing or allocating strings.
 * Shared by authenticated preview requests and the read-only archive transport.
 */
export async function readBoundedJsonStream(body:ReadableStream<Uint8Array>|null,declared:string|null,maxBytes:number):Promise<unknown>{
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))throw new Error('payload_too_large');
 if(!body)throw new Error('invalid_json');
 const reader=body.getReader();
 const chunks:Uint8Array[]=[];
 let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!value)continue;
   size+=value.byteLength;
   if(size>maxBytes){
    await reader.cancel('payload_too_large');
    throw new Error('payload_too_large');
   }
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);
 let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw new Error('invalid_json');}
}

/** Preserve the existing authenticated preview-request API. */
export async function readBoundedJson(request:Request,maxBytes:number):Promise<unknown>{
 return readBoundedJsonStream(request.body,request.headers.get('content-length'),maxBytes);
}
