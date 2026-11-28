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

test('slash plus and bullet source aliases are blocked in six-country observations and URLs',()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  const safe={country,term:'مؤشرات الأسواق المحلية',source:'google',observedAt:'2026-11-23T10:00:00Z',sourceUrl:'https://example.org/markets'};
  const masks=['p/o/r/n/h/u/b','o+n+l+y+f+a+n+s','x•v•i•d•e•o•s','r/e/d/t/u/b/e','x/n/x/x','y/o/u/p/o/r/n','x/h/a/m/s/t/e/r'];
  const blocked=[...masks.map(label=>({...safe,description:'مصدر '+label})),{...safe,sourceUrl:'https://example.org/refs/p%2Fo%2Fr%2Fn%2Fh%2Fu%2Fb'}];
  assert.deepEqual(filterTrendObservations([safe,...blocked]),[safe],country);
 }
 for(const text of ['السعودية / الأسواق','جيبوتي + التجارة','الصومال • الأخبار','Essex county'])assert.equal(isEditorialTrendAllowed(text),true,text);
});

test('literal Unicode and hex escapes in untrusted feed labels fail closed',()=>{
 const slash=String.fromCharCode(92);
 const blocked=['p'+slash+'u006frnhub','only'+slash+'u0066ans',
  'p'+slash+'x6frnhub','only%255Cu0066ans','only'+slash+'u0026#102;ans'];
 for(const value of blocked)assert.equal(isEditorialTrendAllowed(value),false,value);
 for(const value of ['أخبار السودان','نتائج الصومال','تقرير جيبوتي',
  'تقرير '+slash+'u0627قتصادي'])
  assert.equal(isEditorialTrendAllowed(value),true,value);
});


test('visible excluded terms split by quoted markup or comments fail pre-admission across six countries',()=>{
 const countries=['sa','eg','sd','so','dj','km'];
 const masks=[
  'po<span title="سعر > أمس">rn</span>hub',
  'Only<!-- '+ 'a'.repeat(270)+' -->Fans',
  'p<span title="أمس > اليوم">o</span>rnhub',
  'س<span title="أ > ب">ك</span>س',
  'Only&lt;!-- comment &gt; hidden --&gt;Fans',
  'xn<!-- > -->xx'
 ];
 for(const [i,country] of countries.entries()){
  const safe={country,term:'نتائج <span title="سعر > أمس">الأسواق</span>',source:'news',
    sourceUrl:'https://example.com/markets'};
  const bad={...safe,term:'نتائج '+masks[i]};
  assert.equal(isEditorialTrendAllowed(bad.term),false,country);
  assert.equal(isEditorialTrendAllowed(safe.term),true,country);
  assert.deepEqual(filterTrendObservations([safe,bad]),[safe],country);
 }
});


test('invisible-only labels fail shared pre-admission across six countries',()=>{
 const hidden=['\u0301','\u05b0','\u0901','\u06d6','\u0001','\u0085',
  '\u200b\u0301','\u0640','\uFE0F','\u034F','\u{E0100}','\u0301\u200d\u05b0',
  '&#x301;','<span>\u0301</span>'];
 const countries=['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر'];
 for(const country of countries){
  const safe={title:country+' – مؤشرات الأسواق',source:'google'};
  const invalid=hidden.flatMap(label=>[
   {...safe,title:label},
   {...safe,name:label},
   {...safe,term:label}
  ]);
  for(const label of hidden)assert.equal(isEditorialTrendAllowed(label),false,label);
  assert.deepEqual(filterTrendObservations([safe,...invalid]),[safe],country);
 }
 for(const label of [...countries,'Économie','⚽','2026','الطَّقس'])
  assert.equal(isEditorialTrendAllowed(label),true,label);
});


