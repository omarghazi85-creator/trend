<?php
/**
 * Plugin Name: ArabiaTrend Light View
 * Description: Lightweight read-only UI for ArabiaTrend archive pages; no scheduled tasks or content writes.
 * Version: 0.12.13
 * Requires PHP: 7.4
 * Author: ArabiaTrend
 */
if (!defined('ABSPATH')) { exit; }
require_once __DIR__ . '/includes/atn-section.php';
/**
 * Public archive snapshot. Read-only and shared by the page and REST API.
 * The 15-minute transient prevents repeated 320-post queries on normal traffic.
 */
function atn_lightview_country_codes() {
    return array('sa'=>'السعودية','ae'=>'الإمارات','eg'=>'مصر','kw'=>'الكويت','qa'=>'قطر','bh'=>'البحرين','om'=>'عُمان','jo'=>'الأردن','lb'=>'لبنان','iq'=>'العراق','sy'=>'سوريا','sd'=>'السودان','ps'=>'فلسطين','ye'=>'اليمن','ly'=>'ليبيا','tn'=>'تونس','dz'=>'الجزائر','ma'=>'المغرب','mr'=>'موريتانيا','so'=>'الصومال','dj'=>'جيبوتي','km'=>'جزر القمر');
}
/**
 * Archive card titles must stay on a local archive detail page.
 * The media thumbnails and original-source controls are deliberately untouched.
 * This also checks cached legacy snapshots, without any extra database query.
 */
function atn_lightview_archive_link_allowed($url) {
    if (!is_string($url) || $url === '' || preg_match('/[\x00-\x20\x7f]/', $url)) { return false; }
    $parts = wp_parse_url($url);
    $home = wp_parse_url(home_url('/'));
    if (!is_array($parts) || !is_array($home) ||
        ($parts['scheme'] ?? '') !== ($home['scheme'] ?? '') ||
        strtolower($parts['host'] ?? '') !== strtolower($home['host'] ?? '') ||
        ($parts['port'] ?? null) !== ($home['port'] ?? null) ||
        isset($parts['user']) || isset($parts['pass']) ||
        isset($parts['query']) || isset($parts['fragment'])) { return false; }
    $base = rtrim($home['path'] ?? '', '/');
    $path = rtrim($parts['path'] ?? '', '/');
    return (bool) preg_match('~^' . preg_quote($base, '~') .
        '/trend-archive/[a-z0-9-]{3,130}$~D', $path);
}
/**
 * Use the observation period encoded in country archive slugs, not the day
 * on which WordPress published the page. Legacy/topic links keep publication
 * date. This is pure parsing; it makes no database or network requests.
 */
function atn_lightview_archive_period($slug, $published) {
    if (!is_string($slug) || !is_string($published) ||
        !preg_match('~^[a-z]{2}-(?:search|music|week)-(\\d{4})-(\\d{2})-(\\d{2})(?:-[a-z0-9]+)?$~D', $slug, $matches)) {
        return $published;
    }
    if (!checkdate((int) $matches[2], (int) $matches[3], (int) $matches[1])) {
        return $published;
    }
    return $matches[1] . '-' . $matches[2] . '-' . $matches[3];
}
/**
 * Fail closed on archive topic titles excluded by the editorial policy.
 * Filter before caching a new snapshot; re-check legacy cached snapshots
 * without issuing any extra database query. This does not modify raw tables.
 * Word-boundary checks avoid matching benign substrings (e.g. 'Essex').
 */
