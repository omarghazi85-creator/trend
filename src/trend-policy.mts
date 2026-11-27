/**
 * Pure, side-effect-free editorial gate for external trend observations.
 * Call before persistence, index updates, or public archive responses.
 */
/** Safely decode the common entities returned in WordPress titles and excerpts.
 * Never use the decoded value as HTML: consumers must write it as textContent.
 */
const NAMED_ENTITIES:Record<string,string>={
 amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',
 mdash:'—',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',bull:'•',
 // Entity-encoded invisible separators must not split excluded names or schemes.
 shy:'\u00ad',zwnj:'\u200c',zwj:'\u200d',lrm:'\u200e',rlm:'\u200f',
 nobreak:'\u2060',tab:'\t',newline:'\n',
 zerowidthspace:'\u200b',negativethinspace:'\u200b',negativeverythinspace:'\u200b',
 negativemediumspace:'\u200b',negativethickspace:'\u200b',
 applyfunction:'\u2061',invisibletimes:'\u2062',invisiblecomma:'\u2063',
 af:'\u2061',it:'\u2062',ic:'\u2063',
 // HTML5 named punctuation is interpreted by browsers inside attributes.
 // Decode before source and executable-scheme checks, not after admission.
 colon:':',sol:'/',bsol:'\\',period:'.',lowbar:'_',hyphen:'-',
 lpar:'(',rpar:')'
};
export function decodeHtmlEntities(raw:string):string {
 // Consume the complete numeric reference, including arbitrary leading zeros.
 // A fixed digit cap can decode a prefix and hide the remaining character.
 return raw.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi,(match,hex:string|undefined,decimal:string|undefined)=>{
  const n=parseInt(hex??decimal??'',hex?16:10);
  return Number.isFinite(n)&&n>0&&n<=0x10ffff&&(n<0xd800||n>0xdfff)?String.fromCodePoint(n):match;
 }).replace(/&([a-z]{2,24});/gi,(match,name:string)=>{
  const key=name.toLowerCase();
  return Object.hasOwn(NAMED_ENTITIES,key)?NAMED_ENTITIES[key]:match;
 // HTML parsers also recognize these two legacy references without a semicolon.
 // In particular, a soft hyphen can split a prohibited brand in plain feed text.
 // Decode only these legacy separators, not arbitrary entity-like substrings.
 }).replace(/&shy(?!;)/g,'\u00ad').replace(/&nbsp(?!;)/g,' ');
}

/** Resolve literal JSON/JavaScript \uNNNN and \xNN escapes sometimes
 * double-serialized by feed aggregators. Treat these as data, never as code.
 * This only runs inside the existing six-pass bounded editorial decoder.
 */
