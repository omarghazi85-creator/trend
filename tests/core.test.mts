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

test('editorial gate rejects prohibited headline before creating a draft',()=>{
 assert.throws(()=>validateCandidate({...base,title:'ترند سكس بستلس في المنصات'}),/editorial_title_blocked/);
 assert.throws(()=>validateCandidate({...base,title:'تفاعل مع آمارنا ميلر في الشبكات'}),/editorial_title_blocked/);
});
test('editorial gate rejects prohibited body and excerpt, even when headline looks safe',()=>{
 assert.throws(()=>validateCandidate({...base,content:'<p>خبر مهم عن onlyfans. </p>'+'نص توضيحي '.repeat(60)}),/editorial_content_blocked/);
 assert.throws(()=>validateCandidate({...base,excerpt:'تغطية تفاصيل ميا خليفة'}),/editorial_excerpt_blocked/);
});
test('editorial gate preserves unrelated topics and substrings',()=>{
 const legitimate={...base,title:'تطور النشاط البحري في مقاطعة Essex'};
 assert.equal(validateCandidate(legitimate).slug,base.slug);
});

test('draft slug gate preserves legitimate country URLs and unrelated substrings',()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  for(const slug of [country+'-technology-news',country+'-essex-research']){
   assert.equal(validateCandidate({...base,slug}).slug,slug);
  }
 }
});


test('draft title admission rejects hidden and incomplete markup before synchronization',()=>{
 for(const title of [
  "خبر محلي <template>نص مخفي</template>",
  "خبر محلي <style>hidden</style>",
  "خبر محلي <iframe src=\"https://bbc.com\"></iframe>",
  "خبر محلي <textarea>نص مخفي</textarea>",
  "خبر محلي <noscript>نص مخفي</noscript>",
  "خبر محلي <b",
  "خبر محلي &lt;template&gt;نص مخفي&lt;/template&gt;"
]){
  assert.throws(()=>validateCandidate({...base,title}),/editorial_title_blocked/);
 }
 for(const title of [
  "خبر تقني مؤكد ومراجع تحريرياً",
  "أخبار <b>السودان</b> اليوم",
  "مقارنة 5 < 10 في دراسة حديثة",
  "AI: خبر تقني من جيبوتي",
  "Actualités des Comores",
  "أخبار الصومال اليوم",
  "تحديث الأسواق في مصر",
  "أخبار السعودية اليوم"
]){
  assert.equal(validateCandidate({...base,title}).title,title);
 }
});


test('technology word minimum excludes hidden comments and punctuation-only padding',async()=>{
 const {countEditorialWords}=await import('../src/core.mts');
 const short='خبر تقني '.repeat(200);
 for(const padding of [
  '<!-- > '+'كلمات مخفية '.repeat(100)+'-->',
  '! ؟ ، — '.repeat(100),
  '<!-- > '+'كلمات مخفية '.repeat(100)
 ]){
  assert.equal(countEditorialWords(short+padding),400);
  assert.throws(()=>validateCandidate({...base,categoryIds:[101],content:short+padding}),/technology_article_below_500_words/);
 }
 assert.equal(countEditorialWords('<p>Actualités des Comores</p> — 2026'),4);
 assert.equal(countEditorialWords('أخبار السودان والصومال وجيبوتي ومصر والسعودية'),6);
 assert.equal(countEditorialWords('خبر تقني '.repeat(250)),500);
 assert.equal(countEditorialWords('<p>خبر&nbsp;تقني</p>'),2);
 assert.equal(countEditorialWords('\u200b \u0301 ! ؟'),0);
 assert.equal(countEditorialWords('AI 2026: 25% نمو'),4);
 assert.equal(validateCandidate({...base,categoryIds:[101],content:'خبر تقني '.repeat(250)}).categoryIds?.[0],101);
});


test('technology count ignores quoted attributes and nested non-visible containers',async()=>{
 const {countEditorialWords}=await import('../src/core.mts');
 const short='خبر تقني '.repeat(200);
 const filler='كلمات مخفية '.repeat(100);
 for(const padding of [
  '<p data-description="> '+filler+'"> </p>',
  '<template>'+filler+'</template>',
  '<template><template>'+filler+'</template>'+filler+'</template>',
  '<noscript>'+filler+'</noscript>',
  '<template>'+filler,
  '<style data-info=">">'+filler+'</style>'
 ]){
  assert.equal(countEditorialWords(short+padding),400);
  assert.throws(()=>validateCandidate({...base,categoryIds:[101],content:short+padding}),/technology_article_below_500_words/);
 }
 assert.equal(countEditorialWords('<p title="a > b">أخبار السودان</p><template>hidden</template><p>جيبوتي</p>'),3);
 assert.equal(countEditorialWords('<p>مقارنة 5 < 10</p>'),3);
});


test('technology word count preserves inline continuity and block boundaries',async()=>{
 const {countEditorialWords}=await import('../src/core.mts');
 for(const word of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر','Comores']){
  const chars=Array.from(word);
  assert.equal(countEditorialWords(chars[0]+'<em>'+chars.slice(1).join('')+'</em>'),1);
 }
 for(const [html,count] of [
  ['تق<b>ني</b>',1],['tech<em>nology</em>',1],['inno<!--note-->vation',1],
  ['خبر<template>ignored</template>تقني',1],
  ['<p>خبر</p><p>تقني</p>',2],['خبر<br>تقني',2],
  ['<td>خبر</td><td>تقني</td>',2]
 ] as const)assert.equal(countEditorialWords(html),count,html);
 const padded='خبر تقني '.repeat(200)+'تق<b>ني</b> '.repeat(50);
 assert.equal(countEditorialWords(padded),450);
 assert.throws(()=>validateCandidate({...base,categoryIds:[101],content:padded}),/technology_article_below_500_words/);
 assert.equal(countEditorialWords('خبر تقني '.repeat(250)),500);
});


test('technology count decodes character references without creating artificial words',async()=>{
 const {countEditorialWords}=await import('../src/core.mts');
 for(const name of ['السعودية','مصر','السودان','الصومال','جيبوتي','Comores']){
  const chars=Array.from(name);
  const encoded=chars.map((ch,i)=>i===1?'&#'+ch.codePointAt(0)+';':ch).join('');
  assert.equal(countEditorialWords(encoded),1,encoded);
  assert.equal(countEditorialWords(chars.map(ch=>'&#'+ch.codePointAt(0)+';').join('')),1);
 }
 for(const [html,count] of [
  ['تق&#1606;ي',1],['tech&#110;ology',1],['d&#233;veloppement',1],
  ['خبر&nbsp;تقني',2],['خبر&#32;تقني',2],['خبر&thinsp;تقني',2],
  ['&mdash; &copy; &hellip; &reg;',0],['تق&shy;ني',1],['تق&#8203;ني',1],
  ['<p>خبر</p><p>تقني</p>',2],['<p>مقارنة 5 < 10</p>',3],
  ['AI 2026: 25% نمو',4],['Actualités des Comores',3]
 ] as const)assert.equal(countEditorialWords(html),count,html);
 const short='خبر تقني '.repeat(200);
 for(const [padding,expected] of [['تق&#1606;ي '.repeat(50),450],['&copy; '.repeat(100),400]] as const){
  assert.equal(countEditorialWords(short+padding),expected);
  assert.throws(()=>validateCandidate({...base,categoryIds:[101],content:short+padding}),/technology_article_below_500_words/);
 }
 assert.equal(validateCandidate({...base,categoryIds:[101],content:'خبر تقني '.repeat(250)}).categoryIds?.[0],101);
});