function atn_lightview_archive_title_allowed($title) {
    if (!is_string($title) || trim($title) === '') { return false; }
    // Multiple HTML entity layers can conceal excluded terms in historic titles.
    // Keep this bounded and fail closed if entity nesting still remains.
    for ($i = 0; $i < 6; $i++) {
        $decoded = html_entity_decode($title, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($decoded === $title) { break; }
        $title = $decoded;
    }
    if (preg_match('/&(?:amp;?|#(?:x[0-9a-f]{1,6}|[0-9]{1,7});?)/i', $title)) { return false; }
    $title = wp_strip_all_tags($title);
    $title = strtolower(strtr($title, array(
        'أ'=>'ا', 'إ'=>'ا', 'آ'=>'ا', 'ٱ'=>'ا', 'ى'=>'ي', 'ة'=>'ه', 'ؤ'=>'و', 'ئ'=>'ي'
    )));
    $title = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}\x{00AD}\x{061C}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $title);
    if (!is_string($title) || $title === '') { return false; }
    $title = preg_replace('/\s+/u', ' ', $title);
    $terms = array(
        'سكس', 'سيكس', 'سكسي', 'سيكسي', 'اباحي', 'اباحيه', 'اباحيات',
        'افلام اباحيه', 'مقاطع اباحيه', 'صور عاريه', 'محتوي جنسي صريح',
        'ميا خليفه', 'امارنا ميلر', 'مثلي', 'مثليه', 'المثليه', 'شذوذ جنسي',
        'porn', 'porno', 'pornography', 'pornhub', 'xvideos', 'xnxx', 'xhamster',
        'onlyfans', 'only fans', 'redtube', 'youporn', 'adult video', 'adult videos',
        'xxx', 'nudes', 'nude pics', 'sex tape', 'sex video', 'sex videos',
        'lesbian porn', 'gay porn', 'hentai', 'sex', 'sex pistols', 'nsfw',
        'nude', 'nudity', 'erotica', 'erotic', 'gay', 'lesbian', 'explicit sex'
    );
    foreach ($terms as $term) {
        if (preg_match('~(?<![\p{L}\p{N}])' . preg_quote($term, '~') . '(?![\p{L}\p{N}])~u', $title)) {
            return false;
        }
    }
    return true;
}
/**
 * Hide excluded archived detail pages even when opened directly from a
 * bookmark or a search engine. Listing/REST filtering alone is insufficient.
 * This uses only the already queried WP_Post and never edits stored records.
 */
function atn_lightview_archive_detail_blocked($post) {
    return $post instanceof WP_Post && $post->post_type === 'page' &&
        (int) $post->post_parent === 61269 &&
        !atn_lightview_archive_title_allowed(get_the_title($post));
}
add_action('template_redirect', function () {
    if (!is_singular('page') || is_preview()) { return; }
    $post = get_queried_object();
    if (!atn_lightview_archive_detail_blocked($post) ||
        current_user_can('edit_post', $post->ID)) { return; }

    global $wp_query;
    $wp_query->set_404();
    status_header(404);
    nocache_headers();
    header('X-Robots-Tag: noindex', true);
    $template = get_404_template();
    if ($template) { include $template; exit; }
    wp_die('هذه الصفحة غير متاحة', '', array('response' => 404));
}, 2);

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
            if (!atn_lightview_archive_title_allowed($title)) { continue; }
            if (strpos($title, 'كلمات البحث الرائجة') === false &&
                strpos($title, 'الأغاني الأكثر تشغيلًا') === false &&
                strpos($title, 'سجل الرواج') === false &&
                strpos($title, 'حصيلة ترندات') === false) { continue; }
            $link = get_permalink($p);
            if (!atn_lightview_archive_link_allowed($link)) { continue; }
            $slug_prefix = explode('-', $p->post_name, 2)[0];
            $item_country = isset($country_codes[$slug_prefix]) ? $country_codes[$slug_prefix] : '';
            $items[] = array(
                'country' => $item_country,
                'title' => $title,
                'link' => $link,
                'date' => atn_lightview_archive_period($p->post_name, get_the_date('Y-m-d', $p)),
                'date_iso' => get_the_date('c', $p),
                'kind' => strpos($title,'سجل الرواج') !== false ? 'topic' : (strpos($title,'الأغاني الأكثر تشغيلًا') !== false ? 'music' : (strpos($title,'حصيلة ترندات') !== false ? 'weekly' : 'search')),
            );
        }
        wp_reset_postdata();
        set_transient($key, $items, 15 * MINUTE_IN_SECONDS);
    }
    // Historic transient versions may have been created before exclusion rules.
    $safe = array_values(array_filter($items, static function ($item) {
        return is_array($item) && isset($item['title'], $item['link']) &&
            atn_lightview_archive_title_allowed($item['title']) &&
            atn_lightview_archive_link_allowed($item['link']);
    }));
    // Recalculate display dates from the already validated local permalink
    // even for old transient snapshots; do not invalidate the 15-minute cache.
    foreach ($safe as &$item) {
        $path = wp_parse_url($item['link'], PHP_URL_PATH);
        $slug = is_string($path) ? basename(rtrim($path, '/')) : '';
        if (isset($item['date']) && is_string($item['date'])) {
            $item['date'] = atn_lightview_archive_period($slug, $item['date']);
        }
    }
    unset($item);
    return $safe;
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
      <div class="atn-lite-heading"><h3>الدول العربية</h3><span>22 دولة عربية؛ تظهر الحصائل حيث تتوفر بيانات منشورة</span></div>
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
 * Reuse the original trend renderer and its stored topic IDs.
 * Never reconstruct a topic from visible card text or query-supplied snapshots.
 */