test('combining marks and control bytes cannot conceal distinctive excluded brands across six countries',()=>{
 const blocked=["pórnhub","pórnhub","po\u0001rnhub","onlýfans","xv̧ideos","rédtube","yöuporn","x́nxx","xhamstér"];
 const legitimate=["Économie locale","Côte d’Ivoire","Somali cafés","الطَّقس","Essex county","only family news","x video editing","sextant","réduction"];
 for(const country of ["السعودية","مصر","السودان","الصومال","جيبوتي","جزر القمر"]){
  const rows=legitimate.map(title=>({title:country+' '+title,source:'google',sourceUrl:'https://example.com/markets'}));
  const rejected=blocked.flatMap(brand=>[
   {title:country+' '+brand,source:'google'},
   {title:country+' – مؤشرات الأسواق',source:brand},
   {title:country+' – مؤشرات الأسواق',source:'google',sourceUrl:'https://example.com/'+encodeURIComponent(brand)}
  ]);
  for(const brand of blocked)assert.equal(isEditorialTrendAllowed(country+' '+brand),false,brand);
  assert.deepEqual(filterTrendObservations([...rejected,...rows]),rows,country);
 }
});


test('Arabic-script combining marks beyond common harakat cannot hide excluded labels or metadata',()=>{
 const marks=['\u0610','\u061a','\u06d6','\u06e7','\u06ed','\u08d4','\u08e3','\u08f0'];
 for(const country of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر']){
  const safe={title:country+' – مُؤشِّرات الأسواق',source:'google',description:'Économie locale'};
  const blocked=marks.flatMap(mark=>[
   'س'+mark+'كس','إبا'+mark+'حي','س&#x'+mark.codePointAt(0)!.toString(16)+';كس'
  ]);
  const rows=blocked.flatMap(word=>[
   {...safe,title:country+' '+word},{...safe,source:word},{...safe,extra:{description:word}}
  ]);
  for(const word of blocked)assert.equal(isEditorialTrendAllowed(country+' '+word),false,word);
  assert.deepEqual(filterTrendObservations([...rows,safe]),[safe],country);
  for(const label of [country,'Économie locale','Côte d’Ivoire','الطَّقس','مؤشرات الأسواق','Essex county'])
   assert.equal(isEditorialTrendAllowed(label),true,label);
 }
});


test('block-level word boundaries expose split excluded labels before archive or observation admission',()=>{
 const blocked=[
  '<p>news</p><p>po<b>rn</b></p><p>today</p>',
  '<div>خبر</div><div>س<span>ك</span>س</div><div>اليوم</div>',
  '<td>actualité</td><td>porno<span>graphie</span></td><td>locale</td>',
  '<div>news</div><div>Only<b>Fans</b></div><div>today</div>',
  'خبر<br>إبا<b>حي</b><br>اليوم',
  '<li>news</li><li>p<span>orn</span></li><li>today</li>'
 ];
 const safe=[
  '<p>Essex</p><p>county</p>',
  '<p>Économie</p><p>locale</p>',
  '<div>مؤشرات</div><div>الأسواق</div>',
  '<p>Somali cafés</p><p>today</p>',
  '<p>only family</p><p>news</p>',
  '<p>5 &lt; 10</p><p>today</p>'
 ];
 for(const country of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر']){
  for(const value of blocked)assert.equal(isEditorialTrendAllowed(country+value),false,country+value);
  for(const value of safe)assert.equal(isEditorialTrendAllowed(country+value),true,country+value);
  const admitted=safe.map(description=>({title:country+' – الأسواق',description}));
  const rejected=blocked.map(description=>({title:country+' – الأسواق',description}));
  assert.deepEqual(filterTrendObservations([...rejected,...admitted]),admitted,country);
 }
});


