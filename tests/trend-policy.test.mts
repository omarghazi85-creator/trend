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
 for(const term of ['p&#111;rn','p&amp;#111;rn','&#x73;&#x65;&#x78;','Only<span>Fans</span>','س\u200Dكس','&#x633;&#x643;&#x633;'])
  assert.equal(isEditorialTrendAllowed(term),false,term);
 for(const term of ['السودان','الصومال','Essex county','الطقس &#8211; اليوم'])
  assert.equal(isEditorialTrendAllowed(term),true,term);
});