function atn_lightview_native_topic_url($url) {
    if (!is_string($url) || !$url) { return ''; }
    $url = html_entity_decode($url, ENT_QUOTES, 'UTF-8');
    $parts = wp_parse_url($url);
    $home = wp_parse_url(home_url('/'));
    if (!is_array($parts) || !is_array($home) ||
        ($parts['scheme'] ?? '') !== ($home['scheme'] ?? '') ||
        strtolower($parts['host'] ?? '') !== strtolower($home['host'] ?? '') ||
        isset($parts['user']) || isset($parts['pass']) ||
        ($parts['port'] ?? null) !== ($home['port'] ?? null)) { return ''; }
    $path = rtrim($parts['path'] ?? '', '/');
    $base = rtrim($home['path'] ?? '', '/');
    if ($path === $base . '/arab-trends-now') {
        $args = array();
        parse_str($parts['query'] ?? '', $args);
        return isset($args['atn_topic']) && is_string($args['atn_topic']) &&
            preg_match('/^[a-f0-9]{64}$/D', $args['atn_topic']) ? $url : '';
    }
    return preg_match('~^' . preg_quote($base, '~') . '/trend-archive/topic-[a-f0-9]{24}$~D', $path) ? $url : '';
}

/**
 * Correct the server-rendered title too, so normal links work before JavaScript.
 * Tokenize the existing shortcode output once; no database or network calls.
 */
function atn_lightview_restore_native_titles($output, $tag) {
    if (!in_array($tag, array('arabiatrend_now', 'atn_archive_index'), true) || !is_string($output) ||
        (strpos($output, 'atn-card') === false && strpos($output, 'atna-item') === false) ||
        !class_exists('WP_HTML_Tag_Processor')) {
        return $output;
    }
    $html = new WP_HTML_Tag_Processor($output);
    while ($html->next_tag(array('tag_name' => 'ARTICLE'))) {
        if (!$html->has_class('atn-card') && !$html->has_class('atna-item')) { continue; }
        $in_heading = false;
        $title_found = false;
        $destination = '';
        while ($html->next_tag(array('tag_closers' => 'visit'))) {
            $name = $html->get_tag();
            $closing = $html->is_tag_closer();
            if ($name === 'ARTICLE' && $closing) {
                if ($title_found && $destination) {
                    $html->set_bookmark('atn-card-end');
                    if ($html->seek('atn-card-title')) {
                        $html->set_attribute('href', $destination);
                        $html->remove_attribute('target');
                        $html->remove_attribute('rel');
                        $html->remove_attribute('data-atn-source-href');
                    }
                    $html->seek('atn-card-end');
                }
                break;
            }
            if ($name === 'H3') { $in_heading = !$closing; }
            if ($closing) { continue; }
            if ($name === 'A' && $in_heading && !$title_found) {
                $title_found = $html->set_bookmark('atn-card-title');
                $destination = atn_lightview_native_topic_url($html->get_attribute('href'));
                continue;
            }
            if ($name === 'A' && !$in_heading && !$destination) {
                $destination = atn_lightview_native_topic_url($html->get_attribute('href'));
            }
            if ($name === 'BUTTON' && $html->has_class('atni-follow')) {
                $follow_url = atn_lightview_native_topic_url($html->get_attribute('data-atni-url'));
                if ($follow_url) { $destination = $follow_url; }
            }
        }
    }
    return $html->get_updated_html();
}
add_filter('do_shortcode_tag', 'atn_lightview_restore_native_titles', 100, 2);