test('hidden title attributes and CSS cannot manufacture visible archive or draft headlines',async()=>{
 const {isEditorialTitleAllowed,isEditorialObservationAllowed}=await import('../src/trend-policy.mts');
 const countries=['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر'];
 for(const country of countries){
  const rejected=[
   '<span hidden>'+country+'</span>',
   '<b HIDDEN="false">'+country+'</b>',
   '<span title="safe > label"hidden>'+country+'</span>',
   '<span style="color:red; display: none !important">'+country+'</span>',
   '<span style="visibility: collapse">'+country+'</span>',
   '<span style="content-visibility:hidden">'+country+'</span>',
   '<span style="dis/**/play:none">'+country+'</span>',
   '<span style="d\\69 splay:none">'+country+'</span>',
   '&lt;span hidden&gt;'+country+'&lt;/span&gt;'
  ];
  const safe=[
   country,'<b>'+country+'</b>','<span title="hidden">'+country+'</span>',
   '<span data-hidden="true">'+country+'</span>',
   '<span style="--display:none;color:red">'+country+'</span>',
   '<span style="display:inline;visibility:visible">'+country+'</span>'
  ];
  for(const title of rejected){
   assert.equal(isEditorialTitleAllowed(title),false,title);
   assert.equal(isEditorialObservationAllowed({title,source:'google'}),false,title);
   assert.equal(isEditorialObservationAllowed({title:country,name:title,source:'google'}),false,title);
  }
  for(const title of safe){
   assert.equal(isEditorialTitleAllowed(title),true,title);
   assert.equal(isEditorialObservationAllowed({title,source:'google'}),true,title);
  }
 }
});

test('ASCII IDNA labels cannot conceal excluded source names in six-country observations',async()=>{
 const {domainToASCII}=await import('node:url');
 const {isEditorialSourceUrlAllowed}=await import('../src/trend-policy.mts');
 for(const country of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر']){
  const safe={title:country+' – مؤشرات الأسواق',source:'google'};
  for(const label of ['pórnhub','onlyfáns','xvïdeos','rédtube','سكس','إباحي']){
   const host=domainToASCII(label)+'.com';
   const url='https://'+host+'/markets';
   const body=country+' <a href="'+url+'">المصدر</a>';
   assert.equal(isEditorialSourceUrlAllowed(url),false,url);
   assert.equal(isEditorialTrendAllowed(body),false,body);
   assert.equal(isEditorialTrendAllowed(country+' '+host),false,host);
   assert.deepEqual(filterTrendObservations([safe,{...safe,sourceUrl:url},{...safe,description:body}]),[safe]);
  }
  for(const label of ['économie','cafés','جيبوتي','السودان','Essex','sextant']){
   const host=domainToASCII(label)+'.com';
   const url='https://'+host+'/markets';
   const body=country+' <a href="'+url+'">المصدر</a>';
   const row={...safe,sourceUrl:url,description:body};
   assert.equal(isEditorialSourceUrlAllowed(url),true,url);
   assert.equal(isEditorialTrendAllowed(body),true,body);
   assert.equal(isEditorialTrendAllowed(country+' '+host),true,host);
   assert.deepEqual(filterTrendObservations([row]),[row]);
  }
 }
});


test('named Latin HTML entities cannot conceal excluded brands and preserve French display',async()=>{
 const {decodeEditorialText,isEditorialSourceUrlAllowed}=await import('../src/trend-policy.mts');
 const blocked=['p&ograve;rnhub','p&Oacute;rnhub','onlyf&aacute;ns','xv&iuml;deos','r&eacute;dtube','youp&ocirc;rn','p&amp;ouml;rnhub'];
 const safe=[
  ['&Eacute;conomie locale','Économie locale'],
  ['M&eacute;t&eacute;o du jour','Météo du jour'],
  ['C&ocirc;te d’Ivoire','Côte d’Ivoire'],
  ['&AElig;ther','Æther'],['&OElig;uvre','Œuvre'],
  ['مؤشرات الأسواق','مؤشرات الأسواق'],['5 &lt; 10','5 < 10']
 ];
 for(const country of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر']){
  const baseline={title:country+' – مؤشرات الأسواق',source:'google'};
  for(const term of blocked){
   const url='https://news.example.com/'+term;
   assert.equal(isEditorialTrendAllowed(country+' '+term),false,term);
   assert.equal(isEditorialSourceUrlAllowed(url),false,url);
   assert.deepEqual(filterTrendObservations([baseline,{...baseline,title:country+' '+term},{...baseline,description:term},{...baseline,sourceUrl:url}]),[baseline],country+' '+term);
  }
  for(const [encoded,display] of safe){
   assert.equal(decodeEditorialText(encoded),display,encoded);
   assert.equal(isEditorialTrendAllowed(country+' '+encoded),true,encoded);
   const row={...baseline,title:country+' '+encoded};
   assert.deepEqual(filterTrendObservations([row]),[row],encoded);
  }
 }
});


