/** Deterministic, side-effect-free trend snapshot preparation. No PHP/WordPress calls. */
import {isEditorialTrendAllowed,isEditorialSourceUrlAllowed,normalizeTrendText,decodeEditorialText} from './trend-policy.mts';
export type TrendRecord={country:string;term:string;source:string;observedAt:string;score?:number;sourceUrl?:string;url?:string};
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
 return decoded.replace(/<[^>]{0,256}>/g,'').normalize('NFKC')
  .replace(/[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu,'')
  .replace(/[\u0000-\u001f\u007f]/gu,' ')
  .replace(/\s+/gu,' ').trim();
}
function canonicalDisplay(a:string,b:string):string {
 // Pick the same display label regardless of the order sources are received.
 const x=a.normalize('NFKC').trim(),y=b.normalize('NFKC').trim();
 return x.localeCompare(y,'en')<=0?x:y;
}
export function makeTrendSnapshot(country:string,day:string,rows:readonly TrendRecord[]):TrendSnapshot {
 if(!COUNTRIES.has(country)||!DAY.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw new Error('invalid_country_or_day');
 if(rows.length>2000)throw new Error('too_many_trends');
 const map=new Map<string,{term:string;sources:Set<string>;score:number|null}>();
 for(const row of rows){
  if(!row||typeof row!=='object'||row.country!==country||typeof row.term!=='string'||typeof row.source!=='string'||typeof row.observedAt!=='string')continue;
  const d=new Date(row.observedAt);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)continue;
  // Reject before normalization, aggregation, hashing, or any future persistence layer.
  if(!isEditorialTrendAllowed(row.term)||!isEditorialTrendAllowed(row.source)||
     (row.sourceUrl!==undefined&&!isEditorialSourceUrlAllowed(row.sourceUrl))||
     (row.url!==undefined&&!isEditorialSourceUrlAllowed(row.url)))continue;
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
 return {country,day,terms:[...map.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,v])=>({key,term:v.term,sources:[...v.sources].sort(),score:v.score}))};
}
export async function snapshotDigest(snapshot:TrendSnapshot):Promise<string>{
 const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function needsUpdate(previousDigest:string|null,nextDigest:string):boolean{return previousDigest!==nextDigest;}
