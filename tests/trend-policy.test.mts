import test from 'node:test';
import assert from 'node:assert/strict';
import {isEditorialTrendAllowed,filterTrendObservations} from '../src/trend-policy.mts';
test('blocks known explicit Arabic and English terms without expanding partial matches',()=>{
 for(const name of ['سكس بستلس','ميا خليفة','آمارنا ميلر','.xxx','OnlyFans trends','sex pistols','pornography'])
  assert.equal(isEditorialTrendAllowed(name),false,name);
});
test('retains legitimate country trends and unrelated names',()=>{
 for(const name of ['السودان','الصومال','السعودية','مصر','Essex county','sextant','السد ضد لوسيل'])
  assert.equal(isEditorialTrendAllowed(name),true,name);
});
test('fails closed for missing or non-text title',()=>{
 for(const value of ['',null,undefined,123])assert.equal(isEditorialTrendAllowed(value),false);
});
test('drops unsafe observed title, artist or publisher without mutating input',()=>{
 const items=[{title:'السد ضد لوسيل'},{title:'ميا خليفة'},{title:'خبر',artist:'آمارنا ميلر'},{title:'خبر',publisher:'OnlyFans'}];
 assert.deepEqual(filterTrendObservations(items).map(x=>x.title),['السد ضد لوسيل']);
 assert.equal(items.length,4);
});

test('decodes WordPress numeric and named entities for display without HTML rendering',async()=>{
 const {decodeHtmlEntities}=await import('../src/trend-policy.mts');
 assert.equal(decodeHtmlEntities('Garee2a Awy &#8211; A COLORS SHOW'),'Garee2a Awy – A COLORS SHOW');
 assert.equal(decodeHtmlEntities('الماء &amp; الطقس'),'الماء & الطقس');
 assert.equal(decodeHtmlEntities('النشرة &hellip;'),'النشرة …');
});
test('encoded and zero-width obfuscation cannot bypass editorial gate',()=>{
 for(const term of ['p&#111;rn','p&amp;#111;rn','p&amp;amp;#111;rn','p&amp;amp;amp;amp;#111;rn','p&amp;amp;amp;amp;amp;amp;amp;#111;rn','&#x73;&#x65;&#x78;','Only<span>Fans</span>','س\u200Dكس','&#x633;&#x643;&#x633;'])
  assert.equal(isEditorialTrendAllowed(term),false,term);
 for(const term of ['السودان','الصومال','Essex county','الطقس &#8211; اليوم'])
  assert.equal(isEditorialTrendAllowed(term),true,term);
});

test('conflicting title and name fields cannot conceal an excluded observation',()=>{
 const rows=[{title:'رياضة محلية',name:'pornography'},{title:'pornography',name:'رياضة محلية'},
  {title:'رياضة محلية',name:'الرياضة اليوم'}];
 assert.deepEqual(filterTrendObservations(rows),[rows[2]]);
});


test('raw trend observations are checked before persistence, including term/source and both URL aliases',()=>{
 const safe={term:'أخبار السودان',source:'google',sourceUrl:'https://trends.google.com/trends/explore?q=sudan'};
 const forbiddenTerm={...safe,term:'آمارنا ميلر'};
 const forbiddenSource={...safe,source:'pornhub'};
 const forbiddenHref={...safe,url:'https://onlyfans.com'};
 const conflicting={...safe,title:'طقس اليوم',term:'OnlyFans'};
 assert.deepEqual(filterTrendObservations([safe,forbiddenTerm,forbiddenSource,forbiddenHref,conflicting]),[safe]);
});

test('raw text policy peels layered percent and HTML encoding before admitting a label',()=>{
 for(const term of [
  'porn%68ub','p%6frnhub','only%252566ans',
  'only&amp;#37;66ans','%70ornhub','porn%25252568ub',
  'https://example.com/%FF','only%252525252525252566ans'
 ])assert.equal(isEditorialTrendAllowed(term),false,term);
 for(const term of [
  'نمو 25% في مصر','الطقس%20اليوم','السودان','الصومال','جيبوتي','جزر القمر',
  'السوق &amp; الاقتصاد'
 ])assert.equal(isEditorialTrendAllowed(term),true,term);
});
test('filter rejects encoded raw source, term, and conflicting fields without mutating observations',()=>{
 const safe={title:'الطقس',term:'نمو 25% في مصر',source:'google'};
 const blocked=[
  {...safe,term:'porn%68ub'},
  {...safe,title:'only%252566ans'},
  {...safe,source:'porn%68ub'},
  {...safe,name:'only&amp;#37;66ans'}
 ];
 assert.deepEqual(filterTrendObservations([safe,...blocked]),[safe]);
});

test('checks excluded source URLs hidden inside HTML attributes before stripping tags',()=>{
 const legitimate='نشرة الأسواق <a href="https://example.com/finance">التفاصيل</a>';
 assert.equal(isEditorialTrendAllowed(legitimate),true);
 for(const title of [
  'نشرة الأسواق <a href="https://onlyfans.com/creator">التفاصيل</a>',
  'نشرة الأسواق <img src="https://pornhub.com/preview.jpg">',
  'نشرة الأسواق &lt;a href="https://onlyfans.com"&gt;المصدر&lt;/a&gt;',
  'نشرة الأسواق <a href="https://example.com/%70ornhub">الرابط</a>'
 ])assert.equal(isEditorialTrendAllowed(title),false,title);
});
