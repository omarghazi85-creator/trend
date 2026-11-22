import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const php = readFileSync(new URL('../atn-lightview.php', import.meta.url), 'utf8');

test('unsafe archived detail permalinks return 404 without touching stored pages', () => {
  assert.match(php, /function atn_lightview_archive_detail_blocked\(\$post\)/);
  assert.match(php, /\(int\) \$post->post_parent === 61269/);
  assert.match(php, /!atn_lightview_archive_title_allowed\(get_the_title\(\$post\)\)/);
  assert.match(php, /if \(!is_singular\('page'\)\) \{ return; \}/);
  assert.doesNotMatch(php, /is_preview\(\)/, 'public preview queries must not bypass 404');
  assert.match(php, /current_user_can\('edit_post', \$post->ID\)/);
  assert.match(php, /\$wp_query->set_404\(\)/);
  assert.match(php, /status_header\(404\)/);
  assert.match(php, /header\('X-Robots-Tag: noindex'/);
  assert.doesNotMatch(php, /wp_schedule_event\s*\(/);
});

test('PHP blocks excluded archive child only, preserves legitimate countries and other pages', t => {
  const version = spawnSync('php', ['-v'], {encoding:'utf8'});
  if (version.error) { t.skip('PHP CLI not present'); return; }
  const policy = php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/);
  const contentGuard = php.match(/function atn_lightview_archive_content_allowed\(\$post\) \{[\s\S]*?\n\}/);
  const detail = php.match(/function atn_lightview_archive_detail_blocked\(\$post\) \{[\s\S]*?\n\}/);
  assert.ok(policy && detail, 'extract pure filter and archive scope guard');
  const stub = `class WP_Post {
    public $post_type; public $post_parent; public $post_title;
    public function __construct($type,$parent,$title) {
      $this->post_type=$type; $this->post_parent=$parent; $this->post_title=$title;
    }
  }
  function get_the_title($post){return $post->post_title;}
  function wp_strip_all_tags($title){return strip_tags($title);}
  `;
  const script = stub + policy[0] + '\n' + contentGuard![0] + '\n' + detail[0] + '\n' +
    'echo json_encode(array_map("atn_lightview_archive_detail_blocked",array(' +
    'new WP_Post("page",61269,"ميا خليفة | سجل الرواج"),' +
    'new WP_Post("page",61269,"سجل الرواج | OnlyFans"),' +
    'new WP_Post("page",61269,"porn%68ub | سجل الرواج"),' +
    'new WP_Post("page",61269,"only%252566ans | سجل الرواج"),' +
    'new WP_Post("page",61269,"only&amp;#37;66ans | سجل الرواج"),' +
    'new WP_Post("page",61269,"نمو 25% في مصر | سجل الرواج"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في السودان"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في الصومال"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في جيبوتي"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في جزر القمر"),' +
    'new WP_Post("page",61258,"ميا خليفة"),' +
    'new WP_Post("post",61269,"ميا خليفة"),' +
    'null)));';
  const result = spawnSync('php',['-r',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[true,true,true,true,true,false,false,false,false,false,false,false,false]);
});

test('anonymous preview queries cannot bypass excluded details; editors keep access', t => {
  const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
  if(runtime.error){t.skip('PHP CLI not present');return;}
  const policy=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
  const contentGuard=php.match(/function atn_lightview_archive_content_allowed\(\$post\) \{[\s\S]*?\n\}/)?.[0];
  const detail=php.match(/function atn_lightview_archive_detail_blocked\(\$post\) \{[\s\S]*?\n\}/)?.[0];
  const action=php.match(/add_action\('template_redirect', function \(\) \{[\s\S]*?\n\}, 2\);/)?.[0];
  assert.ok(policy && contentGuard && detail && action, 'verify the actual PHP route action');
  const stubs=`class WP_Post {
    public $ID=9999; public $post_type='page'; public $post_parent=61269; public $post_title;
    function __construct($title){$this->post_title=$title;}
  }
  class MockQuery {public $blocked=false; function set_404(){$this->blocked=true;}}
  $wp_query=new MockQuery(); $editor=false; $preview=true; $post=new WP_Post("pornhub | سجل الرواج");
  function is_singular($type){return $type==='page';}
  function is_preview(){global $preview;return $preview;} // Simulate preview flag
  function get_queried_object(){global $post;return $post;}
  function get_the_title($post){return $post->post_title;}
  function wp_strip_all_tags($text){return strip_tags($text);}
  function current_user_can($cap,$id){global $editor;return $editor;}
  function add_action($name,$cb,$priority){global $route;$route=$cb;}
  function status_header($status){}
  function nocache_headers(){}
  function get_404_template(){return false;}
  function wp_die($message,$title,$args){throw new Exception("blocked:".$args["response"]);}
  `;
  const script=stubs+policy+'\n'+contentGuard+'\n'+detail+'\n'+action+`
    $first=false;
    try{$route();}catch(Exception $e){$first=$e->getMessage()==='blocked:404';}
    $anonymousBlocked=$first && $wp_query->blocked;
    $preview=false; $wp_query->blocked=false; $second=false;
    try{$route();}catch(Exception $e){$second=$e->getMessage()==='blocked:404';}
    $ordinaryBlocked=$second && $wp_query->blocked;
    $editor=true; $wp_query->blocked=false; $route();
    $editorAllowed=!$wp_query->blocked;
    $editor=false; $post=new WP_Post("حصيلة كلمات البحث في السودان");
    $route(); $normalAllowed=!$wp_query->blocked;
    echo json_encode([$anonymousBlocked,$ordinaryBlocked,$editorAllowed,$normalAllowed]);
  `;
  const res=spawnSync('php',['-r',script],{encoding:'utf8'});
  assert.equal(res.status,0,res.stderr);
  assert.deepEqual(JSON.parse(res.stdout),[true,true,true,true]);
});

test('body and excerpt policy blocks disallowed archives but retains safe Arab country summaries', t => {
  const runtime=spawnSync('php',['-v'],{encoding:'utf8'});
  if(runtime.error){t.skip('PHP CLI unavailable');return;}
  const policy=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
  const body=php.match(/function atn_lightview_archive_content_allowed\(\$post\) \{[\s\S]*?\n\}/)?.[0];
  const detail=php.match(/function atn_lightview_archive_detail_blocked\(\$post\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(policy && body && detail);
  const stubs=`class WP_Post {
    public $post_type='page'; public $post_parent=61269; public $post_title; public $post_content; public $post_excerpt;
    function __construct($t,$c,$e,$p=61269){$this->post_title=$t;$this->post_content=$c;$this->post_excerpt=$e;$this->post_parent=$p;}
  }
  function get_the_title($post){return $post->post_title;}
  function wp_strip_all_tags($v){return strip_tags($v);}
  `;
  const cases=[
    ['حصيلة كلمات البحث في السودان','<a href="https://onlyfans.com/x">تفاصيل</a>','',61269],
    ['حصيلة كلمات البحث في الصومال','حصيلة طبيعية','p&amp;#111;rn media',61269],
    ['حصيلة كلمات البحث في جيبوتي','نتائج التجارة والسياحة','ملخص',61269],
    ['حصيلة كلمات البحث في جزر القمر','السياحة 25%','',61269],
    ['كلمات البحث الرائجة في السعودية','مادة عادية','',61269],
    ['كلمات البحث الرائجة في مصر','مادة عادية','',61269],
    ['حصيلة كلمات البحث في السودان','onlyfans','',61258],
  ];
  const script=stubs+policy+'\\n'+body+'\\n'+detail+
    '\\n$flags=[]; foreach(json_decode(stream_get_contents(STDIN),true) as $r){$flags[]=atn_lightview_archive_detail_blocked(new WP_Post(...$r));} echo json_encode($flags);';
  const result=spawnSync('php',['-r',script],{input:JSON.stringify(cases),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[true,true,false,false,false,false,false]);
});
