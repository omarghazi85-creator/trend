'use strict';
const COUNTRY_CODES=new Map([['sa','السعودية'],['ae','الإمارات'],['eg','مصر'],['kw','الكويت'],['qa','قطر'],['bh','البحرين'],['om','عُمان'],['jo','الأردن'],['lb','لبنان'],['iq','العراق'],['sy','سوريا'],['sd','السودان'],['ps','فلسطين'],['ye','اليمن'],['ly','ليبيا'],['tn','تونس'],['dz','الجزائر'],['ma','المغرب'],['mr','موريتانيا'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']]);
const COUNTRY_NAMES=Array.from(COUNTRY_CODES.values());
const countryButtons=document.getElementById('countries');
const countrySelect=document.getElementById('countrySelect');
const queryInput=document.getElementById('query');
const resultBox=document.getElementById('results');
const statusBox=document.getElementById('status');
const typeSelect=document.getElementById('typeSelect');
let country='',allItems=[],loaded=false,currentPage=0,hasMore=false,busy=false,loadError='';
const loadMoreButton=document.getElementById('loadMore');
for(const name of COUNTRY_NAMES){
 const btn=document.createElement('button');btn.className='country';btn.textContent=name;btn.type='button';btn.setAttribute('aria-pressed','false');
 btn.addEventListener('click',()=>{country=country===name?'':name;countrySelect.value=country;updateSelection();render();});
 countryButtons.append(btn);
 const opt=document.createElement('option');opt.value=name;opt.textContent=name;countrySelect.append(opt);
}
function updateSelection(){for(const button of countryButtons.children)button.setAttribute('aria-pressed',String(button.textContent===country));}
countrySelect.addEventListener('change',()=>{country=countrySelect.value;updateSelection();render();});
typeSelect.addEventListener('change',render);
document.getElementById('searchBtn').addEventListener('click',render);
queryInput.addEventListener('keydown',event=>{if(event.key==='Enter')render();});
const kindLabels={search:'كلمات البحث',music:'الأغاني الأكثر تشغيلًا',weekly:'حصيلة أسبوعية',topic:'ملف موضوع'};
function itemNode(item){
 const card=document.createElement('a');card.className='result';card.href=item.link;card.target='_blank';card.rel='noopener noreferrer';
 const meta=document.createElement('div');meta.className='meta';meta.textContent=[item.country,kindLabels[item.kind]||'مادة منشورة'].filter(Boolean).join(' · ');
 const heading=document.createElement('h3');heading.textContent=item.title;
 const date=document.createElement('div');date.className='date';date.textContent=item.date||'';
 card.append(meta,heading,date);return card;
}
function normalizeArabic(value){
 return value.normalize('NFKC').toLowerCase()
  // Ignore invisible direction and joining controls in copied search text.
  .replace(/[\u061c\u200c-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu,'')
  .replace(/[\u064b-\u065f\u0670\u0640]/g,'')
  .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي');
}
function render(){
 resultBox.replaceChildren();
 if(!loaded)return;
 if(currentPage===0&&loadError){statusBox.textContent=loadError;return;}
 const terms=normalizeArabic(queryInput.value).trim().split(/[\s\p{P}]+/u).filter(Boolean);
 // A standalone Arabic preposition in a multiword query is usually a
 // connector between the topic and country, not part of either label.
 const meaningful=terms.length>1?terms.filter(term=>term!=='في'):terms;
 const searchTerms=meaningful.length?meaningful:terms;
 const selected=allItems.filter(item=>{
  if((country&&item.country!==country)||(typeSelect.value&&item.kind!==typeSelect.value))return false;
  const title=normalizeArabic(item.title),name=normalizeArabic(item.country);
  const kind=normalizeArabic(kindLabels[item.kind]||'');
  return searchTerms.every(term=>title.includes(term)||name.includes(term)||kind.includes(term));
 });
 for(const item of selected)resultBox.append(itemNode(item));
 const resultStatus=selected.length?'عدد الحصائل المطابقة ضمن أحدث البيانات المحمّلة: '+selected.length+'؛ افتح الأرشيف الأصلي لاستعراض المزيد.':'لا توجد نتائج مطابقة ضمن أحدث الحصائل المحمّلة. استخدم الأرشيف الأصلي للبحث الأوسع.';
 statusBox.textContent=loadError?loadError+' '+resultStatus:resultStatus;
}
// Match the proxy's route classification before deduplication. A mismatched
// country/kind must not reserve a valid permalink or appear under another tab.
function validArchiveItem(item){
 if(!item||typeof item.title!=='string'||!item.title.trim()||typeof item.link!=='string'||typeof item.country!=='string'||typeof item.kind!=='string')return false;
 const route=/^https:\/\/arabiatrend\.com\/trend-archive\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$(?![\s\S])/u.exec(item.link);
 if(!route)return false;
 const slug=route[1];
 // The proxy supplies a real calendar day, not an arbitrary display value.
 // For dated slugs, require the same archive day before reserving a link.
 if(typeof item.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(item.date)||item.date.length!==10)return false;
 const day=new Date(item.date+'T00:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==item.date)return false;
 const archiveDay=/^[a-z]{2}-(?:search|music|week)-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9]+)*$/u.exec(slug)?.[1];
 if(archiveDay&&archiveDay!==item.date)return false;
 if(/^topic-[a-f0-9]+$/u.test(slug))return item.country===''&&item.kind==='topic';
 const match=/^([a-z]{2})-(search|music|week)-/u.exec(slug);
 return !!match&&COUNTRY_CODES.has(match[1])&&item.country===COUNTRY_CODES.get(match[1])&&item.kind===(match[2]==='week'?'weekly':match[2]);
}
async function loadMore(){
 if(busy||!hasMore && currentPage>0)return;
 busy=true;loadMoreButton.disabled=true;loadMoreButton.textContent='جارٍ تحميل الحصائل...';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8500);
 try{
  const nextPage=currentPage+1;
  const response=await fetch('/.netlify/functions/archive?page='+nextPage,{
    method:'GET',signal:controller.signal,headers:{accept:'application/json'}
  });
  if(!response.ok)throw new Error('archive_proxy_unavailable');
  const payload=await response.json();
  if(!payload||payload.scope!=='latest_archived_pages_only'||!Array.isArray(payload.items)||payload.page!==nextPage||typeof payload.has_more!=='boolean')throw new Error('invalid_archive');
  const valid=payload.items.filter(validArchiveItem);
  // The same WordPress detail can occur on consecutive pages with or without
  // its trailing slash. Preserve the first admitted permalink verbatim.
  const archiveKey=link=>link.replace(/\/$/u,'');
  const seen=new Set(allItems.map(item=>archiveKey(item.link)));
  for(const item of valid){const key=archiveKey(item.link);if(!seen.has(key)){seen.add(key);allItems.push(item);}}
  currentPage=nextPage;
  hasMore=payload.has_more&&currentPage<10;
  loadError='';loaded=true;render();
 }catch{
  loadError=currentPage===0?'تعذر تحميل أحدث بيانات الأرشيف. افتح الأرشيف الأصلي من الرابط أدناه.':'تعذر تحميل الدفعة التالية. يمكنك إعادة المحاولة أو تصفح الأرشيف الأصلي.';
  loaded=true;render();
 }finally{
  clearTimeout(timeout);busy=false;loadMoreButton.disabled=false;
  loadMoreButton.textContent='تحميل المزيد من الأرشيف';
  loadMoreButton.hidden=!hasMore&&currentPage>0;
 }
}
loadMoreButton.addEventListener('click',loadMore);
hasMore=true;
loadMore();
