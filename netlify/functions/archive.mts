/** 
 * WordPress.com public Jetpack API is the canonical read-only archive transport.
 * This deliberately avoids requesting arabiatrend.com through its bot protection.
 * One bounded request; no WordPress writes, cron jobs or credentials.
 */
import {decodeHtmlEntities,isEditorialTrendAllowed} from '../../src/trend-policy.mts';
import {readBoundedJsonStream} from '../../src/bounded-json.mts';
const ORIGIN='https://arabiatrend.com';
const API='https://public-api.wordpress.com/rest/v1.1/sites/250183068/posts/';
const ARCHIVE_PARENT_ID=61269;
const PAGE_SIZE=100;
const MAX_PAGE=10;
// Bound untrusted upstream JSON even when Content-Length is absent or understated.
// This does not change the number of WordPress requests or fetch individual pages.
const MAX_UPSTREAM_JSON_BYTES=8_000_000;
const COUNTRY:Record<string,string>={
 sa:'السعودية',ae:'الإمارات',eg:'مصر',kw:'الكويت',qa:'قطر',bh:'البحرين',
 om:'عُمان',jo:'الأردن',lb:'لبنان',iq:'العراق',sy:'سوريا',ps:'فلسطين',
 ye:'اليمن',ly:'ليبيا',tn:'تونس',dz:'الجزائر',ma:'المغرب',mr:'موريتانيا',
 sd:'السودان',so:'الصومال',dj:'جيبوتي',km:'جزر القمر'
};
const KINDS=new Set(['search','music','week']);
type PublicPage={title?:unknown;content?:unknown;excerpt?:unknown;URL?:unknown;slug?:unknown;date?:unknown;status?:unknown;parent?:{ID?:unknown}|false;};
/** Keep title navigation on the verified internal WordPress archive path. */
function canonicalArchiveUrl(value:string,slug:string):boolean{
 // A WordPress archive slug is one path segment, never a nested route.
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return false;
 // Compare the original string, not URL's normalized pathname: the latter
 // accepts dot segments, backslashes and invisible controls. Keep both
 // existing canonical permalink forms unchanged.
 const expected=ORIGIN+'/trend-archive/'+slug;
 return value===expected||value===expected+'/';
}
function classify(page:PublicPage){
 if(page.parent===false||!page.parent||page.parent.ID!==ARCHIVE_PARENT_ID||page.status!=='publish')return null;
 if(typeof page.URL!=='string'||typeof page.slug!=='string'||!canonicalArchiveUrl(page.URL,page.slug))return null;
 if(typeof page.title!=='string'||typeof page.date!=='string')return null;
 // Inspect the upstream HTML *before* stripping tags. A prohibited source may
 // be concealed in href/src while the visible headline looks innocuous.
 // The same check also handles nested HTML entities and URL encoding.
 if(!isEditorialTrendAllowed(page.title))return null;
 // A harmless archive heading must not link visitors to excluded body content
 // or source URLs hidden inside an excerpt. Inspect only fields already present
 // in this single public API response; do not fetch pages individually.
 for(const field of [page.content,page.excerpt]){
  if(field===undefined||field==='')continue;
  if(typeof field!=='string'||!isEditorialTrendAllowed(field))return null;
 }
 const title=decodeHtmlEntities(page.title).replace(/<[^>]{0,256}>/g,'').trim();
 if(!title||!isEditorialTrendAllowed(title))return null;
 const slug=page.slug;
 const match=/^([a-z]{2})-(search|music|week)-/.exec(slug);
 let country='',kind='';
 if(match && COUNTRY[match[1]] && KINDS.has(match[2])){
   country=COUNTRY[match[1]];kind=match[2]==='week'?'weekly':match[2];
 }else if(/^topic-[a-f0-9]+$/.test(slug)){kind='topic';}
 else return null;
 // A dated archive slug records the actual trend period. WordPress may publish
 // the page a day or a week later; showing publication time as the trend date
 // would mislabel historical search/music/weekly records. Preserve legacy
 // slugs without a day and topic pages by using their publication date.
 const archiveDay=/^[a-z]{2}-(?:search|music|week)-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9]+)?$/.exec(slug)?.[1];
 const publishedDay=page.date.slice(0,10);
 const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&
  Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
 // The upstream publication timestamp must remain valid even when the label
 // comes from a dated archive slug; corrupted WordPress rows are not shown.
 if(!validDay(publishedDay))return null;
 const date=archiveDay??publishedDay;
 if(!validDay(date))return null;
 return {title:title.slice(0,240),link:page.URL,country,kind,date,date_iso:page.date};
}
export default async(request:Request):Promise<Response>=>{
 if(request.method!=='GET')return new Response('method_not_allowed',{status:405});
 const rawPage=new URL(request.url).searchParams.get('page') ?? '1';
 if(!/^[1-9][0-9]{0,1}$/.test(rawPage)||Number(rawPage)>MAX_PAGE)return Response.json({error:'invalid_page'},{status:400,headers:{'cache-control':'no-store'}});
 const page=Number(rawPage);
 const u=new URL(API);u.searchParams.set('type','page');u.searchParams.set('parent_id',String(ARCHIVE_PARENT_ID));u.searchParams.set('number',String(PAGE_SIZE));u.searchParams.set('offset',String((page-1)*PAGE_SIZE));
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8500);
 try{
   const response=await fetch(u.toString(),{method:'GET',signal:controller.signal,headers:{accept:'application/json'}});
   if(!response.ok)throw new Error('upstream_unavailable');
   const payload:unknown=await readBoundedJsonStream(response.body,response.headers.get('content-length'),MAX_UPSTREAM_JSON_BYTES);
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('bad_wpcom_payload');
   const record=payload as Record<string,unknown>;
   if(!Array.isArray(record.posts)||record.posts.length>PAGE_SIZE||typeof record.found!=='number'||!Number.isSafeInteger(record.found)||record.found<0)throw new Error('no_pages');
   const items=record.posts.map(p=>p&&typeof p==='object'?classify(p as PublicPage):null).filter((p):p is NonNullable<typeof p>=>p!==null);
   return Response.json({scope:'latest_archived_pages_only',items,available_in_window:items.length,
     page,per_page:PAGE_SIZE,total_public_pages:record.found, // count of public children of archive parent
     has_more:page<MAX_PAGE && page*PAGE_SIZE<record.found,
     window_truncated:record.found>PAGE_SIZE*MAX_PAGE,
     source:'wordpress_com_public_jetpack',max_candidates:PAGE_SIZE*MAX_PAGE},{
       headers:{'cache-control':'public, max-age=300, s-maxage=600','x-content-type-options':'nosniff'}
     });
 }catch{
   return Response.json({error:'archive_temporarily_unavailable',items:[]},{status:503,headers:{'cache-control':'no-store'}});
 }finally{clearTimeout(timeout);}
};