/**
 * Retire the temporary snapshot page without displaying URL-supplied content.
 * Old links lead to the existing search; no guessed IDs, new posts, or polling.
 */
function atn_lightview_legacy_detail_destination() {
    $title = isset($_GET['atn_title']) && is_string($_GET['atn_title'])
        ? wp_html_excerpt(sanitize_text_field(wp_unslash($_GET['atn_title'])), 150, '') : '';
    return $title ? add_query_arg(array('query' => rawurlencode($title), 'atn_period' => '30'), home_url('/arab-trends-now/'))
                  : home_url('/arab-trends-now/');
}
add_action('template_redirect', function () {
    if (!is_page(86386)) { return; }
    nocache_headers();
    wp_safe_redirect(atn_lightview_legacy_detail_destination(), 302, 'ArabiaTrend');
    exit;
}, 1);
add_filter('wp_robots', function ($robots) {
    if (is_page(86386)) { $robots['noindex'] = true; unset($robots['index']); }
    return $robots;
});
add_filter('rank_math/frontend/robots', function ($robots) {
    if (is_page(86386) && is_array($robots)) {
        $robots['index'] = 'noindex';
        $robots['follow'] = 'follow';
    }
    return $robots;
}, 100);
add_shortcode('atn_trend_detail', function () {
    return '<p><a href="' . esc_url(atn_lightview_legacy_detail_destination()) . '">عرض الموضوع في الترند العربي الآن</a></p>';
});

/**
 * Shared typography for current topics and every existing/future archive child.
 * Keep native source, history and conditional internal coverage renderers intact.
 */
