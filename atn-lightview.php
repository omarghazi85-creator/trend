<?php
/**
 * Plugin Name: ArabiaTrend Light View
 * Description: Lightweight read-only UI for ArabiaTrend archive pages; no scheduled tasks or content writes.
 * Version: 0.12.0
 * Requires PHP: 7.4
 * Author: ArabiaTrend
 */
if (!defined('ABSPATH')) { exit; }
/**
 * Public archive snapshot. Read-only and shared by the page and REST API.
 * The 15-minute transient prevents repeated 320-post queries on normal traffic.
 */
function atn_lightview_country_codes() {
    return array('sa'=>'السعودية','ae'=>'الإمارات','eg'=>'مصر','kw'=>'الكويت','qa'=>'قطر','bh'=>'البحرين','om'=>'عُمان','jo'=>'الأردن','lb'=>'لبنان','iq'=>'العراق','sy'=>'سوريا','ps'=>'فلسطين','ye'=>'اليمن','ly'=>'ليبيا','tn'=>'تونس','dz'=>'الجزائر','ma'=>'المغرب','mr'=>'موريتانيا');
}
function atn_lightview_archive_items() {
    $key = 'atn_lightview_latest_v9';
    $items = get_transient($key);
    $country_codes = atn_lightview_country_codes();
    if (!is_array($items)) {
        $q = new WP_Query(array(
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_parent' => 61269,
            'posts_per_page' => 320,
            'orderby' => 'date',
            'order' => 'DESC',
            'no_found_rows' => true,
            'ignore_sticky_posts' => true,
            'update_post_meta_cache' => false,
            'update_post_term_cache' => false,
            'suppress_filters' => true
        ));
        $items = array();
        foreach ($q->posts as $p) {
            $title = wp_strip_all_tags(get_the_title($p));
            if (strpos($title, 'كلمات البحث الرائجة') === false &&
                strpos($title, 'الأغاني الأكثر تشغيلًا') === false &&
                strpos($title, 'سجل الرواج') === false &&
                strpos($title, 'حصيلة ترندات') === false) { continue; }
            $slug_prefix = explode('-', $p->post_name, 2)[0];
            $item_country = isset($country_codes[$slug_prefix]) ? $country_codes[$slug_prefix] : '';
            $items[] = array(
                'country' => $item_country,
                'title' => $title,
                'link' => get_permalink($p),
                'date' => get_the_date('Y-m-d', $p),
                'date_iso' => get_the_date('c', $p),
                'kind' => strpos($title,'سجل الرواج') !== false ? 'topic' : (strpos($title,'الأغاني الأكثر تشغيلًا') !== false ? 'music' : (strpos($title,'حصيلة ترندات') !== false ? 'weekly' : 'search')),
            );
        }
        wp_reset_postdata();
        set_transient($key, $items, 15 * MINUTE_IN_SECONDS);
    }
    return $items;
}
add_action('rest_api_init', function () {
    register_rest_route('atn-light/v1', '/archive', array(
        'methods' => WP_REST_Server::READABLE,
        'permission_callback' => '__return_true',
        'callback' => function ($request) {
            $items = atn_lightview_archive_items();
            $limit = min(100, max(1, absint($request->get_param('limit') ?: 50)));
            $page = min(1000, max(1, absint($request->get_param('page') ?: 1)));
            $offset = ($page - 1) * $limit;
            $country = sanitize_text_field((string) ($request->get_param('country') ?: ''));
            $kind = sanitize_key((string) ($request->get_param('kind') ?: ''));
            $allowed_kinds = array('search', 'music', 'weekly', 'topic');
            if ($kind && !in_array($kind, $allowed_kinds, true)) {
                return new WP_Error('invalid_kind', 'Invalid archive kind', array('status' => 400));
            }
            if ($country && !in_array($country, array_values(atn_lightview_country_codes()), true)) {
                return new WP_Error('invalid_country', 'Invalid country', array('status' => 400));
            }
            $filtered = array_values(array_filter($items, function ($item) use ($country, $kind) {
                return (!$country || $item['country'] === $country) &&
                       (!$kind || $item['kind'] === $kind);
            }));
            $response = rest_ensure_response(array(
                'scope' => 'latest_archived_pages_only',
                'total_in_window' => count($filtered),
                'latest_archived_at' => isset($items[0]['date_iso']) ? $items[0]['date_iso'] : null,
                'page' => $page,
                'per_page' => $limit,
                'total_pages' => (int) ceil(count($filtered) / $limit),
                'has_more' => $offset + $limit < count($filtered),
                'items' => array_slice($filtered, $offset, $limit)
            ));
            $response->header('Cache-Control', 'public, max-age=300');
            return $response;
        }
    ));
});
add_shortcode('atn_lightview', function () {
    $country_codes = atn_lightview_country_codes();
    $items = atn_lightview_archive_items();
    $countries = array_values($country_codes);
    $latest_date = isset($items[0]['date_iso']) ? $items[0]['date_iso'] : '';
    $latest_timestamp = $latest_date ? strtotime($latest_date) : false;
    $is_stale = (!$latest_timestamp || (current_time('timestamp', true) - $latest_timestamp) > 36 * HOUR_IN_SECONDS);
    $country_counts = array_fill_keys($countries, 0);
    foreach ($items as $it) {
        if (!empty($it['country']) && isset($country_counts[$it['country']])) {
            $country_counts[$it['country']]++;
        }
    }
    $uid = 'atn-lite-' . wp_rand(10000, 99999);
    ob_start();
    ?>
    <div id="<?php echo esc_attr($uid); ?>" class="atn-lite" dir="rtl">
      <div class="atn-lite-hero">
        <div class="atn-lite-overline">الترند العربي الآن</div>
        <h2>نبض ما يبحث عنه العالم العربي</h2>
        <p>استكشف أحدث حصائل الرواج المحفوظة وملفات الموضوعات عبر الدول العربية، مع روابط مباشرة إلى المصادر المنشورة</p>
        <div class="atn-lite-search">
          <label for="<?php echo esc_attr($uid); ?>-q">ابحث في عناوين الحصائل المحفوظة</label>
          <input type="search" id="<?php echo esc_attr($uid); ?>-q" placeholder="اكتب كلمة مفتاحية للبحث في الحصائل المتاحة">
          <div class="atn-lite-platform-links" hidden><span>ابحث عن الكلمة على المنصات:</span> <a class="atn-lite-platform-google" target="_blank" rel="noopener noreferrer">Google</a> <a class="atn-lite-platform-x" target="_blank" rel="noopener noreferrer">X</a> <a class="atn-lite-platform-youtube" target="_blank" rel="noopener noreferrer">يوتيوب</a></div>
          <div class="atn-lite-share"><button type="button" class="atn-lite-reset-button">مسح الفلاتر</button><button type="button" class="atn-lite-share-button">نسخ رابط البحث</button><span class="atn-lite-share-status" role="status" aria-live="polite"></span></div>
          <details><summary>بحث تفصيلي</summary><div class="atn-lite-filters"><label>نوع المادة <select class="atn-lite-type"><option value="">جميع المواد</option><option value="search">كلمات البحث</option><option value="music">الأغاني</option><option value="weekly">حصيلة أسبوعية</option><option value="topic">ملف موضوع</option></select></label><label>تاريخ النشر <select class="atn-lite-range"><option value="">جميع التواريخ المتاحة</option><option value="1">آخر 24 ساعة</option><option value="7">آخر 7 أيام</option><option value="30">آخر 30 يومًا</option></select></label></div></details>
        </div>
      </div>
      <div class="atn-lite-heading"><h3>الدول العربية</h3><span>18 دولة ضمن أرشيف الرصد</span></div>
      <div class="atn-lite-countries"><button type="button" class="atn-lite-country current" data-country="" aria-pressed="true">جميع الدول</button>
        <?php foreach ($countries as $c) : ?><button type="button" class="atn-lite-country" data-country="<?php echo esc_attr($c); ?>" aria-pressed="false"><?php echo esc_html($c); ?> <span class="atn-lite-country-count" aria-label="عدد الحصائل ضمن آخر السجلات المحملة">(<?php echo intval($country_counts[$c]); ?>)</span></button><?php endforeach; ?>
      </div>
      <div class="atn-lite-heading"><h3>أحدث المواد المؤرشفة</h3><a href="<?php echo esc_url(home_url('/trend-archive/')); ?>">فتح الأرشيف الكامل</a></div>
      <p class="atn-lite-freshness<?php echo $is_stale ? ' atn-lite-stale' : ''; ?>" role="status"><?php if ($latest_timestamp) : ?>آخر حصيلة محفوظة ضمن البيانات المعروضة: <time datetime="<?php echo esc_attr(gmdate('c', $latest_timestamp)); ?>"><?php echo esc_html(wp_date('Y-m-d H:i', $latest_timestamp)); ?></time><?php else : ?>لا تتوفر حصائل محفوظة في نطاق العرض الحالي<?php endif; ?><?php if ($is_stale) : ?> — قد تكون بيانات العرض متأخرة عن آخر المستجدات<?php endif; ?></p>
      <p class="atn-lite-count" aria-live="polite"></p>
      <p class="atn-lite-archive-search"><a class="atn-lite-archive-search-link" href="<?php echo esc_url(home_url('/trend-archive/')); ?>">لم تجد النتيجة؟ تصفّح الأرشيف الكامل</a></p>
      <div class="atn-lite-grid">
      <?php foreach ($items as $item) : ?>
        <article class="atn-lite-card" data-title="<?php echo esc_attr($item['title']); ?>" data-date="<?php echo esc_attr($item['date_iso']); ?>" data-kind="<?php echo esc_attr($item['kind']); ?>" data-country="<?php echo esc_attr($item['country']); ?>">
          <span class="atn-lite-kind"><?php echo $item['kind']==='topic' ? 'ملف موضوع' : ($item['kind']==='music' ? 'الأغاني الأكثر تشغيلًا' : ($item['kind']==='weekly' ? 'حصيلة أسبوعية' : 'كلمات البحث')); ?></span>
          <a class="atn-lite-main-link" href="<?php echo esc_url($item['link']); ?>"><strong><?php echo esc_html($item['title']); ?></strong></a>
          <small><?php echo esc_html($item['date']); ?></small>
          <?php if ($item['kind'] === 'topic') : $topic = trim(preg_replace('/\\s*\\|\\s*سجل الرواج\\s*$/u', '', $item['title'])); ?>
          <div class="atn-lite-topic-search" aria-label="روابط البحث عن الموضوع على المنصات">
            <span>بحث عن الموضوع:</span>
            <a target="_blank" rel="noopener noreferrer" href="<?php echo esc_url('https://x.com/search?q=' . rawurlencode($topic)); ?>">X</a>
            <a target="_blank" rel="noopener noreferrer" href="<?php echo esc_url('https://www.youtube.com/results?search_query=' . rawurlencode($topic)); ?>">يوتيوب</a>
            <a target="_blank" rel="noopener noreferrer" href="<?php echo esc_url('https://trends.google.com/trends/explore?q=' . rawurlencode($topic)); ?>">Google Trends</a>
          </div>
          <?php endif; ?>
        </article>
      <?php endforeach; ?>
      </div>
      <div class="atn-lite-more-wrap"><button type="button" class="atn-lite-more">عرض المزيد</button></div>
      <p class="atn-lite-note">هذه واجهة لأحدث السجلات المحفوظة فقط، وليست بحثًا في الأرشيف كاملًا، ولا تعرض ترتيبًا لحظيًا أو أرقام رواج غير موثقة. ملفات الموضوعات غير المنسوبة لدولة تظهر عند اختيار جميع الدول.</p>
    </div>
    <style>
    .atn-lite{font-family:inherit;color:#173531;line-height:1.7;margin:18px 0;max-width:100%}
    .atn-lite *{box-sizing:border-box}
    .atn-lite-hero{background:linear-gradient(115deg,#103c38,#247266);border-radius:20px;color:white;padding:34px 30px;margin-bottom:28px}
    .atn-lite-overline{color:#f4d9a8;font-size:13px;font-weight:800;margin-bottom:6px}
    .atn-lite-hero h2{font-size:clamp(26px,4vw,42px);line-height:1.35;color:white;margin:0 0 12px}
    .atn-lite-hero p{color:#e5f3ee;margin:0 0 18px;max-width:660px}
    .atn-lite-search{background:#fff;color:#173531;padding:15px 18px;border-radius:13px;max-width:760px}
    .atn-lite-search label{font-size:13px;font-weight:700;display:block;margin-bottom:6px}
    .atn-lite-search input{padding:11px 14px;border:1px solid #d3e3df;border-radius:9px;width:100%;font:inherit;background:#fcfdfc;min-width:0;color:#173531}
    .atn-lite-platform-links{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:12px}.atn-lite-platform-links[hidden]{display:none}.atn-lite-platform-links a{border:1px solid #d3e3df;border-radius:7px;padding:3px 9px;color:#1c685f;text-decoration:none;font-weight:700}
    .atn-lite-share{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px;font-size:12px}
    .atn-lite-share-button,.atn-lite-reset-button{background:#e4f2ed;border:1px solid #bddbd0;border-radius:7px;padding:5px 11px;color:#19594f;font:inherit;font-weight:700;cursor:pointer}
    .atn-lite-reset-button{background:#fff;color:#3c645d}
    .atn-lite-archive-search{font-size:13px;margin:3px 0 16px}.atn-lite-archive-search a{color:#1e6a5f;text-decoration:underline}
    .atn-lite-share-status{color:#47746a}
    .atn-lite-search details{margin-top:10px;font-size:13px}
    .atn-lite-search summary{cursor:pointer;color:#1c685f;font-weight:700}
    .atn-lite-search details label{margin-top:10px}
    .atn-lite-filters{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}.atn-lite-filters label{flex:1;min-width:180px}.atn-lite-type,.atn-lite-range{display:block;max-width:320px;width:100%;padding:7px;border:1px solid #d3e3df;border-radius:8px;background:#fff;color:#173531}
    .atn-lite-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:26px 0 12px}
    .atn-lite-heading h3{font-size:21px;margin:0;color:#173531}
    .atn-lite-heading span,.atn-lite-heading a{font-size:13px;color:#627975}
    .atn-lite-countries{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}
    .atn-lite-country{font:inherit;min-height:47px;border:1px solid #dce6e1;border-radius:10px;background:#fff;color:#203c38;padding:9px 6px;cursor:pointer}
    .atn-lite-country.current{border-color:#21766b;background:#e7f3ef;font-weight:800}
    .atn-lite-country-count{font-size:11px;color:#6a817a;white-space:nowrap;unicode-bidi:isolate}
    .atn-lite-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
    .atn-lite-card{padding:17px;background:#fff;border:1px solid #dce6e1;border-radius:12px;color:#173531;min-height:155px;display:flex;flex-direction:column;gap:10px;text-decoration:none!important}
    .atn-lite-card:hover{border-color:#28796e}
    .atn-lite-main-link{text-decoration:none!important;color:inherit}
    .atn-lite-main-link:hover{text-decoration:underline!important}
    .atn-lite-topic-search{border-top:1px solid #e3ebe7;padding-top:9px;display:flex;gap:7px;flex-wrap:wrap;align-items:center;font-size:11px}
    .atn-lite-topic-search span{color:#69807a}
    .atn-lite-topic-search a{background:#eaf4f0;border-radius:7px;padding:2px 8px;color:#1a5b53;text-decoration:none!important;font-weight:700}
    .atn-lite-topic-search a:hover{background:#d7ebe4}
    .atn-lite-kind{font-size:12px;color:#227466;font-weight:800}
    .atn-lite-card strong{font-size:15px;color:#173531;line-height:1.65}
    .atn-lite-card small{color:#6b807b;margin-top:auto}
    .atn-lite-count,.atn-lite-note{font-size:12px;color:#607974}
    .atn-lite-freshness{font-size:13px;color:#40665f;margin:4px 0 12px}
    .atn-lite-stale{color:#854b20;font-weight:700}
    .atn-lite-more-wrap{text-align:center;margin-top:18px}
    .atn-lite-more{font:inherit;background:#194941;color:#fff;padding:10px 24px;border:0;border-radius:9px;cursor:pointer}
    .atn-lite-note{margin:24px 0 0;text-align:center}
    @media(max-width:850px){.atn-lite-countries{grid-template-columns:repeat(4,minmax(0,1fr))}.atn-lite-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){.atn-lite-hero{padding:24px 16px}.atn-lite-countries{grid-template-columns:repeat(2,minmax(0,1fr))}.atn-lite-grid{grid-template-columns:1fr}.atn-lite-heading h3{font-size:18px}.atn-lite-heading span{display:none}}
    </style>
    <script>
    (function(){
      var root=document.getElementById(<?php echo wp_json_encode($uid); ?>);if(!root)return;
      var input=root.querySelector('input[type=search]'),kind=root.querySelector('.atn-lite-type'),range=root.querySelector('.atn-lite-range');
      var cards=Array.prototype.slice.call(root.querySelectorAll('.atn-lite-card'));
      var countries=root.querySelectorAll('.atn-lite-country'),more=root.querySelector('.atn-lite-more'),count=root.querySelector('.atn-lite-count');
      var current='',shown=18;
      function syncUrl(){
        var url=new URL(window.location.href);
        [['atn_q',input.value.trim()],['atn_country',current],['atn_kind',kind.value],['atn_days',range.value]].forEach(function(pair){
          if(pair[1])url.searchParams.set(pair[0],pair[1]);else url.searchParams.delete(pair[0]);
        });
        if(window.history&&window.history.replaceState)window.history.replaceState(null,'',url.toString());
      }
      function update(){
        syncUrl();
        var term=(input.value||'').normalize('NFKC').toLowerCase().trim(),type=kind.value,match=[];var days=Number(range.value)||0;var cutoff=days?Date.now()-days*86400000:0;
        cards.forEach(function(card){var text=card.getAttribute('data-title').normalize('NFKC').toLowerCase();var published=card.getAttribute('data-date')||'';var stamp=published?Date.parse(published):0;if((!current||card.getAttribute('data-country')===current)&&(!term||text.indexOf(term)!==-1)&&(!type||card.getAttribute('data-kind')===type)&&(!cutoff||(stamp&&stamp>=cutoff))){match.push(card)}card.hidden=true;card.style.display='none'});
        match.slice(0,shown).forEach(function(card){card.hidden=false;card.style.display='flex'});
        more.style.display=match.length>shown?'inline-block':'none';
        count.textContent=match.length ? ('عدد المواد المطابقة في أحدث الحصائل المحفوظة: '+match.length) : 'لا توجد نتائج في أحدث الحصائل المتاحة؛ استخدم الأرشيف الكامل للبحث الأوسع';
      }
      Array.prototype.forEach.call(countries,function(btn){btn.addEventListener('click',function(){current=btn.getAttribute('data-country');shown=18;Array.prototype.forEach.call(countries,function(b){b.classList.remove('current');b.setAttribute('aria-pressed','false')});btn.classList.add('current');btn.setAttribute('aria-pressed','true');update()})});
      var platforms=root.querySelector('.atn-lite-platform-links');
      function platformLinks(){var q=(input.value||'').trim();platforms.hidden=!q;if(!q)return;var encoded=encodeURIComponent(q);root.querySelector('.atn-lite-platform-google').href='https://trends.google.com/trends/explore?q='+encoded;root.querySelector('.atn-lite-platform-x').href='https://x.com/search?q='+encoded;root.querySelector('.atn-lite-platform-youtube').href='https://www.youtube.com/results?search_query='+encoded;}
      var params=new URL(window.location.href).searchParams;
      if(params.has('atn_q'))input.value=(params.get('atn_q')||'').slice(0,160);
      if(params.has('atn_country')&&Array.prototype.some.call(countries,function(b){return b.getAttribute('data-country')===params.get('atn_country')}))current=params.get('atn_country');
      if(['search','music','weekly','topic'].indexOf(params.get('atn_kind'))!==-1)kind.value=params.get('atn_kind');
      if(['1','7','30'].indexOf(params.get('atn_days'))!==-1)range.value=params.get('atn_days');
      Array.prototype.forEach.call(countries,function(b){var selected=b.getAttribute('data-country')===current;b.classList.toggle('current',selected);b.setAttribute('aria-pressed',String(selected));});
      var share=root.querySelector('.atn-lite-share-button'),shareStatus=root.querySelector('.atn-lite-share-status');
      root.querySelector('.atn-lite-reset-button').addEventListener('click',function(){
        input.value='';kind.value='';range.value='';current='';shown=18;
        Array.prototype.forEach.call(countries,function(b){var active=b.getAttribute('data-country')==='';b.classList.toggle('current',active);b.setAttribute('aria-pressed',String(active));});
        shareStatus.textContent='';update();platformLinks();
      });
      share.addEventListener('click',function(){syncUrl();var link=window.location.href;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(function(){shareStatus.textContent='تم نسخ رابط البحث';},function(){shareStatus.textContent='انسخ الرابط من شريط العنوان';});}else{shareStatus.textContent='الرابط ظاهر في شريط العنوان ويمكن نسخه';}});
      input.addEventListener('input',function(){shown=18;update();platformLinks()});kind.addEventListener('change',function(){shown=18;update()});range.addEventListener('change',function(){shown=18;update()});more.addEventListener('click',function(){shown+=18;update()});update();platformLinks();
    })();
    </script>
    <?php
    return ob_get_clean();
});


/**
 * ArabiaTrend main page: hide the redundant, initial filter-summary chips.
 * Preserve the canonical [arabiatrend_now] map, search panels and result cards.
 * No extra API requests, database writes or scheduled work.
 */
add_action('wp_footer', function () {
    if (!is_page(61258)) { return; }
    ?>
    <script id="atn-clean-duplicate-summary">
    (function(){
      'use strict';
      var labels=['جميع الدول العربية','كل الأنواع','آخر 24 ساعة','مسح الفلاتر'];
      function normalize(s){return String(s||'').replace(/\s+/g,' ').trim();}
      function tidy(){
        var root=document.querySelector('main')||document.querySelector('#content')||document.body;
        if(!root)return;
        var nodes=root.querySelectorAll('button,a,[role="button"],span,div,label');
        labels.forEach(function(label){
          for(var i=0;i<nodes.length;i++){
            var el=nodes[i];
            if(el.hasAttribute('data-atn-duplicate-hidden')||normalize(el.textContent)!==label)continue;
            if(el.querySelector('input,select,textarea'))continue;
            var target=el,steps=0;
            while(target.parentElement&&steps<3){
              var p=target.parentElement;
              if(p===root||p.tagName==='MAIN'||p.tagName==='ARTICLE'||p.tagName==='SECTION'||p.tagName==='BODY')break;
              if(normalize(p.textContent)!==label||p.children.length>3)break;
              target=p;steps++;
            }
            target.setAttribute('data-atn-duplicate-hidden','1');
            target.style.setProperty('display','none','important');
            break;
          }
        });
      }
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',tidy,{once:true});
      }else{tidy();}
      window.addEventListener('load',tidy,{once:true});
    })();
    </script>
    <?php
}, 99);


/**
 * Internal detail view for a clicked topic card.
 * Snapshots are read-only presentation context: not an editorial article.
 * These query-driven snapshots are intentionally excluded from indexing.
 */
add_action('send_headers', function () {
    if (is_page(86386)) {
        header('X-Robots-Tag: noindex, follow', true);
    }
});
add_filter('wp_robots', function ($robots) {
    if (is_page(86386)) {
        $robots['noindex'] = true;
        unset($robots['index']);
    }
    return $robots;
});
add_shortcode('atn_trend_detail', function () {
    $get = function ($key, $max) {
        if (!isset($_GET[$key]) || !is_string($_GET[$key])) { return ''; }
        return wp_html_excerpt(sanitize_textarea_field(wp_unslash($_GET[$key])), $max, '');
    };
    $title = $get('atn_title', 200);
    $summary = $get('atn_snapshot', 1000);
    $country = $get('atn_country', 55);
    if (!in_array($country, array_values(atn_lightview_country_codes()), true)) { $country = ''; }
    $kind = $get('atn_kind', 70);
    $date = $get('atn_seen', 60);
    $url = esc_url_raw($get('atn_source', 1500), array('https'));
    $host = $url ? strtolower((string) wp_parse_url($url, PHP_URL_HOST)) : '';
    // Only expose known media/search providers as source links.
    $allowed = array('youtube.com','youtu.be','dailymotion.com','music.apple.com','apple.com','spotify.com','soundcloud.com','tiktok.com','instagram.com','facebook.com','x.com','twitter.com','google.com','vimeo.com');
    $trusted = false;
    foreach ($allowed as $suffix) {
        if ($host === $suffix || substr($host, -strlen('.' . $suffix)) === '.' . $suffix) {
            $trusted = true;
            break;
        }
    }
    ob_start();
    ?>
    <section class="atn-topic-detail" dir="rtl" style="max-width:950px;margin:25px auto 50px;padding:0 15px;line-height:1.85">
      <?php if (!$title) : ?>
        <h2>تفاصيل الترند</h2>
        <p>اختر عنوان موضوع من <a href="<?php echo esc_url(home_url('/arab-trends-now/')); ?>">صفحة الترند العربي الآن</a> لعرض حصيلة الرصد الخاصة به.</p>
      <?php else : ?>
        <nav aria-label="مسار الصفحة" style="margin-bottom:20px;font-size:14px">
          <a href="<?php echo esc_url(home_url('/')); ?>">الرئيسية</a> /
          <a href="<?php echo esc_url(home_url('/arab-trends-now/')); ?>">الترند العربي الآن</a> /
          <span>تفاصيل الترند</span>
        </nav>
        <h2 style="font-size:clamp(24px,4vw,39px);margin:0 0 15px"><?php echo esc_html($title); ?></h2>
        <p style="color:#56736f;margin:0 0 22px">ملخص بيانات الرصد المتاحة عند فتح هذا الموضوع، وليس مادة صحفية مستقلة أو تحديثًا لحظيًا.</p>
        <?php if ($country || $kind || $date) : ?>
          <p style="background:#f1f6f3;border-radius:12px;padding:14px 18px">
            <?php if ($country) : ?><strong>الدولة:</strong> <?php echo esc_html($country); ?> &nbsp; <?php endif; ?>
            <?php if ($kind) : ?><strong>النوع:</strong> <?php echo esc_html($kind); ?> &nbsp; <?php endif; ?>
            <?php if ($date) : ?><strong>آخر رصد مذكور:</strong> <?php echo esc_html($date); ?><?php endif; ?>
          </p>
        <?php endif; ?>
        <?php if ($summary) : ?>
          <h3>تفاصيل الرصد المتاحة</h3>
          <div style="white-space:pre-line;background:#fff;border:1px solid #e1e9e6;border-radius:12px;padding:20px"><?php echo esc_html($summary); ?></div>
        <?php endif; ?>
        <?php if ($url && $trusted) : ?>
          <p style="margin-top:24px"><a href="<?php echo esc_url($url); ?>" target="_blank" rel="noopener noreferrer nofollow">فتح المحتوى الأصلي لدى المصدر الخارجي ↗</a></p>
        <?php endif; ?>
        <p><a href="<?php echo esc_url(home_url('/arab-trends-now/')); ?>">العودة إلى نتائج الرصد</a></p>
      <?php endif; ?>
    </section>
    <?php
    return ob_get_clean();
});

/**
 * Route the H3 TITLE only into the website's read-only detail view.
 * Do not alter thumbnail anchors or any platform/media links.
 */
add_action('wp_footer', function () {
    if (!is_page(61258)) { return; }
    ?>
    <script id="atn-title-internal-routing">
    (function(){
      'use strict';
      function cardFor(h){
        var p=h.parentElement,steps=0;
        while(p && steps<9){
          if(p.tagName==='MAIN'||p.tagName==='BODY')break;
          var text=String(p.textContent||'');
          if(text.indexOf('تفاصيل الرصد')!==-1 &&
             text.indexOf('متابعة الموضوع')!==-1 &&
             p.querySelectorAll('h3').length<=2 &&
             text.length<3800){return p;}
          p=p.parentElement;steps++;
        }
        return null;
      }
      function sourceHref(h,card){
        var titleAnchor=h.querySelector('a[href]')||h.closest('a[href]');
        if(titleAnchor){
          var original=titleAnchor.getAttribute('data-atn-source-href')||titleAnchor.href;
          if(original && /^https:\/\//i.test(original) &&
             (new URL(original,location.href)).hostname!==location.hostname)return original;
        }
        var images=card.querySelectorAll('a[href] img');
        for(var i=0;i<images.length;i++){
          var a=images[i].closest('a[href]');
          if(a&&/^https:\/\//i.test(a.href)&&new URL(a.href).hostname!==location.hostname)return a.href;
        }
        return '';
      }
      function destination(h,card){
        var title=String(h.textContent||'').replace(/\s+/g,' ').trim();
        if(title.length<2||title.length>200)return null;
        var u=new URL('/trend-detail/',location.origin);
        u.searchParams.set('atn_title',title);
        var src=sourceHref(h,card);
        if(src)u.searchParams.set('atn_source',src.slice(0,900));
        var text=String(card.innerText||card.textContent||'').trim();
        var countries=['السعودية','الإمارات','مصر','الكويت','قطر','البحرين','عُمان','الأردن','لبنان','العراق','سوريا','فلسطين','اليمن','ليبيا','تونس','الجزائر','المغرب','موريتانيا'];
        for(var i=0;i<countries.length;i++){
          if(text.indexOf(countries[i])!==-1){u.searchParams.set('atn_country',countries[i]);break;}
        }
        var kinds=['الفيديوهات الرائجة','الأغاني الرائجة','كلمات البحث الرائجة','الأصوات الرائجة','كل الترندات'];
        for(var j=0;j<kinds.length;j++){
          if(text.indexOf(kinds[j])!==-1){u.searchParams.set('atn_kind',kinds[j]);break;}
        }
        var date=text.match(/(?:آخر رصد|آخر تحديث)[^\n]{0,55}/);
        if(date)u.searchParams.set('atn_seen',date[0].slice(0,60));
        // Limited snapshot copied from the visible card; no network or DB writes.
        var summary=text.replace(title,'').replace(/متابعة الموضوع/g,'').trim().slice(0,900);
        if(summary)u.searchParams.set('atn_snapshot',summary);
        return u;
      }
      function headingFrom(target){
        var el=target && target.nodeType===3 ? target.parentElement : target;
        return el && el.closest ? el.closest('h3') : null;
      }
      function eligible(h){
        return h && cardFor(h);
      }
      function navigate(event){
        var h=headingFrom(event.target),card=eligible(h);
        if(!card)return;
        if(event.type==='keydown' && event.key!=='Enter' && event.key!==' ')return;
        var dest=destination(h,card);
        if(!dest)return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.assign(dest.toString());
      }
      function enhance(){
        var headings=document.querySelectorAll('h3');
        for(var i=0;i<headings.length;i++){
          var h=headings[i],card=eligible(h);
          if(!card||h.hasAttribute('data-atn-internal-title'))continue;
          h.setAttribute('data-atn-internal-title','1');
          var a=h.querySelector('a[href]')||h.closest('a[href]');
          if(a){
            if(/^https:\/\//i.test(a.href)){a.setAttribute('data-atn-source-href',a.href);}
            var dest=destination(h,card);
            if(dest)a.href=dest.toString();
          }else{
            h.setAttribute('role','link');
            h.setAttribute('tabindex','0');
          }
          h.style.cursor='pointer';
        }
      }
      document.addEventListener('click',navigate,true);
      document.addEventListener('keydown',navigate,true);
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});
      else enhance();
      window.addEventListener('load',enhance,{once:true});
    })();
    </script>
    <?php
}, 100);
