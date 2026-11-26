import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const php=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');

test('live archive excludes unsafe titles before set_transient, REST and shortcode inherit the filter',()=>{
 assert.match(php,/function atn_lightview_archive_title_allowed\(\$title\)/);
 const preCache=php.indexOf('if (!atn_lightview_archive_title_allowed($title)) { continue; }');
 const save=php.indexOf('set_transient($key, $items, 15 * MINUTE_IN_SECONDS)');
 assert.ok(preCache>0 && save>preCache,'new transient snapshots must contain only permitted titles');
 assert.ok(php.indexOf('if (!atn_lightview_archive_content_allowed($p)) { continue; }')>preCache, 'existing page body must be scanned before caching cards');
 assert.match(php,/\$safe = array_values\(array_filter\(\$items, static function \(\$item\) \{/);
 assert.match(php,/isset\(\$item\['title'\], \$item\['link'\]\) &&\s*atn_lightview_archive_title_allowed\(\$item\['title'\]\) &&\s*atn_lightview_archive_link_allowed\(\$item\['link'\]\)/);
 assert.equal((php.match(/function atn_lightview_archive_items\(/g)||[]).length,1);
 assert.match(php,/posts_per_page'\s*=>\s*320/);
 assert.match(php,/atn_lightview_latest_v9/);
 assert.doesNotMatch(php,/wp_schedule_event\s*\(/);
});

test('PHP filtering rejects explicit terms and keeps legitimate trends without false substring matches',t=>{
 const version=spawnSync('php',['-v'],{encoding:'utf8'});
 if(version.error){t.skip('PHP CLI not installed on CI runner');return;}
 const match=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/);
 assert.ok(match,'extract executable PHP guard');
 const script='function wp_strip_all_tags($s){return strip_tags($s);} \n'+match[0]+'\n'+
  'echo json_encode(array_map("atn_lightview_archive_title_allowed", array('+
  '"السودان", "الصومال", "Essex county", "السد ضد لوسيل", "ميا خليفة", '+
  '"&#80;orn clips", "p&#111;rn news", "آمارنا ميلر", "OnlyFans", '+
  '"سيكسي", "أفلام إباحية", "كلمات البحث الرائجة في مصر", "p&amp;amp;#111;rn", "p&amp;amp;amp;amp;#111;rn", "p&amp;amp;amp;amp;amp;amp;amp;#111;rn", "السد &amp; المباراة")));';
 const result=spawnSync('php',['-r',script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[
  true,true,true,true,false,false,false,false,false,false,false,true,false,false,false,true
 ]);
});
test('PHP archive rejects punctuation-obfuscated prohibited source labels across six countries', t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard,'test the real read-only archive policy');
 const blocked=[
  'حصيلة السودان عن Only-Fans',
  'حصيلة الصومال p.o.r.n.h.u.b',
  'حصيلة جيبوتي x_videos',
  'حصيلة جزر القمر x.n.x.x',
  'حصيلة السعودية x-hamster',
  'حصيلة مصر red·tube',
  'السودان y.o.u.p.o.r.n',
  'الصومال only&#45;fans',
  'جيبوتي <a href="https://only_fans.com/news">مادة</a>'
 ];
 const allowed=[
  'حصيلة السودان', 'حصيلة الصومال', 'حصيلة جيبوتي',
  'حصيلة جزر القمر', 'حصيلة السعودية', 'حصيلة مصر',
  'Essex county', 'قراءة عن only-fansville', 'مؤشرات سوق الأخبار'
 ];
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify([...blocked,...allowed]),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[
  ...blocked.map(()=>false),...allowed.map(()=>true)
 ]);
 assert.match(php,/Version: 0\.12\.42/);
});

test('PHP archive file passes syntax check when CLI available',t=>{
 const version=spawnSync('php',['-v'],{encoding:'utf8'});
 if(version.error){t.skip('PHP CLI not installed on CI runner');return;}
 const lint=spawnSync('php',['-l',new URL('../atn-lightview.php',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(lint.status,0,lint.stderr);
});

test('WordPress archive cards display the trend period from dated slugs, with legacy cache support',t=>{
 const version=spawnSync('php',['-v'],{encoding:'utf8'});
 if(version.error){t.skip('PHP CLI not installed on CI runner');return;}
 const helper=php.match(/function atn_lightview_archive_period\(\$slug, \$published\) \{[\s\S]*?\n\}/);
 assert.ok(helper,'must extract the date parser independently of WordPress');
 const script=helper[0]+'\n'+
  'echo json_encode(array('+
  'atn_lightview_archive_period("iq-week-2026-11-09","2026-11-17"),'+
  'atn_lightview_archive_period("so-search-2026-11-19","2026-11-21"),'+
  'atn_lightview_archive_period("topic-0efefcd61ae99a2577e7e596","2026-11-21"),'+
  'atn_lightview_archive_period("so-search-2026-02-30","2026-11-21")));';
 const result=spawnSync('php',['-r',script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[
  '2026-11-09','2026-11-19','2026-11-21','2026-11-21'
 ]);
 assert.match(php,/atn_lightview_archive_period\(\$p->post_name, get_the_date\('Y-m-d', \$p\)\)/);
 assert.match(php,/atn_lightview_archive_period\(\$slug, \$item\['date'\]\)/);
 assert.match(php,/get_the_date\('c', \$p\)/);
 assert.match(php,/atn_lightview_latest_v9/);
 assert.doesNotMatch(php,/wp_schedule_event\s*\(/);
});

test('PHP archive HTML source attributes are checked before stripping, including direct detail requests',t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI not available');return;}
 const policy=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(policy,'actual PHP policy is executable');
 const input=[
  'حصيلة السودان <a href="https://onlyfans.com/creator">التفاصيل</a>',
  'حصيلة الصومال &lt;img src="https://pornhub.com/preview.jpg"&gt;',
  'حصيلة جيبوتي <a href="https://example.com/news">الأخبار</a>',
  'حصيلة جزر القمر',
  'نمو 25% في مصر'
 ];
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+policy+
  '\n echo json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify(input),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[false,false,true,true,true]);
 const start=php.indexOf('function atn_lightview_archive_items()');
 const end=php.indexOf("add_action('rest_api_init'",start);
 const scope=php.slice(start,end);
 const raw=scope.indexOf('$title = get_the_title($p);');
 const filter=scope.indexOf('if (!atn_lightview_archive_title_allowed($title))');
 const strip=scope.indexOf('$title = wp_strip_all_tags($title);');
 assert.ok(raw>=0 && filter>raw && strip>filter,'raw title must be validated before attributes are stripped');
 assert.match(php,/Version: 0\.12\.42/);
});

test('PHP archive blocks unsafe embedded URLs in archive titles and saved bodies without dropping safe media', t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const policy=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(policy,'run actual Light View policy');
 const samples=[
  'حصيلة السودان <a href="javascript:alert(1)">التفاصيل</a>',
  'حصيلة الصومال &lt;img src="data:text/html;base64,xxx"&gt;',
  'حصيلة جيبوتي <img srcset="https://example.com/a.jpg 1x, data:text/html 2x">',
  'حصيلة جزر القمر <video poster="java&#115;cript:alert(1)">عرض</video>',
  'مصر <a data-href="java%0ascript:alert(1)">مصدر</a>',
  'السعودية <div style="background:url(&quot;vbscript:bad&quot;)">ملخص</div>',
  'السودان <img data-srcset="https://example.com/ok 1x, blob:evil 2x">',
  'السودان <a href="https://example.com/news">مصدر موثوق</a>',
  'الصومال <img srcset="https://example.com/one.jpg 1x, https://example.com/two.jpg 2x">',
  'جيبوتي <video poster="https://example.com/poster.jpg">آمن</video>',
  'جزر القمر 25% نمو السياحة',
  'مصر <span style="color:#333">تقرير</span>'
 ];
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+policy+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify(samples),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[false,false,false,false,false,false,false,true,true,true,true,true]);
});

test('PHP pre-cache policy rejects escaped CSS media schemes without changing safe titles',t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard);
 const samples=[
  'حصيلة السودان <div style="background:url(ja\\76 ascript:alert(1))">خبر</div>',
  'حصيلة الصومال <div style="background:ur\\6c(data:text/html)">خبر</div>',
  'حصيلة جيبوتي <div style="background:url(\\64 ata:text/html)">خبر</div>',
  'حصيلة جزر القمر <div style="background:url(https://only\\66 ans.com/cover)">خبر</div>',
  'حصيلة السودان <a href="https://only\\66 ans.com/">خبر</a>',
  'حصيلة مصر <div style="color:\\23 333">خبر</div>',
  'حصيلة السعودية <img src="https://example.com/photo.jpg">'
 ];
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify(samples),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[false,false,false,false,false,true,true]);
});

test('PHP archive rejects active HTML event handlers and embedded documents before caching',t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard);
 const samples=[
  'حصيلة السودان <img src="https://example.com/cover.jpg" onerror="alert(1)">',
  'حصيلة الصومال <svg onload=alert(1)></svg>',
  'حصيلة جيبوتي &lt;iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"&gt;&lt;/iframe&gt;',
  'حصيلة جزر القمر <script src="https://example.com/widget.js"></script>',
  'حصيلة السودان <div on\\63lick="alert(1)">خبر</div>',
  'حصيلة الصومال <object data="https://example.com/widget"></object>',
  'حصيلة السعودية <a href="/trend-archive/sa-search-2026-11-22">مادة</a>',
  'حصيلة مصر <img src="https://example.com/image.jpg" alt="خبر">',
  'خبر عن استخدام العبارة onload=ready',
  'جزر القمر <video poster="https://example.com/cover.jpg">خبر</video>'
 ];
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify(samples),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[false,false,false,false,false,false,true,true,true,true]);
});