function decodeUnicodeEscapes(raw:string):string {
 return raw.replace(/\\u\{([0-9a-f]{1,6})\}/giu,(match,hex:string)=>{
  const point=parseInt(hex,16);
  // Leave invalid scalar escapes unresolved so the bounded decoder rejects them.
  return point>0&&point<=0x10ffff&&(point<0xd800||point>0xdfff)?String.fromCodePoint(point):match;
 }).replace(/\\(?:u([0-9a-f]{4})|x([0-9a-f]{2}))/giu,
  (_match,unicode:string|undefined,hex:string|undefined)=>
   String.fromCharCode(parseInt(unicode??hex??'',16)));
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
  let next=decodeUnicodeEscapes(decodeHtmlEntities(decoded));
  if(/%[0-9a-f]{2}/i.test(next)){
   try{next=decodeURIComponent(next);}catch{return null;}
  }
  if(next===decoded)break;
  decoded=next;
 }
 if(/&(?:amp;?|#(?:x[0-9a-f]{1,6}|[0-9]{1,7});?)/i.test(decoded)||
    /%[0-9a-f]{2}/i.test(decoded)||/\\u\{/iu.test(decoded))return null;
 return decoded;
}
const terms=[
 'سكس','سيكس','سكسي','سيكسي','اباحي','اباحيه','اباحيات',
 'افلام اباحيه','مقاطع اباحيه','صور عاريه','محتوى جنسي صريح',
 'ميا خليفه','امارنا ميلر',
 'porn','porno','pornography','pornographic','pornographically','pornographer','pornographers',
 'pornhub','xvideos','xnxx','xhamster',
 // French-language feeds (notably Djibouti and Comoros): match explicit
 // descriptors, not generic words for sexuality or public health.
 'pornographie','pornographies','pornographique','pornographiques',
 'onlyfans','only fans','redtube','youporn','adult video','adult videos',
 'xxx','nudes','nude pics','sex tape','sex video','sex videos',
 'lesbian porn','gay porn','hentai','sex','sex pistols','nsfw',
 'nude','nudity','erotica','erotic','gay','lesbian','explicit sex',
 'مثلي','مثليه','المثليه','شذوذ جنسي','محتوى اباحي','محتوي اباحي',
];
export function normalizeTrendText(raw:string,keepMarkup=false,preserveBlockBoundaries=false):string {
 const decoded=decodeEditorialText(raw);
 if(decoded===null)return '';
 return (keepMarkup?decoded:decoded.replace(/<!--[\s\S]*?-->|<\/?[a-z](?:"[^"]*"|'[^']*'|[^<>"'])*>/giu,tag=>
   preserveBlockBoundaries&&/^<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)(?=[\s/>])/iu.test(tag)?' ':'')).normalize('NFKC').toLowerCase()
  // Do not erase an unresolved nested &amp; layer: the gate must fail closed.
  .replace(/&(?:nbsp|lt|gt|quot);/gi,' ')
  // Remove Arabic-script combining marks beyond the common harakat block.
  // This is editorial matching only; original titles and Latin accents stay intact.
  .replace(/\u0640|(?=\p{Script_Extensions=Arabic})\p{Mark}/gu,'')
  .replace(/[أإآٱ]/gu,'ا').replace(/ى/gu,'ي')
  .replace(/ؤ/gu,'و').replace(/ئ/gu,'ي').replace(/ة/gu,'ه')
  // Include supplementary variation selectors, tags and invisible fillers.
  .replace(/\p{Default_Ignorable_Code_Point}/gu,'')
  .replace(/\s+/gu,' ').trim();
}
// Terms contain only literal words and spaces; match exact word/phrase boundaries.
const patterns=terms.map(s=>new RegExp('(?:^|[^\\p{L}\\p{N}])'+normalizeTrendText(s)+'(?=$|[^\\p{L}\\p{N}])','u'));
// Arabic articles and attached conjunctions/prepositions are part of the
// same word. Recognize these inflections only for explicit adult-content
// descriptors, not general substrings or the unrelated word إباحة.
const explicitArabicPattern=/(?:^|[^\p{L}\p{N}])(?:[وف]?(?:(?:[بك]?ال|لل|[بكل])?))?اباح(?:ي(?:ه|ات|ون|ين)?)(?=$|[^\p{L}\p{N}])/u;
// A few distinctive excluded source names are also disguised with dots,
// underscores or hyphens between letters in feed titles and URLs. Match
// these brands only, rather than stripping punctuation from every headline:
// that would create false positives in ordinary Arabic and English text.
const obfuscatedBrandPatterns=['onlyfans','pornhub','xvideos','xnxx','xhamster','redtube','youporn']
 // Some feeds separate every letter with whitespace rather than punctuation.
 // Keep this limited to distinctive source names to avoid broad false positives.
 .map(brand=>new RegExp('(?:^|[^\\p{L}\\p{N}])'+[...brand].join('[._·•/+\\s-]*')+'(?=$|[^\\p{L}\\p{N}])','u'));
/**
 * Reject executable URL schemes concealed in HTML link/media attributes.
 * WordPress archive titles, excerpts and draft bodies can contain raw or
 * entity-escaped markup; strip ASCII whitespace/control inside the scheme as
 * browsers may ignore it. This validates text without fetching any URL.
 */
/** CSS hexadecimal and single-character escapes must not conceal source schemes. */
function decodeCssEscapes(raw:string):string {
 return raw.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\r\f ])?|\\([^\r\n\f])/giu, (_match,hex:string|undefined,plain:string|undefined)=>{
  if(hex){
   const point=parseInt(hex,16);
   return point>0&&point<=0x10ffff&&(point<0xd800||point>0xdfff)?String.fromCodePoint(point):'\uFFFD';
  }
  return plain??'';
 });
}
/** Fold marks and embedded control bytes for distinctive excluded brands only.
 * Preserve the original normalized text for ordinary word/phrase checks so
 * legitimate French, Somali, Arabic and other accented labels are unchanged.
 */
