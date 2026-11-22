/** Bound JSON request bodies by UTF-8 bytes before parsing or allocating strings.
 * Applies to authenticated preview endpoints only; never fetches WordPress.
 */
export async function readBoundedJson(request:Request,maxBytes:number):Promise<unknown>{
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))throw new Error('payload_too_large');
 if(!request.body)throw new Error('invalid_json');
 const reader=request.body.getReader();
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