test('ordinary root headline prefixes remain prose without relaxing destination validation across six countries',()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'أخبار الأسواق المحلية',source:'google'};
  const labels=['Weather: local forecast','COVID-19: latest figures','Economy: Météo du jour','Sports: local fixtures'];
  for(const label of labels){
   for(const field of ['term','description','caption']){
    const row={...base,[field]:label};
    assert.deepEqual(filterTrendObservations([row]),[row],country+' '+field+' '+label);
   }
  }
  const blocked=[
   {...base,term:'javascript: alert(1)'},{...base,term:'data: text/html'},
   {...base,description:'ftp: files'},{...base,caption:'https: //news.example.com'},
   {...base,term:'Weather: OnlyFans'},{...base,description:'News: p&ograve;rnhub'},
   {...base,sourceUrl:'custom: value'},{...base,extra:{label:'custom: value'}},
   {...base,extra:{destinationUrl:'Weather: today'}},{...base,extra:{caption:'javascript: alert(1)'}}
  ];
  assert.deepEqual(filterTrendObservations([base,...blocked]),[base],country);
 }
});


test('legacy semicolonless Latin references cannot conceal excluded brands',async()=>{
 const {decodeEditorialText}=await import('../src/trend-policy.mts');
 const blocked=["p&ogravernhub","P&OgraveRNHUB","onlyf&aacutens","xv&iumldeos","r&eacutedtube","youp&ocircrn","p&amp;oumlrnhub"];
 const safe=[["&Eacuteconomie locale","Économie locale"],["M&eacutet&eacuteo du jour","Météo du jour"],["C&ocircte d’Ivoire","Côte d’Ivoire"],["&AEligther","Æther"],["&OEliguvre","&OEliguvre"],["&Scaronova","&Scaronova"],["مؤشرات الأسواق","مؤشرات الأسواق"],["5 &lt; 10","5 < 10"]];
 for(const country of ["sa","eg","sd","so","dj","km"]){
  const base={country,term:'مؤشرات الأسواق',source:'google'};
  for(const term of blocked){
   for(const field of ['term','description','publisher']){
    const row={...base,[field]:term};
    assert.deepEqual(filterTrendObservations([row]),[],country+' '+field+' '+term);
   }
  }
  for(const [encoded,display] of safe){
   assert.equal(decodeEditorialText(encoded),display,encoded);
   const row={...base,term:encoded};
   assert.deepEqual(filterTrendObservations([row]),[row],country+' '+encoded);
  }
 }
});


test('named HTML spaces cannot conceal excluded sources and preserve legitimate labels',async()=>{
 const {decodeEditorialText,normalizeTrendText}=await import('../src/trend-policy.mts');
 const entities=[['ensp','\u2002'],['emsp','\u2003'],['emsp13','\u2004'],['emsp14','\u2005'],
  ['numsp','\u2007'],['puncsp','\u2008'],['thinsp','\u2009'],['ThinSpace','\u2009'],
  ['hairsp','\u200a'],['VeryThinSpace','\u200a'],['MediumSpace','\u205f'],
  ['ThickSpace','\u205f\u200a'],['NonBreakingSpace','\u00a0']];
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'مؤشرات الأسواق',source:'google'};
  for(const [entity,space] of entities){
   const sep='&'+entity+';';
   for(const field of ['term','description','publisher']){
    for(const label of ['only'+sep+'fans','porn'+sep+'hub','x'+sep+'videos']){
     assert.deepEqual(filterTrendObservations([{...base,[field]:label}]),[],country+' '+field+' '+label);
    }
   }
   for(const [label,expected] of [['Météo'+sep+'locale','Météo'+space+'locale'],
    ['الطقس'+sep+'اليوم','الطقس'+space+'اليوم'],['March'+sep+'weather','March'+space+'weather']]){
    for(const raw of [label,label.replace('&','&amp;')]){
     assert.equal(decodeEditorialText(raw),expected);
     assert.equal(normalizeTrendText(raw),normalizeTrendText(expected));
     const row={...base,term:raw};
     assert.deepEqual(filterTrendObservations([row]),[row],country+' '+raw);
    }
   }
  }
 }
 assert.equal(decodeEditorialText('&notAnEntity123;'),'&notAnEntity123;');
});