function hasObfuscatedBrand(value:string):boolean {
 const probe=value.normalize('NFKD').replace(/\p{Mark}|\p{Cc}/gu,'');
 return obfuscatedBrandPatterns.some(pattern=>pattern.test(value)||pattern.test(probe));
}
function hasUnsafeEmbeddedScheme(raw:string):boolean {
 const decoded=decodeEditorialText(raw);
 if(decoded===null)return true;
 const inspected=decoded.includes('\\')?decodeCssEscapes(decoded):decoded;
 // Reject executable HTML even when a safe HTTPS link or innocuous title
 // conceals an event handler, srcdoc document, or active-content element.
 // Inspect only markup tags: ordinary text such as "onload=ready" is allowed.
 if(/<\s*\/?\s*(?:script|object|embed|base|meta)\b/iu.test(inspected))return true;
 // Browsers accept <svg/onload=...> and <img/src=...> as attributes.
 // Do not let oversized tags skip the bounded event-handler scanner.
 if(/<\s*[a-z][^<>]{4097}/iu.test(inspected))return true;
 // Match whole tags even when a quoted attribute contains '>' or '<'.
 // A simple [^<>]* scanner truncates at a quoted '>', missing later onload.
 // This matches the public PHP archive guard without trusting unbounded tags.
 for(const tag of inspected.matchAll(/<\s*[a-z](?:"[^"]*"|'[^']*'|[^<>"'])*>/giu)){
  if(tag[0].length>4096)return true;
  // Ignore quoted values: `/onload=` inside a legitimate URL is not an event.
  const attributeNames=tag[0].replace(/"[^"]*"|'[^']*'/gu,'""');
  if(/[\s/](?:on[a-z][a-z0-9_-]*|srcdoc)\s*=/iu.test(attributeNames))return true;
 }
 // A source can be embedded in responsive-image candidates, lazy-loading
 // attributes, a poster, or inline CSS without appearing in href/src.
 const attributes=/(?:^|[\s</])(href|src|srcset|data-srcset|poster|data-src|data-href|xlink:href|action|formaction|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu;
 const normalizeDestination=(value:string):string=>value.normalize('NFKC')
   .replace(/[\u0000-\u0020\u007f]|\p{Default_Ignorable_Code_Point}/gu,'')
   .toLowerCase();
 const unsafe=(value:string):boolean=>/^(?:javascript|vbscript|data|file|blob):/u.test(normalizeDestination(value));
 for(const match of inspected.matchAll(attributes)){
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
 // HTML block boundaries separate visible words; preserve inline continuity
 // as well so an excluded word cannot hide between adjacent paragraphs.
 const blockText=normalizeTrendText(title,false,true);
 const decoded=decodeEditorialText(title);
 const markup=normalizeTrendText(decoded===null?'':decodeCssEscapes(decoded),true);
 // Match the visible-label admission rule before observations reach any adapter.
 return /[^\s\p{Default_Ignorable_Code_Point}\p{Mark}\p{Cc}\u0640]/u.test(normalized) &&
  !hasUnsafeEmbeddedScheme(title) &&
  !/&(?:amp;?|#(?:x[0-9a-f]{1,6}|[0-9]{1,7});?)/i.test(normalized) &&
  ![normalized,markup,blockText].some(value=>
   patterns.some(p=>p.test(value))||explicitArabicPattern.test(value)||hasObfuscatedBrand(value));
}
/**
 * Source destinations must be HTTPS and safe after URL and percent decoding.
 * A neutral title pointing to a prohibited media source is not admissible.
 * Pure validation: never dereferences the URL.
 */
export function isEditorialSourceUrlAllowed(value:unknown):value is string {
 if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/u.test(value))return false;
 // The URL parser repairs malformed schemes/backslashes and removes dot
 // segments. Screen the retained original before any such normalization.
 if(!/^https:\/\/[^/?#\\]/iu.test(value)||value.includes('\\')||
    !isEditorialTrendAllowed(value))return false;
 let url:URL;
 try {url=new URL(value);}catch{return false;}
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password)return false;
 // An observation's original source must be an external named HTTPS site.
 // Reject loopback, private DNS zones, IP literals (including IPv6 and
 // alternate IPv4 spellings normalized by URL), and single-label intranet
 // names before aggregation. These links are never fetched here.
 const host=url.hostname.toLowerCase().replace(/\.+$/u,'');
 // Special-use names cannot be normal public media destinations. Check
 // label boundaries so legitimate names such as local-news.example.com
 // are not rejected. URL already converts international names to ASCII.
 const reserved=/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|home\.arpa|alt)$/u;
 if(host.length>253||!host.includes('.')||reserved.test(host)||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)||host.startsWith('[')||
    host.split('.').some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)))return false;
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
/** Shared pre-admission policy for source observations and archive records. */
export type EditorialObservation={
 title?:unknown;name?:unknown;term?:unknown;source?:unknown;artist?:unknown;publisher?:unknown;
 provider?:unknown;channel?:unknown;author?:unknown;platform?:unknown;byline?:unknown;
 description?:unknown;excerpt?:unknown;summary?:unknown;caption?:unknown;content?:unknown;
 subtitle?:unknown;body?:unknown;text?:unknown;
 url?:unknown;sourceUrl?:unknown;mediaUrl?:unknown;imageUrl?:unknown;originalUrl?:unknown;link?:unknown;
 permalink?:unknown;canonicalUrl?:unknown;thumbnailUrl?:unknown;videoUrl?:unknown;postUrl?:unknown;
 source_url?:unknown;media_url?:unknown;image_url?:unknown;original_url?:unknown;video_url?:unknown;thumbnail_url?:unknown;
 enclosure?:unknown;enclosures?:unknown;links?:unknown;attachments?:unknown;
 media?:unknown;media_content?:unknown;media_thumbnail?:unknown;image?:unknown;thumbnail?:unknown;
 'media:content'?:unknown;'media:thumbnail'?:unknown;
};
/**
 * RSS enclosures and media/Atom links can hide destinations inside arrays
 * and nested objects. Screen these before aggregation, with a strict
 * traversal budget so malformed feeds cannot exhaust a serverless worker.
 * This is validation only; it does not fetch or persist feed data.
 */
