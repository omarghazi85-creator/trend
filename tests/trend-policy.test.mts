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

test('rejects executable HTML source schemes in raw and entity-encoded archives and draft bodies',()=>{
 const unsafe=[
  'حصيلة السودان <a href="javascript:alert(1)">تفاصيل</a>',
  'حصيلة الصومال <img src="data:text/html;base64,PHNjcmlwdD4=">',
  'حصيلة جيبوتي &lt;a href="java&#x0A;script:alert(1)"&gt;قراءة&lt;/a&gt;',
  'حصيلة جزر القمر <a href="java%73cript:alert(1)">متابعة</a>',
  'حصيلة السودان <a href=vbscript:msgbox(1)>مادة</a>',
  'حصيلة الصومال <form action="file:///etc/passwd">متابعة</form>',
  'حصيلة جيبوتي <img src="blob:https://example.com/abc">'
 ];
 for(const entry of unsafe)assert.equal(isEditorialTrendAllowed(entry),false,entry);
 for(const entry of [
  'حصيلة السودان <a href="https://example.com/news">تفاصيل</a>',
  'حصيلة الصومال <img src="https://example.com/photo.jpg">',
  'حصيلة جيبوتي <a href="/trend-archive/dj-search-2026-11-21">التفاصيل</a>',
  'أسعار البيانات 25% في جزر القمر'
 ])assert.equal(isEditorialTrendAllowed(entry),true,entry);
});

test('rejects concealed media and CSS protocols before raw trend admission, preserving HTTPS candidates',()=>{
 const unsafe=[
  'حصيلة السودان <img srcset="https://example.com/a.jpg 1x, javascript:alert(1) 2x">',
  'حصيلة الصومال <source srcset="data:image/svg+xml;base64,PHN2Zz4= 2x">',
  'حصيلة جيبوتي <img data-srcset="https://example.com/a.jpg 1x, java%73cript:alert(1) 2x">',
  'حصيلة جزر القمر <video poster="blob:https://example.com/id"></video>',
  'حصيلة السودان <a data-href="vbscript:msgbox(1)">المصدر</a>',
  'حصيلة جيبوتي <img data-src="data:text/html;base64,PHNjcmlwdD4=">',
  'حصيلة الصومال <div style="background-image:url(data:text/html;base64,PHNjcmlwdD4=)">معلومة</div>',
  'حصيلة جزر القمر &lt;div style="background-image:url(java&#x73;cript:alert(1))"&gt;حصيلة&lt;/div&gt;'
 ];
 for(const title of unsafe)assert.equal(isEditorialTrendAllowed(title),false,title);
 const safe=[
  'حصيلة السودان <img srcset="https://example.com/a.jpg 1x, https://example.com/b.jpg 2x">',
  'حصيلة الصومال <video poster="https://example.com/cover.png"></video>',
  'حصيلة جيبوتي <div style="background-image:url(https://example.com/graph.png)">ملخص</div>',
  'حصيلة جزر القمر <a data-href="/trend-archive/km-search-2026-11-21">التفاصيل</a>'
 ];
 for(const title of safe)assert.equal(isEditorialTrendAllowed(title),true,title);
 const rows=[{term:'نشرة السودان',source:'news'},{term:unsafe[0],source:'news'},{term:unsafe[6],source:'news'}];
 assert.deepEqual(filterTrendObservations(rows),[rows[0]]);
});

test('CSS-escaped external destinations and blocked terms cannot bypass source admission',()=>{
 const bad=[
  'حصيلة السودان <div style="background:url(ja\\76 ascript:alert(1))">تفاصيل</div>',
  'حصيلة الصومال <div style="background:ur\\6c(data:text/html;base64,QQ==)">موجز</div>',
  'حصيلة جيبوتي <div style="background:url(\\64 ata:text/html)">موجز</div>',
  'حصيلة جزر القمر <div style="background:url(https://only\\66 ans.com/cover)">موجز</div>',
  'حصيلة السودان <a href="https://only\\66 ans.com/">مادة</a>'
 ];
 for(const value of bad)assert.equal(isEditorialTrendAllowed(value),false,value);
 for(const value of [
  'حصيلة السودان <div style="color:\\23 333">تقرير</div>',
  'حصيلة الصومال <div style="background:url(https://example.com/photo.jpg)">خبر</div>'
 ])assert.equal(isEditorialTrendAllowed(value),true,value);
 const rows=[{term:'رواج جيبوتي',source:'news'},{term:bad[0],source:'news'}];
 assert.deepEqual(filterTrendObservations(rows),[rows[0]]);
});

test('blocks executable inline HTML in external observations without rejecting normal source links',()=>{
 const blocked=[
  'حصيلة السودان <img src="https://example.com/cover.jpg" onerror="alert(1)">',
  'حصيلة الصومال <svg onload=alert(1)></svg>',
  'حصيلة جيبوتي &lt;iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"&gt;&lt;/iframe&gt;',
  'حصيلة جزر القمر <script src="https://example.com/widget.js"></script>',
  'حصيلة السودان <div on\\63lick="alert(1)">خبر</div>',
  'حصيلة الصومال <object data="https://example.com/widget"></object>'
 ];
 for(const value of blocked)assert.equal(isEditorialTrendAllowed(value),false,value);
 const allowed=[
  'حصيلة السودان <img src="https://example.com/cover.jpg" alt="أسواق السودان">',
  'حصيلة الصومال <a href="/trend-archive/so-search-2026-11-22">تفاصيل</a>',
  'تقرير جيبوتي عن استخدام العبارة onload=ready في البرمجة',
  'حصيلة جزر القمر <video poster="https://example.com/photo.jpg"></video>'
 ];
 for(const value of allowed)assert.equal(isEditorialTrendAllowed(value),true,value);
 const rows=[{term:'تقرير السودان',source:'news'},{term:blocked[0],source:'news'}];
 assert.deepEqual(filterTrendObservations(rows),[rows[0]]);
});


test('common feed text and URL aliases cannot bypass pre-admission editorial filtering',()=>{
 const safe={term:'أخبار السودان',source:'google',permalink:'https://example.com/news',
   thumbnail_url:'https://example.com/cover.jpg',provider:'مصادر محلية'};
 const excluded=[
  {...safe,provider:'OnlyFans'},
  {...safe,channel:'pornhub'},
  {...safe,author:'آمارنا ميلر'},
  {...safe,platform:'pornography'},
  {...safe,byline:'OnlyFans'},
  {...safe,subtitle:'مقاطع اباحية'},
  {...safe,body:'إعلان <a href="https://onlyfans.com">خبر</a>'},
  {...safe,text:'pornography'},
  {...safe,permalink:'https://onlyfans.com/profile'},
  {...safe,canonicalUrl:'https://example.com/%70ornhub'},
  {...safe,thumbnailUrl:'https://onlyfans.com/img.jpg'},
  {...safe,videoUrl:'javascript:alert(1)'},
  {...safe,postUrl:'https://pornhub.com'},
  {...safe,source_url:'https://onlyfans.com'},
  {...safe,media_url:'https://onlyfans.com/clip'},
  {...safe,image_url:'https://onlyfans.com/cover'},
  {...safe,original_url:'https://onlyfans.com/original'},
  {...safe,video_url:'https://onlyfans.com/movie'},
  {...safe,thumbnail_url:'https://onlyfans.com/thumb'}
 ];
 assert.deepEqual(filterTrendObservations([safe,...excluded]),[safe]);
});
