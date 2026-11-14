'use strict';
const ORIGIN='https://arabiatrend.com';
const COUNTRY_NAMES=['السعودية','الإمارات','مصر','الكويت','قطر','البحرين','عُمان','الأردن','لبنان','العراق','سوريا','فلسطين','اليمن','ليبيا','تونس','الجزائر','المغرب'];
const countryButtons=document.getElementById('countries');
const countrySelect=document.getElementById('countrySelect');
const queryInput=document.getElementById('query');
const resultBox=document.getElementById('results');
const statusBox=document.getElementById('status');
const typeSelect=document.getElementById('typeSelect');
let country='',allItems=[],loaded=false;
for(const name of COUNTRY_NAMES){
 const btn=document.createElement('button');btn.className='country';btn.textContent=name;btn.type='button';btn.setAttribute('aria-pressed','false');btn.addEventListener('click',()=>{
  country=country===name?'':name;countrySelect.value=country;
  for(const x of countryButtons.children)x.setAttribute('aria-pressed',String(x.textContent===country));
  render();
 });countryButtons.append(btn);
 const opt=document.createElement('option');opt.value=name;opt.textContent=name;countrySelect.append(opt);
}
countrySelect.addEventListener('change',()=>{country=countrySelect.value;for(const x of countryButtons.children)x.setAttribute('aria-pressed',String(x.textContent===country));render()});
typeSelect.addEventListener('change',render);
document.getElementById('searchBtn').addEventListener('click',render);
queryInput.addEventListener('keydown',e=>{if(e.key==='Enter')render()});
function kind(title){return title.includes('كلمات البحث الرائجة')||title.includes('الأغاني الأكثر تشغيلًا')?'daily':title.includes('سجل الرواج')?'topic':'other'}
function itemNode(item){
 const card=document.createElement('a');card.className='result';card.href=item.link;card.target='_blank';card.rel='noopener noreferrer';
 const meta=document.createElement('div');meta.className='meta';meta.textContent=kind(item.title)==='daily'?'حصيلة يومية':kind(item.title)==='topic'?'ملف موضوع':'مادة منشورة';
 const h=document.createElement('h3');h.textContent=item.title;
 const date=document.createElement('div');date.className='date';date.textContent=item.date?new Date(item.date+'Z').toLocaleDateString('ar-SA',{day:'numeric',month:'long',year:'numeric'}):'';
 card.append(meta,h,date);return card;
}
function render(){
 resultBox.replaceChildren();
 if(!loaded)return;
 const phrase=queryInput.value.trim().normalize('NFKC').toLowerCase();
 const selected=allItems.filter(p=>(!country||p.title.includes(country))&&(!phrase||p.title.normalize('NFKC').toLowerCase().includes(phrase))&&(!typeSelect.value||kind(p.title)===typeSelect.value));
 for(const p of selected.slice(0,24))resultBox.append(itemNode(p));
 statusBox.textContent=selected.length?('عدد المواد المطابقة في آخر النتائج المتاحة: '+selected.length+'. المصدر: المقالات العامة المنشورة في الأرشيف.'):'لا توجد حصائل مطابقة في البيانات المحمّلة. استخدم الأرشيف الأصلي للبحث الأشمل.';
}
async function load(){
 // Public read-only endpoint. Abort quickly to avoid repeated costly requests.
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),8000);
 try{
  // Native WP search endpoint; the original archive remains the canonical source.
  const terms=['كلمات البحث الرائجة','سجل الرواج','الأغاني الأكثر تشغيلًا'];
  const pages=await Promise.all(terms.map(async term=>{
   const u=new URL(ORIGIN+'/wp-json/wp/v2/search');u.searchParams.set('search',term);u.searchParams.set('per_page','40');u.searchParams.set('type','post');
   const resp=await fetch(u,{signal:ctrl.signal,mode:'cors'});
   if(!resp.ok)throw new Error('api_unavailable');
   const items=await resp.json();if(!Array.isArray(items))throw new Error('invalid_response');
   return items.filter(p=>typeof p.title==='string'&&typeof p.url==='string').map(p=>({id:p.id,title:p.title,link:p.url,date:null}));
  }));
  const ids=new Set();allItems=pages.flat().filter(p=>{if(ids.has(p.id))return false;ids.add(p.id);return true});
  loaded=true;render();
 }catch{
  loaded=true;allItems=[];statusBox.textContent='تعذر جلب بيانات الأرشيف عبر الواجهة العامة. الأرشيف الأصلي متاح من الرابط أدناه.';
 }finally{clearTimeout(timeout)}
}
load();