function isEditorialStructuredFeedFieldAllowed(value:unknown, budget:{nodes:number}, depth=0):boolean {
 if(++budget.nodes>128||depth>4)return false;
 if(value===undefined||value===null)return true;
 if(typeof value==='string'){
  if(value.length>4096)return false;
  // Optional RSS captions and display labels are commonly empty.
  if(value.trim()==='')return true;
  // An unknown provider field can carry a destination with leading spaces,
  // invisible controls, or an encoded scheme. Detect it after decoding, but
  // validate the original value so disguised destinations cannot be retained.
  const decoded=decodeEditorialText(value);
  if(decoded===null)return false;
  const schemeProbe=decoded.normalize('NFKC')
   .replace(/[\u0000-\u0020\u007f]|\p{Default_Ignorable_Code_Point}/gu,'');
  const looksLikeDestination=/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(value)||
   /^(?:(?:https?|javascript|vbscript|data|file|blob|ftp|mailto):|\/\/)/iu.test(schemeProbe);
  return looksLikeDestination
   ? isEditorialSourceUrlAllowed(value) : isEditorialTrendAllowed(value);
 }
 if(typeof value==='number')return Number.isFinite(value);
 if(typeof value==='boolean')return true;
 if(typeof value!=='object')return false;
 if(Array.isArray(value)){
  return value.length<=24 && value.every(entry=>isEditorialStructuredFeedFieldAllowed(entry,budget,depth+1));
 }
 const entries=Object.entries(value);
 return entries.length<=32&&entries.every(([key,entry])=>{
  // Feed labels may put an excluded brand or disguised URL in a JSON key,
  // while giving that key an innocuous value. Scan property names as well as
  // values before the observation can enter a snapshot or future raw store.
  // Scan camelCase and punctuation-separated aliases; fused adjacent tokens
  // also catch "x_videos_channel" without stripping the trailing boundary.
  // Limit the window to four tokens and the key to 100 characters.
  if(key.length>100)return false;
  const spacedKey=key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_.-]+/g,' ');
  const compactKey=spacedKey.replace(/\s+/gu,'');
  if(!isEditorialTrendAllowed(spacedKey)||
     (compactKey!==spacedKey&&!isEditorialTrendAllowed(compactKey)))return false;
  const pieces=spacedKey.trim().split(/\s+/u);
  for(let i=0;i<pieces.length;i++){
   let joined=pieces[i];
   for(let j=i+1;j<Math.min(i+4,pieces.length);j++){
    joined+=pieces[j];
    if(!isEditorialTrendAllowed(joined))return false;
   }
  }
  // Recognize common snake-case and camelCase destination keys.
  // Unknown feed metadata must not smuggle source URLs into observations.
  if(typeof entry==='string' &&
    /(?:url|href|src|link|uri|permalink)$/iu.test(key))
   return isEditorialSourceUrlAllowed(entry);
  return isEditorialStructuredFeedFieldAllowed(entry,budget,depth+1);
 });
}
/** Titles are labels, not documents. Fail closed on hidden or unfinished
 * markup before admitting an observation to any downstream raw-store adapter.
 * Keep ordinary comparisons such as "5 < 10" and complete inline formatting. */
