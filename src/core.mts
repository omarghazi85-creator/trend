/** Pure, side-effect-free WordPress synchronization planning. */
export interface Candidate {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  categoryIds?: number[];
  featuredMediaId?: number;
  sourceUrl?: string;
}
export interface RemotePost { id:number; slug:string; status:string; }
export type Plan = { action:'create_draft' | 'skip_existing'; slug:string; reason:string };
/** Technology news must be substantive: at least 500 words of article body, excluding markup. */
export const TECHNOLOGY_CATEGORY_ID = 101;
export const TECHNOLOGY_MIN_WORDS = 500;
export const TECHNOLOGY_TARGET_WORDS = {minimum: 550,maximum: 700} as const;
export function countEditorialWords(html:string):number {
 const text=html.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,' ')
 .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi,' ')
 .replace(/<[^>]+>/g,' ')
 .replace(/&(?:nbsp|amp|lt|gt|quot|#\\d+|#x[0-9a-f]+);/gi,' ')
 .normalize('NFKC').trim();
 return text ? text.split(/\\s+/u).filter(Boolean).length : 0;
}
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/;
export function normalizeText(s:string):string {
  return s.replace(/\r\n/g,'\n').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
export function validateCandidate(input:unknown):Candidate {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('invalid_candidate');
  const x=input as Record<string,unknown>;
  if(typeof x.title!=='string' || x.title.trim().length<8 || x.title.length>220) throw new Error('invalid_title');
  if(typeof x.slug!=='string' || !SLUG_PATTERN.test(x.slug)) throw new Error('invalid_slug');
  if(typeof x.content!=='string' || normalizeText(x.content).length<120 || x.content.length>35000) throw new Error('invalid_content');
  if(x.excerpt!==undefined && (typeof x.excerpt!=='string'||x.excerpt.length>500)) throw new Error('invalid_excerpt');
  if(x.sourceUrl!==undefined && (typeof x.sourceUrl!=='string'||!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(x.sourceUrl))) throw new Error('invalid_source');
  if(x.categoryIds!==undefined && (!Array.isArray(x.categoryIds)||x.categoryIds.length>4||!x.categoryIds.every(v=>Number.isSafeInteger(v)&&v>0))) throw new Error('invalid_categories');
  if(Array.isArray(x.categoryIds)&&x.categoryIds.includes(TECHNOLOGY_CATEGORY_ID)&&countEditorialWords(x.content as string)<TECHNOLOGY_MIN_WORDS) throw new Error('technology_article_below_500_words');
  if(x.featuredMediaId!==undefined && (!Number.isSafeInteger(x.featuredMediaId)||(x.featuredMediaId as number)<1)) throw new Error('invalid_media');
  return {title:normalizeText(x.title),slug:x.slug,content:normalizeText(x.content),...(x.excerpt!==undefined?{excerpt:normalizeText(x.excerpt as string)}:{}),...(x.sourceUrl!==undefined?{sourceUrl:x.sourceUrl as string}:{}),...(x.categoryIds!==undefined?{categoryIds:x.categoryIds as number[]}:{}),...(x.featuredMediaId!==undefined?{featuredMediaId:x.featuredMediaId as number}:{})};
}
export function planCandidate(candidate:Candidate,existing:RemotePost[]):Plan {
  if(existing.some(post=>post.slug===candidate.slug)) return {action:'skip_existing',slug:candidate.slug,reason:'slug_already_exists_no_update'};
  return {action:'create_draft',slug:candidate.slug,reason:'new_slug'};
}
export function wordpressPayload(candidate:Candidate):Record<string,unknown> {
  return {title:candidate.title,slug:candidate.slug,content:candidate.content,status:'draft',...(candidate.excerpt?{excerpt:candidate.excerpt}:{}),...(candidate.categoryIds?.length?{categories:candidate.categoryIds}:{}),...(candidate.featuredMediaId?{featured_media:candidate.featuredMediaId}:{})};
}