test('live PHP archive rejects space-separated excluded source labels in all six priority countries',t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard,'test the deployed archive gate, not a duplicate implementation');
 const blocked=[
  'السودان O n l y F a n s',
  'الصومال p o r n h u b',
  'جيبوتي x v i d e o s',
  'جزر القمر x n x x',
  'السعودية x h a m s t e r',
  'مصر r e d t u b e',
  'السودان y o u p o r n',
  'الصومال <a href="https://o n l y f a n s.com">مصدر</a>'
 ];
 const allowed=[
  'السودان', 'الصومال', 'جيبوتي', 'جزر القمر', 'السعودية', 'مصر',
  'Essex county', 'OnlyFansville ليست منصة', 'الأخبار الاقتصادية'
 ];
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify([...blocked,...allowed]),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[
  ...blocked.map(()=>false),...allowed.map(()=>true)
 ]);
 assert.match(php,/Version: 0\.12\.42/);
});

test('PHP archive mirrors worker: reject slash-delimited active markup across six countries',t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard);
 const blocked=[
  'السودان <svg/onload=alert(1)>خبر</svg>',
  'الصومال <img/src="javascript:alert(1)">',
  'جيبوتي <iframe/srcdoc="<p>ملف</p>"></iframe>',
  'جزر القمر <img/onerror="alert(1)" src="https://example.com/a.jpg">',
  'السعودية <a'+'a'.repeat(4100)+'>خبر</a>',
  'مصر &lt;svg/onload=alert(1)&gt;خبر&lt;/svg&gt;'
 ];
 const allowed=[
  'السودان <a href="https://example.com/path/onload=ready">خبر</a>',
  'الصومال <img src="https://example.com/image.jpg" alt="ملخص">',
  'جيبوتي <a href="https://example.com/path/srcdoc=value">خبر</a>',
  'جزر القمر <video poster="https://example.com/cover.png">ملف</video>',
  'السعودية <a href="https://example.com/news">مصدر</a>',
  'مصر أخبار الأسواق'
 ];
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify([...blocked,...allowed]),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[...blocked.map(()=>false),...allowed.map(()=>true)]);
});

