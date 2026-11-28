/** Deterministic, side-effect-free trend snapshot preparation. No PHP/WordPress calls. */
import {isEditorialTrendAllowed,isEditorialObservationAllowed,normalizeTrendText,decodeEditorialText} from './trend-policy.mts';
export type TrendRecord={country:string;term:string;source:string;observedAt:string;score?:number;sourceUrl?:string;url?:string;description?:unknown;excerpt?:unknown;summary?:unknown;caption?:unknown;content?:unknown;mediaUrl?:unknown;imageUrl?:unknown;originalUrl?:unknown;link?:unknown;
 provider?:unknown;channel?:unknown;author?:unknown;platform?:unknown;byline?:unknown;
 subtitle?:unknown;body?:unknown;text?:unknown;
 permalink?:unknown;canonicalUrl?:unknown;thumbnailUrl?:unknown;videoUrl?:unknown;postUrl?:unknown;
 source_url?:unknown;media_url?:unknown;image_url?:unknown;original_url?:unknown;video_url?:unknown;thumbnail_url?:unknown;
 enclosure?:unknown;enclosures?:unknown;links?:unknown;attachments?:unknown;
 media?:unknown;media_content?:unknown;media_thumbnail?:unknown;image?:unknown;thumbnail?:unknown;
 'media:content'?:unknown;'media:thumbnail'?:unknown};
export type TrendSnapshot={country:string;day:string;terms:Array<{key:string;term:string;sources:string[];score:number|null}>};
const COUNTRIES=new Set('sa ae eg kw qa bh om jo lb iq sy sd ps ye ly tn dz ma mr so dj km'.split(' '));
const DAY=/^\d{4}-\d{2}-\d{2}$/;
/** Normalize aliases as the editorial gate does, including hidden bidi marks and entities. */
export function normalizeTrendKey(value:string):string {
 return normalizeTrendText(value);
}
/** Snapshot display labels are plain Unicode text, not HTML from third-party sources. */
function cleanTrendDisplay(value:string):string {
 const decoded=decodeEditorialText(value);
 if(decoded===null)return '';
 // Match the archive display policy: never retain hidden document fragments.
 if(/<\s*\/?\s*(?:style|template|noscript|head)\b/iu.test(decoded))return '';
 // Preserve visible block boundaries, but join words split by inline markup.
 // Strip complete quoted tags and comments before deriving display and digest.
 return decoded.replace(/<!--[\s\S]*?-->|<\/?[a-z](?:"[^"]*"|'[^']*'|[^<>"'])*>/giu,tag=>/^<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)(?=[\s/>])/iu.test(tag)?' ':'').normalize('NFKC')
  // Match the editorial key's invisible-character coverage to avoid retaining
  // visually identical variants and generating unnecessary snapshot writes.
  .replace(/\p{Default_Ignorable_Code_Point}/gu,'')
  .replace(/[\u0000-\u001f\u007f]/gu,' ')
  .replace(/\s+/gu,' ').trim();
}
function canonicalDisplay(a:string,b:string):string {
 // Pick the same display label regardless of the order sources are received.
 const x=a.normalize('NFKC').trim(),y=b.normalize('NFKC').trim();
 // ICU collation can equate distinct strings; use a stable tie-break.
 const order=x.localeCompare(y,'en');
 return order<0||(order===0&&x<=y)?x:y;
}
export function makeTrendSnapshot(country:string,day:string,rows:readonly TrendRecord[]):TrendSnapshot {
 if(!COUNTRIES.has(country)||!DAY.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw new Error('invalid_country_or_day');
 if(rows.length>2000)throw new Error('too_many_trends');
 const map=new Map<string,{term:string;sources:Set<string>;score:number|null}>();
 for(const row of rows){
  if(!row||typeof row!=='object'||row.country!==country||typeof row.term!=='string'||typeof row.source!=='string'||typeof row.observedAt!=='string')continue;
  // Reject ambiguous local times and calendar dates that Date silently rolls over.
  // An explicit zone keeps the UTC archive day independent of the runtime timezone.
  const timestamp=/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(row.observedAt);
  if(!timestamp)continue;
  const calendarDate=new Date(timestamp[1]+'T00:00:00Z');
  if(!Number.isFinite(calendarDate.getTime())||calendarDate.toISOString().slice(0,10)!==timestamp[1])continue;
  const d=new Date(row.observedAt);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)continue;
  // Reject before normalization, aggregation, hashing, or any future persistence layer.
  if(!isEditorialObservationAllowed(row))continue;
  const display=cleanTrendDisplay(row.term);
  // Revalidate decoded display, before retaining it in any prospective raw snapshot.
  if(!isEditorialTrendAllowed(display))continue;
  const key=normalizeTrendKey(display);
  if(!key||key.length>180||display.length>240)continue;
  const source=row.source.trim().toLowerCase();
  if(!/^[a-z0-9-]{2,40}$/.test(source))continue;
  const score=typeof row.score==='number'&&Number.isFinite(row.score)&&row.score>=0?Math.round(row.score):null;
  const prev=map.get(key);
  if(prev){prev.term=canonicalDisplay(prev.term,display);prev.sources.add(source);if(score!==null)prev.score=Math.max(prev.score??0,score)}
  else map.set(key,{term:display,sources:new Set([source]),score});
 }
 return {country,day,terms:[...map.entries()].sort(([a],[b])=>a.localeCompare(b,'en')||(a<b?-1:a>b?1:0)).map(([key,v])=>({key,term:v.term,sources:[...v.sources].sort(),score:v.score}))};
}
export async function snapshotDigest(snapshot:TrendSnapshot):Promise<string>{
 const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function needsUpdate(previousDigest:string|null,nextDigest:string):boolean{return previousDigest!==nextDigest;}
