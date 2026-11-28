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
  // Search-only folding: keep displayed headlines and original detail URLs.
  .replace(/\p{Default_Ignorable_Code_Point}/gu,'')
  // Fold extended Arabic-script combining marks as well as ordinary harakat.
  .replace(/\u0640|(?=\p{Script_Extensions=Arabic})\p{Mark}/gu,'')
  .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
  // Fold Latin accents (including decomposed French labels) without
  // removing combining marks from other scripts.
  .normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').normalize('NFC')
  .replace(/œ/g,'oe').replace(/æ/g,'ae')
  .replace(/[\u0660-\u0669\u06f0-\u06f9]/gu,digit=>String(digit.charCodeAt(0)&15));
}
// Match common alternate country labels in archive searches only. Never
// rewrite the original country label, archive permalink or selected filter.
const countryAliases=new Map([
 ["الإمارات",["UAE","Emirates","Émirats"]],
 ["الكويت",["Kuwait","Koweït"]],
 ["قطر",["Qatar"]],
 ["البحرين",["Bahrain","Bahreïn"]],
 ["عُمان",["Oman"]],
 ["الأردن",["Jordan","Jordanie"]],
 ["لبنان",["Lebanon","Liban"]],
 ["العراق",["Iraq","Irak"]],
 ["سوريا",["Syria","Syrie","سورية"]],
 ["فلسطين",["Palestine"]],
 ["اليمن",["Yemen","Yémen"]],
 ["ليبيا",["Libya","Libye"]],
 ["تونس",["Tunisia","Tunisie"]],
 ["الجزائر",["Algeria","Algérie"]],
 ["المغرب",["Morocco","Maroc"]],
 ["موريتانيا",["Mauritania","Mauritanie"]],
 ['السعودية',['saudi','saoudite']],
 ['مصر',['egypt','égypte']],
 ['السودان',['sudan','soudan']],
 ['الصومال',['somalia','somalie','صوماليا','سوماليا']],
 ['جيبوتي',['djibouti','جیبوتی','دجيبوتي']],
 ['جزر القمر',['comoros','comores','جزرالقمر']]
].map(([name,aliases])=>[name,new Set(aliases.map(normalizeArabic))]));
// Official names are recognized only as complete phrases, never as generic
// aliases such as "republic", "union" or "جمهورية". Search-only normalization.
const officialCountryNames=[
 ["السعودية",["Kingdom of Saudi Arabia","Royaume d’Arabie saoudite","المملكة العربية السعودية","Saudi Arabia","Arabie saoudite"]],
 ["مصر",["Arab Republic of Egypt","République arabe d’Égypte","جمهورية مصر العربية"]],
 ["السودان",["Republic of the Sudan","République du Soudan","جمهورية السودان"]],
 ["الصومال",["Federal Republic of Somalia","République fédérale de Somalie","جمهورية الصومال الفيدرالية"]],
 ["جيبوتي",["Republic of Djibouti","République de Djibouti","جمهورية جيبوتي"]],
 ["جزر القمر",["Union of the Comoros","Union des Comores","اتحاد جزر القمر"]]
].flatMap(([name,aliases])=>aliases.map(alias=>[
 new RegExp('(?<![\\p{L}\\p{N}])'+normalizeArabic(alias).split(/[\s\p{P}]+/u).join('[\\s\\p{P}]+')+'(?![\\p{L}\\p{N}])','gu'),
 normalizeArabic(name)
]));
function render(){
 resultBox.replaceChildren();
 if(!loaded)return;
 if(currentPage===0&&loadError){statusBox.textContent=loadError;return;}
 const normalizedQuery=officialCountryNames.reduce((query,[pattern,name])=>query.replace(pattern,name),normalizeArabic(queryInput.value))
  // Recognize complete multiword UAE names without treating generic words
  // such as "arab" or "united" as country aliases by themselves.
  .replace(/\bunited[\s\p{P}]+arab[\s\p{P}]+emirates\b|\bemirats[\s\p{P}]+arabes[\s\p{P}]+unis\b/gu,'uae');
 // A full ISO-style date refers to the archive day, not arbitrary title fragments.
 // Accept year-first or unambiguous day-first dates in Arabic, Persian or Latin digits.
 // Slash or hyphen separators are search-only; preserve original links.
 const datePattern=/\b(?:(\d{4})([-/])(\d{1,2})\2(\d{1,2})|(\d{1,2})([-/])(\d{1,2})\6(\d{4}))\b/gu;
 const dates=Array.from(normalizedQuery.matchAll(datePattern),m=>m[1]
  ?m[1]+'-'+m[3].padStart(2,'0')+'-'+m[4].padStart(2,'0')
  :m[8]+'-'+m[7].padStart(2,'0')+'-'+m[5].padStart(2,'0'));
 const terms=normalizedQuery.replace(datePattern,' ').trim().split(/[\s\p{P}]+/u).filter(Boolean);
 // A standalone Arabic preposition in a multiword query is usually a
 // connector between the topic and country, not part of either label.
 const meaningful=terms.length>1||dates.length?terms.filter(term=>term!=='في'):terms;
 const searchTerms=meaningful.length||dates.length?meaningful:terms;
 const selected=allItems.filter(item=>{
  if((country&&item.country!==country)||(typeSelect.value&&item.kind!==typeSelect.value)||dates.some(date=>date!==item.date))return false;
  const title=normalizeArabic(item.title),name=normalizeArabic(item.country);
  const kind=normalizeArabic(kindLabels[item.kind]||'');
  return searchTerms.every(term=>title.includes(term)||name.includes(term)||kind.includes(term)||countryAliases.get(item.country)?.has(term));
 });
 for(const item of selected)resultBox.append(itemNode(item));
 const resultStatus=selected.length?'عدد الحصائل المطابقة ضمن أحدث البيانات المحمّلة: '+selected.length+'؛ افتح الأرشيف الأصلي لاستعراض المزيد.':'لا توجد نتائج مطابقة ضمن أحدث الحصائل المحمّلة. استخدم الأرشيف الأصلي للبحث الأوسع.';
 statusBox.textContent=loadError?loadError+' '+resultStatus:resultStatus;
}
// Match the proxy's route classification before deduplication. A mismatched
// country/kind must not reserve a valid permalink or appear under another tab.
function validArchiveItem(item){
 if(!item||typeof item.title!=='string'||!/[^ \s\p{Default_Ignorable_Code_Point}\p{Mark}\p{Cc}\u0640]/u.test(item.title)||typeof item.link!=='string'||typeof item.country!=='string'||typeof item.kind!=='string')return false;
 // The archive proxy caps display titles at 240 Unicode code points and
 // replaces C0/C1 controls and removes bidi controls. Reject malformed cached rows before deduplication.
 // Keep legitimate supplementary characters and joining marks intact.
 if(item.title.length>480||Array.from(item.title).length>240||/[\u0000-\u001f\u007f-\u009f]|\p{Bidi_Control}/u.test(item.title))return false;
 const route=/^https:\/\/arabiatrend\.com\/trend-archive\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$(?![\s\S])/u.exec(item.link);
 if(!route)return false;
 const slug=route[1];
 // The proxy supplies a real calendar day, not an arbitrary display value.
 // For dated slugs, require the same archive day before reserving a link.
 if(typeof item.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(item.date)||item.date.length!==10)return false;
 const day=new Date(item.date+'T00:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==item.date)return false;
 const archiveDay=/^[a-z]{2}-(?:search|music|week)-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9]+)*$/u.exec(slug)?.[1];
 // A malformed complete date must not fall back to the publication day as a legacy slug.
 if(!archiveDay&&/^[a-z]{2}-(?:search|music|week)-\d{4}-\d+-\d+(?:-|$)/u.test(slug))return false;
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
  if(!payload||payload.scope!=='latest_archived_pages_only'||!Array.isArray(payload.items)||payload.items.length>100||payload.page!==nextPage||typeof payload.has_more!=='boolean')throw new Error('invalid_archive');
  // The archive proxy returns at most 100 candidates per page. Reject oversized
  // responses before filtering/rendering, keeping the current page retryable.
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