test('public archives reject slash plus and bullet obfuscation without suppressing ordinary country headlines',t=>{
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];assert.ok(guard);
 const bad=['السعودية p/o/r/n/h/u/b','مصر o+n+l+y+f+a+n+s','السودان x•v•i•d•e•o•s','الصومال r/e/d/t/u/b/e','جيبوتي y/o/u/p/o/r/n','جزر القمر x/n/x/x','السودان <a href="https://example.org/refs/p%2Fo%2Fr%2Fn%2Fh%2Fu%2Fb">الرابط</a>'];
 const good=['السعودية / الأسواق','مصر + الاقتصاد','السودان • الأخبار','الصومال','جيبوتي','جزر القمر','Essex county'];
 const code='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+'\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const r=spawnSync('php',['-r',code],{input:JSON.stringify([...bad,...good]),encoding:'utf8'});
 if(r.error && (r.error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('PHP unavailable');return;}
 assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),[...bad.map(()=>false),...good.map(()=>true)]);
});
test('bundled installable ZIP exactly matches PHP and required section file',t=>{
 const unpack=(p:string)=>spawnSync('unzip',['-p','dist/trend-atn-lightview-plugin.zip','trend-atn-lightview-plugin/'+p],{encoding:'utf8'});
 const main=unpack('atn-lightview.php');if(main.error && (main.error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('unzip unavailable');return;}
 assert.equal(main.status,0,main.stderr);assert.equal(main.stdout,php);
 const include=unpack('includes/atn-section.php');assert.equal(include.status,0,include.stderr);
 assert.equal(include.stdout,readFileSync(new URL('../includes/atn-section.php',import.meta.url),'utf8'));
});

test('archive admission decodes literal Unicode and hex source aliases in six priority countries',t=>{
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard);
 const slash=String.fromCharCode(92);
 const bad=[], good=[];
 for(const country of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر']){
  bad.push(country+' only'+slash+'u0066ans',country+' p'+slash+'x6frnhub',
   country+' <a href="https://example.com/only%255Cu0066ans">مصدر</a>',
   country+' only'+slash+'u0026#102;ans');
  good.push(country+' أخبار الأسواق',country+' '+slash+'u0627قتصاد',
   country+' <a href="https://example.com/news">مصدر</a>');
 }
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify([...bad,...good]),encoding:'utf8'});
 if(result.error && (result.error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('PHP unavailable');return;}
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[...bad.map(()=>false),...good.map(()=>true)]);
});


