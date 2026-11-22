/**
 * Pure, side-effect-free editorial gate for external trend observations.
 * Call before persistence, index updates, or public archive responses.
 */
/** Safely decode the common entities returned in WordPress titles and excerpts.
 * Never use the decoded value as HTML: consumers must write it as textContent.
 */
const NAMED_ENTITIES:Record<string,string>={
 amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',
 mdash:'—',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',bull:'•'
};
export function decodeHtmlEntities(raw:string):string {
 return raw.replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));?/gi,(match,hex:string|undefined,decimal:string|undefined)=>{
  const n=parseInt(hex??decimal??'',hex?16:10);
  return Number.isFinite(n)&&n>0&&n<=0x10ffff&&(n<0xd800||n>0xdfff)?String.fromCodePoint(n):match;
 }).replace(/&([a-z]{2,10});/gi,(match,name:string)=>NAMED_ENTITIES[name.toLowerCase()]??match);
}

/**
 * Peel bounded HTML and percent-encoding layers in raw observation labels.
 * Return null on malformed, unfinished, or excessive encodings rather than
 * retaining obfuscated labels in an external snapshot or future storage.
 * Plain percentage signs such as "25%" remain valid.
 */
export function decodeEditorialText(raw:string):string|null {
 let decoded=raw;
 for(let i=0;i<6;i++){
  let next=decodeHtmlEntities(decoded);
  if(/%[0-9a-f]{2}/i.test(next)){
   try{next=decodeURIComponent(next);}catch{return null;}
  }
  if(next===decoded)break;
  decoded=next;
 }
 if(/&(?:amp;?|#(?:x[0-9a-f]{1,6}|[0-9]{1,7});?)/i.test(decoded)||
    /%[0-9a-f]{2}/i.test(decoded))return null;
 return decoded;
}
const terms=[
 'سكس','سيكس','سكسي','سيكسي','اباحي','اباحيه','اباحيات',
 'افلام اباحيه','مقاطع اباحيه','صور عاريه','محتوى جنسي صريح',
 'ميا خليفه','امارنا ميلر',
 'porn','porno','pornography','pornhub','xvideos','xnxx','xhamster',
 'onlyfans','only fans','redtube','youporn','adult video','adult videos',
 'xxx','nudes','nude pics','sex tape','sex video','sex videos',
 'lesbian porn','gay porn','hentai','sex','sex pistols','nsfw',
 'nude','nudity','erotica','erotic','gay','lesbian','explicit sex',
 'مثلي','مثليه','المثليه','شذوذ جنسي','محتوى اباحي','محتوي اباحي',
];
export function normalizeTrendText(raw:string,keepMarkup=false):string {
 const decoded=decodeEditorialText(raw);
 if(decoded===null)return '';
 return (keepMarkup?decoded:decoded.replace(/<[^>]{0,256}>/g,'')).normalize('NFKC').toLowerCase()
  // Do not erase an unresolved nested &amp; layer: the gate must fail closed.
  .replace(/&(?:nbsp|lt|gt|quot);/gi,' ')
  .replace(/[\u064B-\u065F\u0670\u0640]/gu,'')
  .replace(/[أإآٱ]/gu,'ا').replace(/ى/gu,'ي')
  .replace(/ؤ/gu,'و').replace(/ئ/gu,'ي').replace(/ة/gu,'ه')
  .replace(/[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu,'')
  .replace(/\s+/gu,' ').trim();
}
// Terms contain only literal words and spaces; match exact word/phrase boundaries.
const patterns=terms.map(s=>new RegExp('(?:^|[^\\p{L}\\p{N}])'+normalizeTrendText(s)+'(?=$|[^\\p{L}\\p{N}])','u'));
/**
 * Reject executable URL schemes concealed in HTML link/media attributes.
 * WordPress archive titles, excerpts and draft bodies can contain raw or
 * entity-escaped markup; strip ASCII whitespace/control inside the scheme as
 * browsers may ignore it. This validates text without fetching any URL.
 */
function hasUnsafeEmbeddedScheme(raw:string):boolean {
 const decoded=decodeEditorialText(raw);
 if(decoded===null)return true;
 // A source can be embedded in responsive-image candidates, lazy-loading
 // attributes, a poster, or inline CSS without appearing in href/src.
 const attributes=/(?:^|[\s<])(href|src|srcset|data-srcset|poster|data-src|data-href|xlink:href|action|formaction|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu;
 const normalizeDestination=(value:string):string=>value.normalize('NFKC')
   .replace(/[\u0000-\u0020\u007f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu,'')
   .toLowerCase();
 const unsafe=(value:string):boolean=>/^(?:javascript|vbscript|data|file|blob):/u.test(normalizeDestination(value));
 for(const match of decoded.matchAll(attributes)){
  const name=match[1].toLowerCase();
  const value=match[2]??match[3]??match[4]??'';
  if(name==='srcset'||name==='data-srcset'){
   // Each candidate is a separate URL; checking only the start of the whole
   // attribute misses an unsafe second candidate after a legitimate first.
   if(value.split(',').some(unsafe))return true;
  }else if(name==='style'){
   // CSS url() can carry an executable scheme hidden behind safe headlines.
   const css=normalizeDestination(value);
   if(/url\((?:"|')?(?:javascript|vbscript|data|file|blob):/u.test(css))return true;
  }else if(unsafe(value))return true;
 }
 return false;
}
export function isEditorialTrendAllowed(title:unknown):title is string {
 if(typeof title!=='string'||title.trim().length===0)return false;
 // Scan both visible text and raw markup. Otherwise an excluded URL in an
 // HTML href/src attribute disappears when tags are stripped, allowing a
 // harmless-looking headline or draft body to conceal a prohibited source.
 const normalized=normalizeTrendText(title);
 const markup=normalizeTrendText(title,true);
 return normalized.length>0 &&
  !hasUnsafeEmbeddedScheme(title) &&
  !/&(?:amp;?|#(?:x[0-9a-f]{1,6}|[0-9]{1,7});?)/i.test(normalized) &&
  !patterns.some(p=>p.test(normalized)||p.test(markup));
}
/**
 * Source destinations must be HTTPS and safe after URL and percent decoding.
 * A neutral title pointing to a prohibited media source is not admissible.
 * Pure validation: never dereferences the URL.
 */
export function isEditorialSourceUrlAllowed(value:unknown):value is string {
 if(typeof value!=='string'||value.length>2048||/\s/u.test(value))return false;
 let url:URL;
 try {url=new URL(value);}catch{return false;}
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password)return false;
 const raw=[url.hostname,url.pathname,url.search,url.hash].join(' ');
 let decoded=raw;
 for(let i=0;i<6;i++){
  if(!isEditorialTrendAllowed(decoded)||/[\x00-\x1f\x7f]/u.test(decoded))return false;
  let next:string;
  try{next=decodeURIComponent(decoded.replace(/\+/g,' '));}catch{return false;}
  if(next===decoded)return true;
  decoded=next;
 }
 // Reject a remaining nested escape instead of accepting partially decoded input.
 return isEditorialTrendAllowed(decoded)&&!/%[0-9a-f]{2}/i.test(decoded);
}
/** Works on both page records (title/name) and raw observations (term/source). */
export function filterTrendObservations<T extends {title?:unknown;name?:unknown;term?:unknown;source?:unknown;artist?:unknown;publisher?:unknown;url?:unknown;sourceUrl?:unknown}>(items:readonly T[]):T[] {
 return items.filter(item=>{
  const title=item.title??item.name??item.term;
  return isEditorialTrendAllowed(title) &&
   (item.title===undefined||isEditorialTrendAllowed(item.title)) &&
   (item.name===undefined||isEditorialTrendAllowed(item.name)) &&
   (item.term===undefined||isEditorialTrendAllowed(item.term)) &&
   (item.source===undefined||isEditorialTrendAllowed(item.source)) &&
   (item.artist===undefined||isEditorialTrendAllowed(item.artist)) &&
   (item.publisher===undefined||isEditorialTrendAllowed(item.publisher)) &&
   (item.url===undefined||isEditorialSourceUrlAllowed(item.url)) &&
   (item.sourceUrl===undefined||isEditorialSourceUrlAllowed(item.sourceUrl));
 });
}
