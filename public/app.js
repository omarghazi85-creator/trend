'use strict';
const COUNTRY_NAMES=['السعودية','الإمارات','مصر','الكويت','قطر','البحرين','عُمان','الأردن','لبنان','العراق','سوريا','فلسطين','اليمن','ليبيا','تونس','الجزائر','المغرب','موريتانيا'];
const countryButtons=document.getElementById('countries');
const countrySelect=document.getElementById('countrySelect');
const queryInput=document.getElementById('query');
const resultBox=document.getElementById('results');
const statusBox=document.getElementById('status');
const typeSelect=document.getElementById('typeSelect');
let country='',allItems=[],loaded=false,currentPage=0,hasMore=false,busy=false;
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
 const meta=document.createElement('div');meta.className='meta';meta.textContent=kindLabels[item.kind]||'مادة منشورة';
 const heading=document.createElement('h3');heading.textContent=item.title;
 const date=document.createElement('div');date.className='date';date.textContent=item.date||'';
 card.append(meta,heading,date);return card;
}
function render(){
 resultBox.replaceChildren();
 if(!loaded)return;
 const phrase=queryInput.value.trim().normalize('NFKC').toLowerCase();
 const selected=allItems.filter(item=>(!country||item.country===country)&&(!phrase||item.title.normalize('NFKC').toLowerCase().includes(phrase))&&(!typeSelect.value||item.kind===typeSelect.value));
 for(const item of selected)resultBox.append(itemNode(item));
 statusBox.textContent=selected.length?'عدد الحصائل المطابقة ضمن أحدث البيانات المحمّلة: '+selected.length+'؛ افتح الأرشيف الأصلي لاستعراض المزيد.':'لا توجد نتائج مطابقة ضمن أحدث الحصائل المحمّلة. استخدم الأرشيف الأصلي للبحث الأوسع.';
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
  if(!payload||payload.scope!=='latest_archived_pages_only'||!Array.isArray(payload.items)||payload.page!==nextPage)throw new Error('invalid_archive');
  const valid=payload.items.filter(item=>item&&typeof item.title==='string'&&typeof item.link==='string'&&typeof item.country==='string'&&typeof item.kind==='string'&&item.link.startsWith('https://arabiatrend.com/trend-archive/'));
  const seen=new Set(allItems.map(item=>item.link));
  for(const item of valid){if(!seen.has(item.link)){seen.add(item.link);allItems.push(item);}}
  currentPage=nextPage;
  hasMore=Boolean(payload.has_more)&&currentPage<10;
  loaded=true;render();
 }catch{
  if(currentPage===0){loaded=true;allItems=[];statusBox.textContent='تعذر تحميل أحدث بيانات الأرشيف. افتح الأرشيف الأصلي من الرابط أدناه.';}
  else{statusBox.textContent='تعذر تحميل الدفعة التالية. يمكنك إعادة المحاولة أو تصفح الأرشيف الأصلي.';}
 }finally{
  clearTimeout(timeout);busy=false;loadMoreButton.disabled=false;
  loadMoreButton.textContent='تحميل المزيد من الأرشيف';
  loadMoreButton.hidden=!hasMore&&currentPage>0;
 }
}
loadMoreButton.addEventListener('click',loadMore);
hasMore=true;
loadMore();
