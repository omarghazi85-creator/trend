import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, planCandidate, wordpressPayload } from '../src/core.mts';
const base = { title: 'خبر تقني مؤكد ومراجع تحريرياً', slug: 'technology-2026-11-11', content: '<p>'+ 'المحتوى العربي المدقق '.repeat(12)+'</p>' };
test('accepts validated item',()=>{const c=validateCandidate(base);assert.equal(c.slug,base.slug)});
test('rejects malformed slug',()=>assert.throws(()=>validateCandidate({...base,slug:'../../wp-admin'})));
test('rejects short content',()=>assert.throws(()=>validateCandidate({...base,content:'خبر قصير'})));
test('existing slug never overwritten',()=>{const c=validateCandidate(base);assert.equal(planCandidate(c,[{id:44,slug:c.slug,status:'publish'}]).action,'skip_existing')});
test('creates draft only for new slug',()=>{const c=validateCandidate(base);assert.equal(planCandidate(c,[]).action,'create_draft');assert.equal(wordpressPayload(c).status,'draft')});
test('rejects bad category IDs',()=>assert.throws(()=>validateCandidate({...base,categoryIds:[1,-3]})));
test('rejects duplicate client supplied slug content path',()=>assert.throws(()=>validateCandidate({...base,slug:'A B'})));
test('rejects unsafe non-https source',()=>assert.throws(()=>validateCandidate({...base,sourceUrl:'http://example.com'})));

test('technology category requires at least 500 article words',()=>{
 const short={...base,categoryIds:[101],content:'خبر تقني '.repeat(200)};
 assert.throws(()=>validateCandidate(short),/technology_article_below_500_words/);
 const sufficient={...base,categoryIds:[101],content:'خبر تقني '.repeat(260)};
 assert.equal(validateCandidate(sufficient).categoryIds?.[0],101);
});
test('count excludes HTML markup rather than treating tags as words',async()=>{
 const {countEditorialWords}=await import('../src/core.mts');
 assert.equal(countEditorialWords('<p>خبر تقني</p><script>hidden ignored content</script><style>ignored</style>'),2);
});
test('other editorial categories are unaffected by technology-only minimum',()=>{
 assert.equal(validateCandidate({...base,categoryIds:[15],content:'خبر مهم '.repeat(65)}).categoryIds?.[0],15);
});
