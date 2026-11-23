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

test('structured RSS enclosures and Atom/media link arrays cannot bypass editorial admission',()=>{
 const safe={term:'أسواق السودان',source:'google',
  enclosure:{url:'https://example.com/market.mp4',type:'video/mp4',length:1024,caption:''},
  links:[{href:'https://example.com/markets',rel:'alternate'}],
  'media:thumbnail':{url:'https://example.com/photo.jpg'}};
 const blocked=[
  {...safe,enclosure:{url:'https://onlyfans.com/clip',type:'video/mp4'}},
  {...safe,enclosures:[{url:'https://example.com/ok.jpg'},{url:'https://pornhub.com/a.jpg'}]},
  {...safe,links:[{rel:'alternate',href:'javascript:alert(1)'}]},
  {...safe,media:{content:[{url:'https://example.com/ok.jpg'},{url:'https://onlyfans.com/thumb'}]}},
  {...safe,'media:content':{url:'https://example.com/%70ornhub'}},
  {...safe,attachments:[{url:'https://example.com',caption:'OnlyFans'}]},
  {...safe,image:{src:'http://example.com/image.jpg'}},
  {...safe,thumbnail:'data:image/svg+xml;base64,PHN2Zz4='},
  {...safe,links:[{href:'https://example.com',label:'OnlyFans'}]},
  {...safe,enclosure:{url:'https://example.com',description:'<script>alert(1)</script>'}}
 ];
 assert.deepEqual(filterTrendObservations([safe,...blocked]),[safe]);
 const cyclic:any={url:'https://example.com'};cyclic.child=cyclic;
 assert.deepEqual(filterTrendObservations([{...safe,media:cyclic}]),[]);
 const excessive={...safe,links:Array.from({length:25},()=>({href:'https://example.com'}))};
 assert.deepEqual(filterTrendObservations([excessive]),[]);
});

test('entity-encoded and invisible joiners cannot disguise excluded names or unsafe schemes',()=>{
 const blocked=[
  'Only&shy;Fans',
  'Only&NoBreak;Fans',
  'Only&zwj;Fans',
  'Only&#8288;Fans',
  'Only\u034FFans',
  'Only\uFE0FFans',
  'p&shy;ornhub',
  'حصيلة السودان <a href="java&Tab;script:alert(1)">المصدر</a>',
  'حصيلة الصومال <img src="java&NewLine;script:alert(1)">',
  'حصيلة جيبوتي <a href="java\u2060script:alert(1)">الخبر</a>',
 ];
 for(const value of blocked)assert.equal(isEditorialTrendAllowed(value),false,value);
 for(const value of ['أسواق السودان &copy; 2026','مؤشرات الصومال','أخبار جيبوتي','حالة الطقس في جزر القمر'])
  assert.equal(isEditorialTrendAllowed(value),true,value);
 const good={term:'أخبار محلية',source:'google'};
 assert.deepEqual(filterTrendObservations([good,{...good,caption:'Only&shy;Fans'},{
   ...good,media:{caption:'Only&NoBreak;Fans'}}]),[good]);
});


test('unknown nested feed metadata and camelCase URLs cannot bypass editorial admission',()=>{
 const safe={title:'أخبار الأسواق',source:'google',country:'sd',observedAt:'2026-11-22T09:00:00Z',
  extra:{labels:['اقتصاد','أسواق'],trackingUrl:'https://example.com/markets'}};
 const blocked=[
  {...safe,extra:{sponsor:'OnlyFans'}},
  {...safe,analytics:{trackingUrl:'https://pornhub.com/ref'}},
  {...safe,extra:{links:[{targetUrl:'https://onlyfans.com/channel'}]}},
  {...safe,other:{text:'porn%68ub'}},
  {...safe,extra:{brand:'Only&shy;Fans'}},
  {...safe,extra:{destinationUrl:'javascript:alert(1)'}},
  {...safe,extra:{tags:Array.from({length:129},(_,i)=>'label'+i)}}
 ];
 assert.deepEqual(filterTrendObservations([safe,...blocked]),[safe]);
});


