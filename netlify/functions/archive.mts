/** 
 * WordPress.com public Jetpack API is the canonical read-only archive transport.
 * This deliberately avoids requesting arabiatrend.com through its bot protection.
 * One bounded request; no WordPress writes, cron jobs or credentials.
 */
import {isEditorialTrendAllowed} from '../../src/trend-policy.mts';
const ORIGIN='https://arabiatrend.com';
const API='https://public-api.wordpress.com/rest/v1.1/sites/250183068/posts/';
const PAGE_SIZE=100;
const MAX_PAGE=10;
const COUNTRY:Record<string,string>={
 sa:'السعودية',ae:'الإمارات',eg:'مصر',kw:'الكويت',qa:'قطر',bh:'البحرين',
 om:'عُمان',jo:'الأردن',lb:'لبنان',iq:'العراق',sy:'سوريا',ps:'فلسطين',
 ye:'اليمن',ly:'ليبيا',tn:'تونس',dz:'الجزائر',ma:'المغرب',mr:'موريتانيا',
 sd:'السودان',so:'الصومال',dj:'جيبوتي',km:'جزر القمر'
};
const KINDS=new Set(['search','music','week']);
type PublicPage={title?:unknown;URL?:unknown;slug?:unknown;date?:unknown;status?:unknown;parent?:{ID?:unknown}|false;};
function classify(page:PublicPage){
 if(page.parent===false||!page.parent||page.parent.ID!==61269||page.status!=='publish')return null;
 if(typeof page.URL!=='string'||!page.URL.startsWith(ORIGIN+'/trend-archive/'))return null;
 if(!isEditorialTrendAllowed(page.title)||typeof page.slug!=='string'||typeof page.date!=='string')return null;
 const slug=page.slug;
 const match=/^([a-z]{2})-(search|music|week)-/.exec(slug);
 let country='',kind='';
 if(match && COUNTRY[match[1]] && KINDS.has(match[2])){
   country=COUNTRY[match[1]];kind=match[2]==='week'?'weekly':match[2];
 }else if(/^topic-[a-f0-9]+$/.test(slug)){kind='topic';}
 else return null;
 const date=page.date.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 return {title:page.title.slice(0,240),link:page.URL,country,kind,date,date_iso:page.date};
}
export default async(request:Request):Promise<Response>=>{
 if(request.method!=='GET')return new Response('method_not_allowed',{status:405});
 const rawPage=new URL(request.url).searchParams.get('page') ?? '1';
 if(!/^[1-9][0-9]{0,1}$/.test(rawPage)||Number(rawPage)>MAX_PAGE)return Response.json({error:'invalid_page'},{status:400,headers:{'cache-control':'no-store'}});
 const page=Number(rawPage);
 const u=new URL(API);u.searchParams.set('type','page');u.searchParams.set('number',String(PAGE_SIZE));u.searchParams.set('offset',String((page-1)*PAGE_SIZE));
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8500);
 try{
   const response=await fetch(u.toString(),{method:'GET',signal:controller.signal,headers:{accept:'application/json'}});
   if(!response.ok)throw new Error('upstream_unavailable');
   const payload:unknown=await response.json();
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('bad_wpcom_payload');
   const record=payload as Record<string,unknown>;
   if(!Array.isArray(record.posts)||typeof record.found!=='number'||!Number.isFinite(record.found))throw new Error('no_pages');
   const items=record.posts.map(p=>p&&typeof p==='object'?classify(p as PublicPage):null).filter((p):p is NonNullable<typeof p>=>p!==null);
   return Response.json({scope:'latest_archived_pages_only',items,available_in_window:items.length,
     page,per_page:PAGE_SIZE,total_public_pages:record.found,has_more:page*PAGE_SIZE<record.found,
     source:'wordpress_com_public_jetpack',max_candidates:PAGE_SIZE*MAX_PAGE},{
       headers:{'cache-control':'public, max-age=300, s-maxage=600','x-content-type-options':'nosniff'}
     });
 }catch{
   return Response.json({error:'archive_temporarily_unavailable',items:[]},{status:503,headers:{'cache-control':'no-store'}});
 }finally{clearTimeout(timeout);}
};
