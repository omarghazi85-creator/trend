<?php
/**
 * Plugin Name: ArabiaTrend Light View
 * Description: Lightweight read-only UI for ArabiaTrend archive pages; no scheduled tasks or content writes.
 * Version: 0.7.0
 * Requires PHP: 7.4
 * Author: ArabiaTrend
 */
if (!defined('ABSPATH')) { exit; }
add_shortcode('atn_lightview', function () {
    // Existing archive index contains canonical, indexed child pages.
    $key = 'atn_lightview_latest_v5';
    $items = get_transient($key);
    $country_codes = array('sa'=>'السعودية','ae'=>'الإمارات','eg'=>'مصر','kw'=>'الكويت','qa'=>'قطر','bh'=>'البحرين','om'=>'عُمان','jo'=>'الأردن','lb'=>'لبنان','iq'=>'العراق','sy'=>'سوريا','ps'=>'فلسطين','ye'=>'اليمن','ly'=>'ليبيا','tn'=>'تونس','dz'=>'الجزائر','ma'=>'المغرب','mr'=>'موريتانيا');
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
    $countries = array_values($country_codes);
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
        <?php foreach ($countries as $c) : ?><button type="button" class="atn-lite-country" data-country="<?php echo esc_attr($c); ?>" aria-pressed="false"><?php echo esc_html($c); ?></button><?php endforeach; ?>
      </div>
      <div class="atn-lite-heading"><h3>أحدث المواد المؤرشفة</h3><a href="<?php echo esc_url(home_url('/trend-archive/')); ?>">فتح الأرشيف الكامل</a></div>
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
      <p class="atn-lite-note">تعرض هذه الصفحة السجلات المؤرشفة المنشورة، ولا تدّعي تحديثًا لحظيًا أو أرقام رواج غير متاحة</p>
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