test('live archive link guard rejects noncanonical URL variants across six countries',t=>{
 const guard=php.match(/function atn_lightview_archive_link_allowed\(\$url\) \{[\s\S]*?\n\}/)?.[0];assert.ok(guard);
 const good=['sa','eg','sd','so','dj','km'].flatMap(c=>{
  const u='https://arabiatrend.com/trend-archive/'+c+'-search-2026-11-22';
  return [u,u+'/'];
 });
 const bad=good.filter((_,i)=>i%2===0).flatMap(u=>[u+'//',u+'?',u+'#',u+'?tracking=1',u.replace('/trend-archive/','/trend-archive/%2e/'),u.replace('/trend-archive/','/other/../trend-archive/')]);
 const script='function wp_parse_url($s){return parse_url($s);} function home_url($s){return "https://arabiatrend.com/";}'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_link_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify([...good,...bad]),encoding:'utf8'});
 if(result.error && (result.error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('PHP unavailable');return;}
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[...good.map(()=>true),...bad.map(()=>false)]);
});

test('public PHP archive rejects invisible source aliases and unsafe destinations without changing safe headlines',t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard);
 const bad=[], good=[];
 for(const country of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر']){
  for(const point of [0x034F,0x2065,0xFE0F,0xE0100,0xE007F,0x115F]){
   const hidden=String.fromCodePoint(point);
   const destination='java'+hidden+'script:alert(1)';
   bad.push(country+' only'+hidden+'fans',country+' <a href="'+destination+'">مصدر</a>',
    country+' <img srcset="https://example.com/image.jpg 1x, '+destination+' 2x">',
    country+' <div style="background:url('+destination+')">خبر</div>');
   good.push(country+' أخبار الأسواق'+hidden, country+' <a href="https://example.com/news">مصدر</a>');
  }
 }
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify([...bad,...good]),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[...bad.map(()=>false),...good.map(()=>true)]);
});


test('PHP archive matches extended Arabic marks and explicit French descriptors across six countries',t=>{
 const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
 if(runtime.error){t.skip('PHP CLI unavailable');return;}
 const guard=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(guard,'execute the real pre-cache and detail-page guard');
 const countries=['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر'];
 const marks=['\u0610','\u061a','\u06d6','\u06e7','\u06ed','\u08d4','\u08e3','\u08f0'];
 const blocked=countries.flatMap(country=>[
  ...marks.map(mark=>'حصيلة '+country+' إ'+mark+'باحية'),
  ...['pornographie','pornographies','pornographique','pornographiques','pornographic','pornographically','pornographer','pornographers'].map(word=>'حصيلة '+country+' '+word),
  ...marks.map(mark=>'حصيلة '+country+' <a href="https://example.com/إ'+mark+'باحية">خبر</a>')
 ]);
 const allowed=countries.flatMap(country=>['أخبار الأسواق','Développement économique','Santé publique','Essex county'].map(word=>country+' '+word));
 const script='function wp_strip_all_tags($s){return strip_tags($s);}\n'+guard+
  '\necho json_encode(array_map("atn_lightview_archive_title_allowed",json_decode(stream_get_contents(STDIN),true)));';
 const result=spawnSync('php',['-r',script],{input:JSON.stringify([...blocked,...allowed]),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[...blocked.map(()=>false),...allowed.map(()=>true)]);
});