test('nested scalar destination fields cannot bypass URL admission through non-string values',()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'Météo locale',source:'google'};
  for(const key of ['targetUrl','href','media_src','canonicalUri','permalink','trackingLink']){
   for(const value of [['/relative'],{path:'/relative'},42,true,'/relative','http://news.example.com/markets']){
    const row={...base,extra:{[key]:value}};
    assert.deepEqual(filterTrendObservations([row]),[],country+' '+key+' '+JSON.stringify(value));
   }
   for(const value of ['https://news.example.com/markets',null]){
    const row={...base,extra:{[key]:value}};
    assert.deepEqual(filterTrendObservations([row]),[row],country+' '+key);
   }
  }
  const atom={...base,extra:{link:{href:'https://news.example.com/markets'}}};
  assert.deepEqual(filterTrendObservations([atom]),[atom],country);
  for(const href of ['/relative',['/relative'],42]){
   const row={...base,extra:{link:{href}}};
   assert.deepEqual(filterTrendObservations([row]),[],country);
  }
 }
});


test('Atom link objects require real HTTPS destinations at root and nested levels in six countries',()=>{
 const good=[
  {href:'https://news.example.com/markets',rel:'alternate'},
  {url:'https://news.example.com/markets'},
  {href:'https://news.example.com/markets',url:'https://news.example.com/weather'},
  'https://news.example.com/markets'
 ];
 const bad=[
  {},{rel:'alternate'},{path:'/relative'},{href:'/relative'},{url:'/relative'},
  {href:null},{url:[]},{href:'https://news.example.com/markets',url:'http://news.example.com/weather'},
  {href:'https://news.example.com/markets',label:'OnlyFans'},['/relative'],true,42
 ];
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'Météo locale',source:'google'};
  for(const link of good){
   for(const row of [{...base,link},{...base,extra:{link}}])
    assert.deepEqual(filterTrendObservations([row]),[row],country+' '+JSON.stringify(link));
  }
  for(const link of bad){
   for(const row of [{...base,link},{...base,extra:{link}}])
    assert.deepEqual(filterTrendObservations([row]),[],country+' '+JSON.stringify(link));
  }
 }
});


test('plural Atom links require actual HTTPS destinations, including encoded nested keys',()=>{
 const safe='https://news.example.com/markets',other='https://news.example.com/weather';
 const good=[[],null,safe,{href:safe},[safe,{href:other,rel:'alternate'}],[{url:safe},{href:other,url:safe}]];
 const bad=[['/relative'],[{}],[{rel:'alternate'}],[true],[42],[null],[''],[[safe]],[{path:'/relative'}],
  {},true,'/relative',[safe,{href:'/relative'}],[{href:safe,url:'http://news.example.com/markets'}],
  [{href:safe,label:'OnlyFans'}],Array(25).fill(safe)];
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'Météo locale',source:'google'};
  for(const [values,expected] of [[good,true],[bad,false]] as const){
   for(const links of values){
    for(const row of [{...base,links},{...base,extra:{links}},{...base,extra:{'l\u200binks':links}}]){
     assert.deepEqual(filterTrendObservations([row]),expected?[row]:[],country+' '+JSON.stringify(row));
    }
   }
  }
 }
});