function hasUnusableTitleMarkup(value:string):boolean {
 const decoded=decodeEditorialText(value);
 if(decoded===null)return true;
 if(/<\s*\/?\s*(?:style|template|noscript|head|title|textarea|iframe)\b/iu.test(decoded))return true;
 const stripped=decoded.replace(/<!--[\s\S]*?-->|<\/?[a-z](?:"[^"]*"|'[^']*'|[^<>"'])*>/giu,'');
 return /<\s*(?:[a-z]|\/\s*[a-z]|!|\?)/iu.test(stripped);
}
/** Apply the same visible-title and markup admission rule to archive and draft inputs. */
export function isEditorialTitleAllowed(title:unknown):title is string {
 return isEditorialTrendAllowed(title)&&!hasUnusableTitleMarkup(title);
}
export function isEditorialObservationAllowed(item:EditorialObservation):boolean {
 if(!item||typeof item!=='object')return false;
 const title=item.title??item.name??item.term;
 if(!isEditorialTitleAllowed(title))return false;
 for(const field of ['title','name','term'] as const){
  const value=item[field];
  if(typeof value==='string'&&hasUnusableTitleMarkup(value))return false;
 }
 for(const field of ['title','name','term','source','artist','publisher','provider','channel','author','platform','byline'] as const){
  if(item[field]!==undefined&&!isEditorialTrendAllowed(item[field]))return false;
 }
 // Raw feeds often hide excluded source terms in captions, excerpts or bodies
 // while displaying a harmless title. Check them before any aggregation or
 // future raw persistence. Blank optional fields mean no supplied text.
 for(const field of ['description','excerpt','summary','caption','content','subtitle','body','text'] as const){
  const value=item[field];
  if(value!==undefined&&value!==null&&value!==''&&!isEditorialTrendAllowed(value))return false;
 }
 // Keep external media/source destinations distinct from the local detail URL,
 // but never admit an unsafe one simply because the headline was legitimate.
 // Common RSS/JSON feed aliases are screened as well: a clean title must not
 // allow an excluded source to pass through `permalink` or `thumbnail_url`.
 for(const field of ['url','sourceUrl','mediaUrl','imageUrl','originalUrl','link',
   'permalink','canonicalUrl','thumbnailUrl','videoUrl','postUrl',
   'source_url','media_url','image_url','original_url','video_url','thumbnail_url'] as const){
  const value=item[field];
  if(value!==undefined&&!isEditorialSourceUrlAllowed(value))return false;
 }
 // Feed libraries expose media links as arrays/objects, not just flat URLs.
 // Unknown nested markup or source destinations must fail closed as well.
 const budget={nodes:0};
 for(const field of ['enclosure','enclosures','links','attachments','media',
   'media_content','media_thumbnail','image','thumbnail','media:content','media:thumbnail'] as const){
  if(!isEditorialStructuredFeedFieldAllowed(item[field],budget))return false;
 }
 // Fail closed for *every* extra provider field, not only known RSS aliases.
 // Shadow input may contain arbitrary nested JSON metadata. Validate the full
 // bounded envelope before a caller can persist an original observation;
 // this does not itself connect the live WordPress collector.
 if(!isEditorialStructuredFeedFieldAllowed(item,{nodes:0}))return false;
 return true;
}
export function filterTrendObservations<T extends EditorialObservation>(items:readonly T[]):T[] {
 return items.filter(isEditorialObservationAllowed);
}