test('provider metadata keys cannot carry prohibited names or encoded aliases',()=>{
 const safe={term:'رصد الأسواق',source:'google',
  extra:{trackingUrl:'https://example.com/markets','media:thumbnail':{url:'https://example.com/photo.jpg'}}};
 const rejected=[
  {...safe,extra:{OnlyFans:'معلومة عادية'}},
  {...safe,analytics:{pornhubTrackingUrl:'https://example.com/markets'}},
  {...safe,extra:{'p%6frnhub':'وصف بريء'}},
  {...safe,extra:{'OnlyFansCampaign':2}},
  {...safe,extra:{'Only&shy;Fans':'بيانات'}}
 ];
 assert.deepEqual(filterTrendObservations([safe,...rejected]),[safe]);
});

test('separator-obfuscated excluded brands in feed keys fail pre-admission across six countries',()=>{
 const countries=['sd','so','dj','km','sa','eg'];
 for(const country of countries){
  const safe={term:'مؤشرات الأسواق',source:'google',country,
   extra:{tracking_url:'https://example.com/markets',source_name:'إحصاءات محلية',
    'media:thumbnail':{url:'https://example.com/cover.jpg'}}};
  const rejected=[
   {...safe,extra:{only_fans_campaign:'بيانات محايدة'}},
   {...safe,extra:{'Only-Fans-Placement':'بيانات محايدة'}},
   {...safe,extra:{'Only.Fans':'بيانات محايدة'}},
   {...safe,extra:{'x_videos_channel':'بيانات محايدة'}},
   {...safe,extra:{'x.n.x.x':'بيانات محايدة'}},
   {...safe,media:{items:[{'only_fans_ref':'https://example.com/markets'}]}}
  ];
  assert.deepEqual(filterTrendObservations([safe,...rejected]),[safe],country);
 }
});


test('HTML5 punctuation entities cannot conceal executable markup or excluded brands',()=>{
 const blocked=[
  'حصيلة السودان <a href="javascript&colon;alert(1)">التفاصيل</a>',
  'حصيلة الصومال <img src="data&colon;text/html;base64,QQ==">',
  'حصيلة جيبوتي <div style="background:url&lpar;data&colon;text/html;base64,QQ==&rpar;">موجز</div>',
  'حصيلة جزر القمر <a href="https&colon;&sol;&sol;only&period;fans.com">المصدر</a>',
  'مصادر السعودية only&lowbar;fans',
  'مصادر مصر only&hyphen;fans',
  'تقرير الأسواق p&period;o&period;r&period;n&period;h&period;u&period;b'
 ];
 for(const title of blocked)assert.equal(isEditorialTrendAllowed(title),false,title);
 for(const title of [
  'المؤشر &colon; ارتفاع الأسعار في السودان',
  'نسبة 25% في جزر القمر',
  'التجارة &amp; الاقتصاد',
  'مسار &sol; الأسواق المحلية'
 ])assert.equal(isEditorialTrendAllowed(title),true,title);
});


test('quoted angle brackets do not conceal later executable attributes in six-country feeds',()=>{
 const cases=[
  ['السعودية','<img alt=">" onerror=alert(1)>'],
  ['مصر',"<img alt='>' onload=alert(1)>"],
  ['السودان','<svg data-note="المقارنة > أمس" onload=alert(1)>'],
  ['الصومال','<a href="https://example.com/search?q=a>b" onclick="alert(1)">قراءة</a>'],
  ['جيبوتي',"<iframe title='لقطة > تفاصيل' onload=alert(1)></iframe>"],
  ['جزر القمر','<img alt="أسعار > توقعات" onerror = alert(1)>']
 ] as const;
 for(const [country,markup] of cases){
  const unsafe=country+' '+markup;
  assert.equal(isEditorialTrendAllowed(unsafe),false,country);
  const normal=country+' <img alt="سعر > توقع" src="https://example.com/cover.jpg">';
  assert.equal(isEditorialTrendAllowed(normal),true,country+' safe quoted comparison');
  const safe={term:country+' نتائج الأسواق',source:'news'};
  assert.deepEqual(filterTrendObservations([safe,{...safe,term:unsafe}]),[safe],country);
 }
 // The 4 KiB bound applies to a complete quote-aware tag, not only the
 // truncated portion preceding an angle bracket inside an attribute value.
 const oversized='أخبار السودان <img alt=">" data-note="'+ 'a'.repeat(4100) +'">';
 assert.equal(isEditorialTrendAllowed(oversized),false);
});
