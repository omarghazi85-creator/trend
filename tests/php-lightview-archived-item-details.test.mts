import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const php = readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');
const policy = php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/)?.[0];
const contentGuard = php.match(/function atn_lightview_archive_content_allowed\(\$post\) \{[\s\S]*?\n\}/)?.[0];
const blocked = php.match(/function atn_lightview_archive_detail_blocked\(\$post\) \{[\s\S]*?\n\}/)?.[0];
const cards = php.match(/function atn_lightview_archive_focus_cards\(\$content\) \{[\s\S]*?\n\}/)?.[0];
const linkedCard = php.match(/function atn_lightview_archive_focus_linked_card\(\$entry, \$detail\) \{[\s\S]*?\n\}/)?.[0];
const postGuard = php.match(/function atn_lightview_archive_focus_post\(\$post\) \{[\s\S]*?\n\}/)?.[0];
const key = php.match(/function atn_lightview_archive_focus_key\(\) \{[\s\S]*?\n\}/)?.[0];
const contentFilter = php.match(/add_filter\('the_content', function \(\$content\) \{[\s\S]*?\n\}, 25\);/)?.[0];
assert.ok(policy&&contentGuard&&blocked&&cards&&linkedCard&&postGuard&&key&&contentFilter);

test('archived item links are generated only from existing stored cards, never external sources or synthesized pages',()=>{
 assert.match(php,/Version: 0\.12\.42/);
 assert.match(contentFilter!,/add_query_arg\('atn_item', \$entry\['key'\], get_permalink\(\$post\)\)/);
 assert.match(contentFilter!,/preg_replace_callback/);
 assert.match(contentFilter!,/atn_lightview_archive_focus_post\(\$post\)/);
 assert.match(php,/add_filter\('rank_math\/frontend\/canonical'/);
 assert.doesNotMatch(contentFilter!,/wp_insert_post|wp_update_post|wp_schedule_event|wp_remote_get|file_get_contents/);
});

test('six country cards get stable unique internal read-only destinations; original media links remain unchanged',t=>{
 const check=spawnSync('php',['-v'],{encoding:'utf8'});
 if(check.error){t.skip('PHP CLI unavailable');return;}
 const sampleNames=['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر'];
 const html='<section class="atna"><div class="atna-grid">'+sampleNames.map((country,i)=>
   '<article class="atna-item"><div><h3 dir="auto">أخبار الاقتصاد '+country+'</h3>'+
   '<a class="source" href="https://media.example.com/'+i+'">المصدر الأصلي</a></div></article>').join('')+
   '<article class="atna-item"><div><h3 dir="auto">onlyfans</h3></div></article>'+
   '<article class="atna-item"><div><h3><a href="https://arabiatrend.com/trend-archive/topic-123">عنوان مرتبط أصلاً</a></h3></div></article>'+
   '<article class="atna-item"><div><h3 dir="auto">أخبار الاقتصاد السودان</h3><a class="source" href="https://media.example.com/duplicate">المصدر الأصلي الثاني</a></div></article>'+ 
   '<article class="atna-item"><div><h3><a data-href="https://media.example.com/tracker" title=" fake href=&#39;https://media.example.com/fake&#39; > " href="https://media.example.com/title-only">اقتصاد السودان: تقرير موثق</a></h3><a class="source" href="https://media.example.com/video-only">فيديو أصلي</a></div></article>'+
   '</div></section>';
 const stubs=String.raw`class WP_Post {
 public $ID=123; public $post_type='page';public $post_status='publish';
 public $post_parent=61269; public $post_name='sd-search-2026-11-22';
 public $post_title='حصيلة كلمات البحث في السودان';
 public $post_content='';public $post_excerpt='';
}
$post=new WP_Post;
function get_the_title($post){return $post->post_title;}
function wp_strip_all_tags($s){return strip_tags($s);}
function is_admin(){return false;}
function is_singular($type){return $type==='page';}
function is_main_query(){return true;}
function get_queried_object(){global $post;return $post;}
function get_permalink($post){return 'https://arabiatrend.com/trend-archive/sd-search-2026-11-22';}
function home_url($path){return 'https://arabiatrend.com'.$path;}
function wp_parse_url($url){return parse_url($url);}
function esc_url($url){return htmlspecialchars($url, ENT_QUOTES,'UTF-8');}
function esc_html($s){return htmlspecialchars($s, ENT_QUOTES,'UTF-8');}
function add_query_arg($name,$value,$url){return $url.'?'.$name.'='.$value;}
function add_filter($name,$fn,$priority){global $filters;$filters[$name]=$fn;}
`;
 const script=stubs+policy+'\n'+contentGuard+'\n'+blocked+'\n'+cards+'\n'+linkedCard+'\n'+postGuard+'\n'+key+'\n'+contentFilter+
 String.raw`
$post->post_content=stream_get_contents(STDIN);
$source=atn_lightview_archive_focus_cards($post->post_content);
// The full page is correctly blocked if even one stored card is prohibited.
// Test the read-only links on a safe archive, after separately testing extraction.
$post->post_content=str_replace('<article class="atna-item"><div><h3 dir="auto">onlyfans</h3></div></article>','',$post->post_content);
$_GET=array();
$overview=$filters['the_content']($post->post_content);
$firstKey=array_key_first($source);
$_GET=array('atn_item'=>$firstKey);
$focused=$filters['the_content']($post->post_content);
$sourceKeys=array_keys($source);
$_GET=array('atn_item'=>$sourceKeys[6]);
$focusedDuplicate=$filters['the_content']($post->post_content);
$_GET=array('atn_item'=>$sourceKeys[7]);
$focusedExternal=$filters['the_content']($post->post_content);
echo json_encode(array(
 'count'=>count($source),'keys'=>array_keys($source),
 'overview'=>$overview,'focused'=>$focused,'focusedDuplicate'=>$focusedDuplicate,
 'focusedExternal'=>$focusedExternal,'first'=>$firstKey
),JSON_UNESCAPED_UNICODE);
`;
 const result=spawnSync('php',['-r',script],{input:html,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(result.stdout);
 assert.equal(data.count,8);
 assert.equal(new Set(data.keys).size,8);
 assert.notEqual(data.keys[2],data.keys[6]);
 assert.equal((data.overview.match(/\?atn_item=[a-f0-9]{16}/g)||[]).length,8);
 for(let i=0;i<6;i++){
   assert.ok(data.overview.includes('https://media.example.com/'+i),'original media '+i);
 }
 assert.equal((data.focused.match(/class="atna-item"/g)||[]).length,1);
 assert.ok(data.focused.includes('عرض الحصيلة الكاملة'));
 assert.ok(data.focused.includes('https://media.example.com/0'));
 assert.ok(!data.focused.includes('https://media.example.com/1'));
 assert.ok(data.focused.includes('أخبار الاقتصاد السعودية'));
 assert.ok(!data.focused.includes('onlyfans'));
 assert.ok(data.focusedDuplicate.includes('https://media.example.com/duplicate'));
 assert.ok(!data.focusedDuplicate.includes('https://media.example.com/2'));
 assert.ok(data.focusedDuplicate.includes('أخبار الاقتصاد السودان'));
 assert.ok(data.overview.includes('https://media.example.com/duplicate'));
 assert.ok(data.overview.includes('https://media.example.com/2'));
 assert.ok(data.overview.includes('class="atna-original-source" href="https://media.example.com/title-only"'));
 assert.ok(data.overview.includes('https://media.example.com/video-only'));
 assert.ok(!data.overview.includes('class="atna-original-source" href="https://media.example.com/tracker"'));
 assert.ok(!data.overview.includes('class="atna-original-source" href="https://media.example.com/fake"'));
 assert.ok(data.overview.includes('<h3><a href="https://arabiatrend.com/trend-archive/topic-123">'));
 assert.ok(data.focusedExternal.includes('اقتصاد السودان: تقرير موثق'));
 assert.ok(data.focusedExternal.includes('class="atna-original-source" href="https://media.example.com/title-only"'));
 assert.ok(data.focusedExternal.includes('https://media.example.com/video-only'));
 assert.ok(!data.focusedExternal.includes('https://media.example.com/duplicate'));

});
