import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const php=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');
const extract=(name:string)=>php.match(new RegExp('function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'))?.[0];
const fragments=['atn_lightview_archive_title_allowed','atn_lightview_archive_content_allowed',
 'atn_lightview_archive_detail_blocked','atn_lightview_archive_focus_cards',
 'atn_lightview_archive_focus_post','atn_lightview_archive_focus_key',
 'atn_lightview_archive_focus_metadata'].map(extract);
const filters=php.match(/\/\/ Focused archive item metadata:[\s\S]*?\/\/ End focused archive item metadata\./)?.[0];
assert.ok(fragments.every(Boolean)&&filters);

test('read-only focused SEO metadata matches local item; parent and unknown key retain metadata',t=>{
 const check=spawnSync('php',['-v'],{encoding:'utf8'});
 if(check.error){t.skip('PHP CLI unavailable');return;}
 const stubs=String.raw`class WP_Post {
 public $ID=123;public $post_type='page';public $post_status='publish';public $post_parent=61269;
 public $post_name='sd-search-2026-11-22';public $post_title='حصيلة كلمات البحث في السودان';
 public $post_content='';public $post_excerpt='';
}
$post=new WP_Post;
function get_queried_object(){global $post;return $post;}
function get_the_title($post){return $post->post_title;}
function get_permalink($post){return 'https://arabiatrend.com/trend-archive/sd-search-2026-11-22/';}
function add_query_arg($key,$value,$url){return $url.'?'.$key.'='.$value;}
function is_admin(){return false;}
function is_singular($type){return $type==='page';}
function wp_strip_all_tags($s){return strip_tags($s);}
function add_filter($name,$fn){$GLOBALS['filters'][$name]=$fn;}
`;
 const sample=String.raw`
$post->post_content='<section class="atna"><article class="atna-item"><h3>اقتصاد السودان</h3><a href="https://news.example.com/report">المصدر الأصلي</a></article></section>';
$items=atn_lightview_archive_focus_cards($post->post_content);
$key=array_key_first($items);
$hooks=array('rank_math/frontend/canonical','rank_math/frontend/title','rank_math/frontend/description',
'rank_math/opengraph/url','rank_math/opengraph/facebook/og_title','rank_math/opengraph/facebook/og_description',
'rank_math/opengraph/twitter/twitter_title','rank_math/opengraph/twitter/twitter_description');
$baseline=array();$focused=array();$unknown=array();
foreach($hooks as $hook){$baseline[$hook]=$filters[$hook]('parent-original');}
$_GET=array('atn_item'=>$key);
foreach($hooks as $hook){$focused[$hook]=$filters[$hook]('parent-original');}
$_GET=array('atn_item'=>'0000000000000000');
foreach($hooks as $hook){$unknown[$hook]=$filters[$hook]('parent-original');}
echo json_encode(array('baseline'=>$baseline,'focused'=>$focused,'unknown'=>$unknown,'key'=>$key),JSON_UNESCAPED_UNICODE);
`;
 const result=spawnSync('php',['-r',stubs+fragments.join('\n')+'\n'+filters+sample],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(result.stdout);
 const focused=data.focused;
 const url='https://arabiatrend.com/trend-archive/sd-search-2026-11-22/?atn_item='+data.key;
 assert.equal(focused['rank_math/frontend/canonical'],url);
 assert.equal(focused['rank_math/opengraph/url'],url);
 for(const hook of ['rank_math/frontend/title','rank_math/opengraph/facebook/og_title','rank_math/opengraph/twitter/twitter_title']){
  assert.equal(focused[hook],'اقتصاد السودان | الترند العربي');
 }
 for(const hook of ['rank_math/frontend/description','rank_math/opengraph/facebook/og_description','rank_math/opengraph/twitter/twitter_description']){
  assert.match(focused[hook],/اقتصاد السودان ضمن حصيلة كلمات البحث في السودان/);
 }
 assert.ok(Object.values(data.baseline).every(v=>v==='parent-original'));
 assert.ok(Object.values(data.unknown).every(v=>v==='parent-original'));
});


test('focused item schema drops parent ItemList only, retaining unrelated graph nodes and parent metadata',t=>{
 const check=spawnSync('php',['-v'],{encoding:'utf8'});
 if(check.error){t.skip('PHP CLI unavailable');return;}
 const schema=extract('atn_lightview_archive_focus_schema');
 assert.ok(schema && php.includes("add_filter('rank_math/json_ld', 'atn_lightview_archive_focus_schema', 99)"));
 const stubs=String.raw`class WP_Post {
 public $ID=123;public $post_type='page';public $post_status='publish';public $post_parent=61269;
 public $post_name='dj-search-2026-11-22';public $post_title='حصيلة كلمات البحث في جيبوتي';
 public $post_content='<section class="atna"><article class="atna-item"><h3>اقتصاد جيبوتي</h3></article></section>';
 public $post_excerpt='';
}
$post=new WP_Post;
function get_queried_object(){global $post;return $post;}
function get_the_title($post){return $post->post_title;}
function get_permalink($post){return 'https://arabiatrend.com/trend-archive/dj-search-2026-11-22/';}
function add_query_arg($key,$value,$url){return $url.'?'.$key.'='.$value;}
function is_admin(){return false;}
function is_singular($type){return $type==='page';}
function wp_strip_all_tags($s){return strip_tags($s);}
`;
 const sample=String.raw`
$graph=array('WebPage'=>array('@type'=>'WebPage',
 '@id'=>'https://arabiatrend.com/trend-archive/dj-search-2026-11-22/#webpage',
 'url'=>'https://arabiatrend.com/trend-archive/dj-search-2026-11-22/',
 'name'=>'حصيلة جيبوتي','description'=>'وصف الحصيلة'),
  'ItemList'=>array('@type'=>'ItemList','itemListElement'=>array(1,2)),
  'BreadcrumbList'=>array('@type'=>'BreadcrumbList'),
  'Multi'=>array('@type'=>array('ItemList','CollectionPage')));
$baseline=atn_lightview_archive_focus_schema($graph);
$_GET=array('atn_item'=>substr(hash('sha256','اقتصاد جيبوتي'),0,16));
$focused=atn_lightview_archive_focus_schema($graph);
$_GET=array('atn_item'=>'0000000000000000');
$unknown=atn_lightview_archive_focus_schema($graph);
echo json_encode(array('baseline'=>$baseline,'focused'=>$focused,'unknown'=>$unknown,
 'focus_key'=>substr(hash('sha256','اقتصاد جيبوتي'),0,16)),JSON_UNESCAPED_UNICODE);
`;
 const r=spawnSync('php',['-r',stubs+fragments.join('\n')+'\n'+schema+'\n'+sample],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const parsed=JSON.parse(r.stdout);
 assert.deepEqual(parsed.baseline,parsed.unknown);
 assert.deepEqual(Object.keys(parsed.baseline),['WebPage','ItemList','BreadcrumbList','Multi']);
 assert.deepEqual(Object.keys(parsed.focused),['WebPage','BreadcrumbList']);
 assert.equal(parsed.focused.WebPage.name,'اقتصاد جيبوتي');
 assert.equal(parsed.focused.WebPage.url,
   'https://arabiatrend.com/trend-archive/dj-search-2026-11-22/?atn_item='+parsed.focus_key);
 assert.match(parsed.focused.WebPage.description,/اقتصاد جيبوتي ضمن حصيلة كلمات البحث في جيبوتي/);
 assert.equal(parsed.focused.WebPage['@id'],parsed.focused.WebPage.url+'#webpage');
});

test('the primary H1 follows existing safe archive cards in six countries without changing parent URLs',t=>{
 const check=spawnSync('php',['-v'],{encoding:'utf8'});
 if(check.error){t.skip('PHP CLI unavailable');return;}
 const heading=extract('atn_lightview_archive_focus_heading_title');
 assert.ok(heading && php.includes("add_filter('the_title', 'atn_lightview_archive_focus_heading_title', 30, 2)"));
 const stubs=String.raw`class WP_Post {
 public $ID=123;public $post_type='page';public $post_status='publish';public $post_parent=61269;
 public $post_name='sd-search-2026-11-22';public $post_title='';public $post_content='';public $post_excerpt='';
}
$post=new WP_Post;
$GLOBALS['main']=true;$GLOBALS['loop']=true;
function is_admin(){return false;}
function is_singular($type){return $type==='page';}
function is_main_query(){return $GLOBALS['main'];}
function in_the_loop(){return $GLOBALS['loop'];}
function get_queried_object(){global $post;return $post;}
function get_permalink($post){return 'https://arabiatrend.com/trend-archive/'.$post->post_name;}
function add_query_arg($key,$value,$url){return $url.'?'.$key.'='.$value;}
function wp_strip_all_tags($s){return strip_tags($s);}
`;
 const script=String.raw`
$results=array();
foreach(array('sa'=>'السعودية','eg'=>'مصر','sd'=>'السودان','so'=>'الصومال','dj'=>'جيبوتي','km'=>'جزر القمر') as $code=>$country){
 $post->ID++;
 $post->post_name=$code.'-search-2026-11-22';
 $post->post_title='حصيلة كلمات البحث في '.$country;
 $topic='اقتصاد '.$country;
 $post->post_content='<section class="atna"><article class="atna-item"><h3>'.$topic.'</h3><a href="https://media.example.com/report">المصدر الأصلي</a></article></section>';
 $_GET=array('atn_item'=>substr(hash('sha256',$topic),0,16));
 $focused=atn_lightview_archive_focus_heading_title($post->post_title,$post->ID);
 $_GET=array('atn_item'=>'0000000000000000');
 $unknown=atn_lightview_archive_focus_heading_title($post->post_title,$post->ID);
 $_GET=array();
 $parent=atn_lightview_archive_focus_heading_title($post->post_title,$post->ID);
 $_GET=array('atn_item'=>substr(hash('sha256',$topic),0,16));
 $other=atn_lightview_archive_focus_heading_title($post->post_title,$post->ID+1);
 $GLOBALS['loop']=false;
 $outside=atn_lightview_archive_focus_heading_title($post->post_title,$post->ID);
 $GLOBALS['loop']=true;
 $GLOBALS['main']=false;
 $secondary=atn_lightview_archive_focus_heading_title($post->post_title,$post->ID);
 $GLOBALS['main']=true;
 $results[]=array('topic'=>$topic,'focused'=>$focused,'parentTitle'=>$post->post_title,
  'unknown'=>$unknown,'parent'=>$parent,'other'=>$other,'outside'=>$outside,'secondary'=>$secondary);
}
echo json_encode($results,JSON_UNESCAPED_UNICODE);
`;
 const result=spawnSync('php',['-r',stubs+fragments.join('\n')+'\n'+heading+'\n'+script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const rows=JSON.parse(result.stdout);
 assert.equal(rows.length,6);
 for(const row of rows){
  assert.equal(row.focused,row.topic);
  for(const key of ['unknown','parent','other','outside','secondary'])
   assert.equal(row[key],row.parentTitle,key);
 }
});