add_action('wp_head', function () {
    if (!atn_lightview_is_section()) { return; }
    ?>
    <style id="atn-native-topic-spacing">
    body.atn-trend-section #the-post .entry-header .entry-title{line-height:1.55;margin-block-end:24px;overflow-wrap:anywhere}
    .atn-detail{line-height:1.85;overflow-wrap:anywhere}
    .atn-detail .atn-detail-head{margin-block:20px 24px;gap:12px}
    .atn-detail .atn-detail-head h1,.atn-detail .atn-detail-head h2{line-height:1.55;margin-block:0 20px}
    .atn-detail h3,.atn-detail .atn-v1-sources h3,.atn-detail .atn-coverage h3{line-height:1.65;margin-block:0 18px}
    .atn-detail .atn-history,.atn-detail .atn-v1-sources,.atn-detail .atni-context,.atn-detail .atn-coverage{margin-block-start:30px}
    .atn-detail .atn-v1-sources li,.atn-detail .atn-coverage li{line-height:1.85;margin-block:0 14px}
    .atn-detail .atn-v1-sources a,.atn-detail .atn-coverage a{line-height:1.85;overflow-wrap:anywhere}
    .atn-detail .atn-v1-sources small{display:block;margin-block-start:5px}
    .atn-detail .atn-coverage{padding-block-start:24px;border-block-start:1px solid #dce6e1}
    .atn-trend-section .atna,.atn-trend-section .atni-context{line-height:1.85;overflow-wrap:anywhere}
    .atn-trend-section .atna h2,.atn-trend-section .atna h3,.atn-trend-section .atni-context h3{line-height:1.65;margin-block:28px 18px;clear:both}
    .atn-trend-section .atna p{margin-block:0 16px}
    .atn-trend-section .atna .atna-nav{display:flex;flex-wrap:wrap;gap:12px;margin-block:20px 24px}
    .atn-trend-section .atna .atna-time{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:baseline}
    .atn-trend-section .atna .atna-time time{direction:ltr;unicode-bidi:isolate}
    .atn-trend-section .atna .atna-item{gap:16px;align-items:flex-start}
    .atn-trend-section .atna .atna-item>div{min-width:0}
    .atn-trend-section .atna .atna-item h3{margin-block:0 14px;overflow-wrap:anywhere}
    .atn-trend-section .atna .atna-table{overflow-x:auto;margin-block:20px 28px}
    .atn-trend-section .atna .atna-table th,.atn-trend-section .atna .atna-table td{line-height:1.85;vertical-align:top}
    .atn-trend-section .atna .atn-archive-sources{clear:both;margin-block:28px}
    .atn-trend-section .atna .atn-archive-source{display:flex;align-items:flex-start;gap:16px}
    .atn-trend-section .atna .atn-archive-source .atn-thumb{float:none;flex:0 0 auto;margin:0}
    .atn-trend-section .atna .atn-archive-source small{display:block;margin-block-start:6px;direction:ltr;unicode-bidi:isolate}
    .atn-trend-section .atna .atn-coverage{margin-block-start:30px;padding-block-start:24px;border-block-start:1px solid #dce6e1}
    @media(max-width:600px){
      body.atn-trend-section #the-post .entry-header .entry-title{font-size:clamp(25px,6.5vw,34px);line-height:1.6;margin-block-end:22px}
      .atn-detail .atn-detail-head{gap:10px;margin-block-end:24px}
      .atn-detail h3,.atn-detail .atn-v1-sources h3,.atn-detail .atn-coverage h3{font-size:20px;line-height:1.7;margin-block-end:18px}
      .atn-trend-section .atna h2,.atn-trend-section .atna h3,.atn-trend-section .atni-context h3{font-size:20px;line-height:1.7;margin-block-end:18px}
      .atn-trend-section .atna .atna-grid{grid-template-columns:minmax(0,1fr)}
    }
    </style>
    <?php
}, 99);

/**
 * Enhance cached and newly inserted result cards using their native detail link.
 * The thumbnail and external media controls are never changed.
 */
add_action('wp_footer', function () {
    if (!atn_lightview_is_section() || isset($_GET['atn_topic'])) { return; }
    ?>
    <script id="atn-title-internal-routing">
    (function(){
      'use strict';
      function nativeUrl(value){
        if(!value)return '';
        try{
          var u=new URL(value,location.href);
          if(u.origin!==location.origin||u.username||u.password)return '';
          var path=u.pathname.replace(/\/$/,'');
          if(path==='/arab-trends-now'&&/^[a-f0-9]{64}$/.test(u.searchParams.get('atn_topic')||''))return u.href;
          if(/^\/trend-archive\/topic-[a-f0-9]{24}$/.test(path))return u.href;
        }catch(e){}
        return '';
      }
      function enhance(root){
        var cards=[];
        if(root.matches&&root.matches('article.atn-card,article.atna-item'))cards.push(root);
        if(root.querySelectorAll)cards=cards.concat(Array.prototype.slice.call(root.querySelectorAll('article.atn-card,article.atna-item')));
        cards.forEach(function(card){
          var title=card.querySelector('h3 > a[href]');
          if(!title)return;
          var follow=card.querySelector('.atni-follow[data-atni-url]');
          var destination=nativeUrl(follow&&follow.getAttribute('data-atni-url'));
          if(!destination){
            var actions=card.querySelectorAll('.atn-card-actions a[href]');
            for(var i=0;i<actions.length;i++){
              destination=nativeUrl(actions[i].href);
              if(destination)break;
            }
          }
          if(!destination)destination=nativeUrl(title.getAttribute('href'));
          if(!destination)return;
          title.href=destination;
          title.removeAttribute('target');
          title.removeAttribute('rel');
          title.removeAttribute('data-atn-source-href');
        });
      }
      function start(){
        var roots=document.querySelectorAll('.atn-dashboard,.atna-grid');
        Array.prototype.forEach.call(roots,function(root){
          enhance(root);
        if(typeof MutationObserver==='function'){
          new MutationObserver(function(records){
            records.forEach(function(record){
              Array.prototype.forEach.call(record.addedNodes,function(node){
                if(node.nodeType!==1)return;
                var card=node.closest&&node.closest('article.atn-card,article.atna-item');
                enhance(card||node);
              });
            });
          }).observe(root,{childList:true,subtree:true});
        }
        });
      }
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
      else start();
    })();
    </script>
    <?php
}, 100);

