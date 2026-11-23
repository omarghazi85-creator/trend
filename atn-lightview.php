<?php
/**
 * Plugin Name: ArabiaTrend Light View
 * Description: Lightweight read-only UI for ArabiaTrend archive pages; no scheduled tasks or content writes.
 * Version: 0.12.36
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
    // Old topic titles can contain nested percent escapes, HTML entities, or
    // both (for example, p%6frnhub). Decode before checking the editorial gate.
    // Fail closed when more than six layers remain; do not rewrite stored data.
    for ($i = 0; $i < 6; $i++) {
        $decoded = rawurldecode(html_entity_decode($title, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($decoded === $title) { break; }
        $title = $decoded;
    }
    if (preg_match('/&(?:amp;?|#(?:x[0-9a-f]{1,6}|[0-9]{1,7});?)/i', $title) ||
        preg_match('/%[0-9a-f]{2}/i', $title)) { return false; }
    $raw_title = $title;
    // CSS escapes such as \6a avascript: or ur\6c(...) are resolved by
    // browsers inside style attributes. Scan their decoded form as well.
    // Keep the public output and stored content unchanged.
    if (strpos($raw_title, '\\') !== false) {
        $raw_title = preg_replace_callback(
            '~\\\\([0-9a-f]{1,6})(?:\r\n|[\x09-\x0d ])?|\\\\([^\r\n\f])~i',
            static function ($m) {
                if (isset($m[1]) && $m[1] !== '') {
                    $point = hexdec($m[1]);
                    if ($point < 1 || $point > 0x10ffff ||
                        ($point >= 0xd800 && $point <= 0xdfff)) { return ''; }
                    return html_entity_decode('&#' . $point . ';', ENT_QUOTES | ENT_HTML5, 'UTF-8');
                }
                return $m[2] ?? '';
            },
            $raw_title
        );
        if (!is_string($raw_title)) { return false; }
    }
    // Refuse executable HTML in saved archive labels and bodies before
    // cache admission or direct detail display. Inspect actual markup tags,
    // keeping prose mentioning onload=ready as ordinary text.
    if (preg_match('~<\s*/?\s*(?:script|object|embed|base|meta)\b~iu', $raw_title)) { return false; }
    // Match the external worker: oversized tags must not evade the bounded scanner.
    if (preg_match('~<\s*[a-z][^<>]{4097}~iu', $raw_title)) { return false; }
    $html_tags = array();
    if (preg_match_all('~<\s*[a-z](?:"[^"]*"|\'[^\']*\'|[^<>"\'])*>~iu', $raw_title, $html_tags)) {
        foreach ($html_tags[0] as $html_tag) {
            // A quoted value containing '<' or '>' must not evade the bound.
            if (strlen($html_tag) > 4096) { return false; }
            // Event-like text inside a quoted HTTPS URL is not an attribute.
            $attribute_names = preg_replace('~"[^"]*"|\'[^\']*\'~u', '""', $html_tag);
            if (!is_string($attribute_names) ||
                preg_match('~[\s/](?:on[a-z][a-z0-9_-]*|srcdoc)\s*=~iu', $attribute_names)) {
                return false;
            }
        }
    }
    // Inspect media/link attributes before stripping HTML. An otherwise safe
    // archive heading or excerpt must not conceal active URL schemes.
    // Decoding &quot; inside CSS can produce nested quote characters.
    // Inspect the entire style attribute before parsing individual HTML URLs.
    $css_markup = preg_replace('~[\x00-\x20\x7f\x{00AD}\x{061C}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]~u', '', $raw_title);
    if (!is_string($css_markup)) { return false; }
    $css_markup = str_replace(array('"', "'"), '', $css_markup);
    if (preg_match('~style=[^>]*url\((?:javascript|vbscript|data|file|blob):~i', $css_markup)) { return false; }
    $attributes = array();
    if (preg_match_all("~(?:^|[\s</])(href|src|srcset|data-srcset|poster|data-src|data-href|xlink:href|action|formaction|style)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))~iu", $raw_title, $attributes, PREG_SET_ORDER)) {
        foreach ($attributes as $attribute) {
            $name = strtolower($attribute[1]);
            $value = isset($attribute[2]) && $attribute[2] !== '' ? $attribute[2] :
                (isset($attribute[3]) && $attribute[3] !== '' ? $attribute[3] : ($attribute[4] ?? ''));
            $compact = preg_replace('~[\x00-\x20\x7f\x{00AD}\x{061C}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]~u', '', $value);
            if (!is_string($compact)) { return false; }
            if ($name === 'style') {
                $css = str_replace(array('"', "'"), '', $compact);
                if (preg_match('~url\((?:javascript|vbscript|data|file|blob):~i', $css)) { return false; }
            } elseif ($name === 'srcset' || $name === 'data-srcset') {
                foreach (explode(',', $compact) as $candidate) {
                    if (preg_match('~^(?:javascript|vbscript|data|file|blob):~i', $candidate)) { return false; }
                }
            } elseif (preg_match('~^(?:javascript|vbscript|data|file|blob):~i', $compact)) {
                return false;
            }
        }
    }
    $title = wp_strip_all_tags($title);
    $fold = array(
        'أ'=>'ا', 'إ'=>'ا', 'آ'=>'ا', 'ٱ'=>'ا', 'ى'=>'ي', 'ة'=>'ه', 'ؤ'=>'و', 'ئ'=>'ي'
    );
    $title = strtolower(strtr($title, $fold));
    $raw_title = strtolower(strtr($raw_title, $fold));
    $title = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}\x{00AD}\x{061C}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $title);
    $raw_title = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}\x{00AD}\x{061C}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $raw_title);
    if (!is_string($title) || $title === '') { return false; }
    $title = preg_replace('/\s+/u', ' ', $title);
    $raw_title = preg_replace('/\s+/u', ' ', $raw_title);
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
        if (preg_match('~(?<![\p{L}\p{N}])' . preg_quote($term, '~') . '(?![\p{L}\p{N}])~u', $title) ||
            preg_match('~(?<![\p{L}\p{N}])' . preg_quote($term, '~') . '(?![\p{L}\p{N}])~u', $raw_title)) {
            return false;
        }
    }
    // Match only distinctive excluded source names split by punctuation or whitespace.
    // Archive pages and legacy cache entries must use the same admission
    // standard as the external worker, without matching ordinary substrings.
    // The source names are ASCII; the label has already been entity-decoded.
    foreach (array('onlyfans', 'pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'youporn') as $source) {
        $split_name = implode('[._·•/+\\s-]*', str_split($source));
        $pattern = '~(?<![\p{L}\p{N}])' . $split_name . '(?![\p{L}\p{N}])~u';
        if (preg_match($pattern, $title) || preg_match($pattern, $raw_title)) { return false; }
    }
    return true;
}
/**
 * Hide excluded archived detail pages even when opened directly from a
 * bookmark or a search engine. Listing/REST filtering alone is insufficient.
 * This uses only the already queried WP_Post and never edits stored records.
 */
/**
 * Check the archived page body and excerpt already present on WP_Post.
 * No database reads, remote requests, writes, or new scheduled work.
 */
function atn_lightview_archive_content_allowed($post) {
    if (!($post instanceof WP_Post)) { return false; }
    foreach (array('post_content', 'post_excerpt') as $field) {
        if (!isset($post->$field)) { continue; }
        if (!is_string($post->$field)) { return false; }
        if (trim($post->$field) !== '' &&
            !atn_lightview_archive_title_allowed($post->$field)) { return false; }
    }
    return true;
}
function atn_lightview_archive_detail_blocked($post) {
    return $post instanceof WP_Post && $post->post_type === 'page' &&
        (int) $post->post_parent === 61269 &&
        (!atn_lightview_archive_title_allowed($post->post_title) ||
         !atn_lightview_archive_content_allowed($post));
}
/**
 * Reuse already saved archive cards as lightweight, shareable item details.
 * This does not create posts, infer a topic ID, fetch media, or touch the
 * original collector. Existing external/source links inside cards are kept.
 */
function atn_lightview_archive_focus_cards($content) {
    if (!is_string($content) || strlen($content) > 300000) { return array(); }
    $found = array();
    preg_match_all('~<article\b[^>]*class="[^"]*\batna-item\b[^"]*"[^>]*>[\s\S]*?</article>~iu', $content, $found);
    $items = array();
    $occurrences = array();
    foreach (array_slice($found[0] ?? array(), 0, 80) as $article) {
        $heading = array();
        if (!preg_match('~<h3\b[^>]*>([\s\S]*?)</h3>~iu', $article, $heading)) { continue; }
        // Preserve established internal heading links (notably SA/EG).
        // External heading links need a local detail, with their original
        // destinations kept as separate source controls.
        $source_url = '';
        if (preg_match('~<a\b~iu', $heading[1])) {
            $existing = array();
            if (!preg_match('~^\s*<a\b[^>]*\bhref\s*=\s*(["\'])(.*?)\1[^>]*>[\s\S]*?</a>\s*$~iu',
                $heading[1], $existing)) { continue; }
            $candidate = html_entity_decode($existing[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $parsed = wp_parse_url($candidate);
            $home = wp_parse_url(home_url('/'));
            if (!is_array($parsed) || !is_array($home) ||
                !in_array(strtolower($parsed['scheme'] ?? ''), array('https', 'http'), true) ||
                empty($parsed['host']) ||
                strtolower($parsed['host']) === strtolower($home['host'] ?? '') ||
                isset($parsed['user']) || isset($parsed['pass']) ||
                !atn_lightview_archive_title_allowed($candidate)) { continue; }
            $source_url = $candidate;
        }
        $name = trim(wp_strip_all_tags($heading[1]));
        if (!atn_lightview_archive_title_allowed($name)) { continue; }
        // Keep first-occurrence links unchanged; same headings can have
        // different saved source/media records and need separate detail URLs.
        $ordinal = $occurrences[$name] ?? 0;
        $key = $ordinal === 0 ? substr(hash('sha256', $name), 0, 16) :
            substr(hash('sha256', $name . "\n" . $ordinal), 0, 16);
        while (isset($items[$key])) {
            $ordinal++;
            $key = substr(hash('sha256', $name . "\n" . $ordinal), 0, 16);
        }
        $occurrences[$name] = $ordinal + 1;
        $items[$key] = array('name' => $name, 'html' => $article, 'source_url' => $source_url);
    }
    return $items;
}
/**
 * Replace only the heading; original media anchors in the saved card stay put.
 * When the heading itself was an outbound source link, expose that exact
 * destination as a separate, clearly labelled source control instead.
 */
function atn_lightview_archive_focus_linked_card($entry, $detail) {
    $linked = preg_replace_callback(
        '~(<h3\b[^>]*>)([\s\S]*?)(</h3>)~iu',
        static function ($match) use ($entry, $detail) {
            $title = empty($entry['source_url']) ? $match[2] : esc_html($entry['name']);
            $source = empty($entry['source_url']) ? '' :
                '<a class="atna-original-source" href="' . esc_url($entry['source_url']) .
                '" target="_blank" rel="noopener noreferrer">المصدر الأصلي</a>';
            return $match[1] . '<a href="' . esc_url($detail) . '">' .
                $title . '</a>' . $match[3] . $source;
        },
        $entry['html'], 1
    );
    return is_string($linked) ? $linked : $entry['html'];
}
function atn_lightview_archive_focus_post($post) {
    return $post instanceof WP_Post && $post->post_type === 'page' &&
        $post->post_status === 'publish' && (int) $post->post_parent === 61269 &&
        preg_match('~^[a-z]{2}-(?:search|music|week)-\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?$~D',
            $post->post_name) && !atn_lightview_archive_detail_blocked($post);
}
function atn_lightview_archive_focus_key() {
    $key = $_GET['atn_item'] ?? null;
    return is_string($key) && preg_match('/^[a-f0-9]{16}$/D', $key) ? $key : '';
}
/**
 * Read-only SEO identity for an existing saved archive card.
 * Uses the queried page only: no extra queries, writes or remote fetches.
 */
function atn_lightview_archive_focus_metadata() {
    if (is_admin() || !is_singular('page')) { return null; }
    $key = atn_lightview_archive_focus_key();
    if (!$key) { return null; }
    $post = get_queried_object();
    if (!atn_lightview_archive_focus_post($post)) { return null; }
    static $memo = array();
    $memo_key = (int) $post->ID . ':' . $key;
    if (array_key_exists($memo_key, $memo)) { return $memo[$memo_key]; }
    $cards = atn_lightview_archive_focus_cards($post->post_content);
    if (!isset($cards[$key])) { return $memo[$memo_key] = null; }
    $name = $cards[$key]['name'];
    return $memo[$memo_key] = array(
        'name' => $name,
        'url' => add_query_arg('atn_item', $key, get_permalink($post)),
        'title' => $name . ' | الترند العربي',
        'description' => $name . ' ضمن ' . wp_strip_all_tags($post->post_title) .
            '. اقرأ التفاصيل المحفوظة وروابط المصادر الأصلية في أرشيف الترند العربي.'
    );
}
/**
 * In the primary page loop only, display the focused saved topic as the H1
 * instead of the parent archive title. No page edit, redirect or new query.
 * All unrecognized/blocked item keys and archive overview titles are retained.
 */
function atn_lightview_archive_focus_heading_title($title, $post_id) {
    if (is_admin() || !is_singular('page') || !is_main_query() || !in_the_loop()) { return $title; }
    $post = get_queried_object();
    if (!($post instanceof WP_Post) || (int) $post->ID !== (int) $post_id) { return $title; }
    $item = atn_lightview_archive_focus_metadata();
    return $item ? $item['name'] : $title;
}
add_filter('the_title', 'atn_lightview_archive_focus_heading_title', 30, 2);
add_filter('the_content', function ($content) {
    if (is_admin() || !is_singular('page') || !is_main_query()) { return $content; }
    $post = get_queried_object();
    if (!atn_lightview_archive_focus_post($post)) { return $content; }
    $cards = atn_lightview_archive_focus_cards($content);
    if (!$cards) { return $content; }
    $requested = atn_lightview_archive_focus_key();
    if ($requested && isset($cards[$requested])) {
        $item = $cards[$requested];
        $back = get_permalink($post);
        $item_html = empty($item['source_url']) ? $item['html'] :
            atn_lightview_archive_focus_linked_card($item, add_query_arg('atn_item', $requested, $back));
        return '<section class="atna atna-focus" dir="rtl"><nav class="atna-nav" aria-label="روابط الأرشيف">' .
            '<a href="' . esc_url($back) . '">عرض الحصيلة الكاملة</a>' .
            '<a href="' . esc_url(home_url('/trend-archive/')) . '">أرشيف الترند العربي</a></nav>' .
            '<h2>' . esc_html($item['name']) . '</h2>' .
            '<p>هذا العنصر من الحصيلة المنشورة بعنوان «' . esc_html($post->post_title) .
            '». تفاصيله كما حفظت في سجل الرصد، دون استنتاجات أو مصادر جديدة.</p>' .
            '<div class="atna-grid">' . $item_html . '</div></section>';
    }
    // One sequential replacement per saved article: identical HTML must not
    // inherit an earlier duplicate heading's source link or detail key.
    // The existing thumbnail and external source anchors remain untouched.
    $ordered = array();
    foreach ($cards as $key => $item) {
        $ordered[] = array('key' => $key, 'html' => $item['html'],
            'name' => $item['name'], 'source_url' => $item['source_url']);
    }
    $next = 0;
    $linked_content = preg_replace_callback(
        '~<article\b[^>]*class="[^"]*\batna-item\b[^"]*"[^>]*>[\s\S]*?</article>~iu',
        static function ($match) use ($ordered, &$next, $post) {
            if (!isset($ordered[$next]) || $match[0] !== $ordered[$next]['html']) {
                return $match[0];
            }
            $entry = $ordered[$next++];
            $detail = add_query_arg('atn_item', $entry['key'], get_permalink($post));
            return atn_lightview_archive_focus_linked_card($entry, $detail);
        },
        $content
    );
    return is_string($linked_content) ? $linked_content : $content;
}, 25);
// The item URL has distinct read-only content: keep a self-canonical URL,
// without affecting the parent archive permalink or other Rank Math pages.
// Focused archive item metadata: align canonical, search and social previews.
// Unknown/blocked item keys retain the original page metadata.
add_filter('rank_math/frontend/canonical', function ($canonical) {
    $item = atn_lightview_archive_focus_metadata();
    return $item ? $item['url'] : $canonical;
});
add_filter('rank_math/opengraph/url', function ($url) {
    $item = atn_lightview_archive_focus_metadata();
    return $item ? $item['url'] : $url;
});
foreach (array('rank_math/frontend/title',
               'rank_math/opengraph/facebook/og_title',
               'rank_math/opengraph/twitter/twitter_title') as $filter_name) {
    add_filter($filter_name, static function ($title) {
        $item = atn_lightview_archive_focus_metadata();
        return $item ? $item['title'] : $title;
    });
}
foreach (array('rank_math/frontend/description',
               'rank_math/opengraph/facebook/og_description',
               'rank_math/opengraph/twitter/twitter_description') as $filter_name) {
    add_filter($filter_name, static function ($description) {
        $item = atn_lightview_archive_focus_metadata();
        return $item ? $item['description'] : $description;
    });
}
// A focused URL displays one saved card, not the parent archive's list.
// Avoid describing the focused item as the parent's ItemList in Rank Math.
// Identify the existing focused WebPage consistently with its H1/canonical;
// keep the parent graph, other nodes and unrecognized URLs untouched.
function atn_lightview_archive_focus_schema($data) {
    if (!is_array($data)) { return $data; }
    $item = atn_lightview_archive_focus_metadata();
    if (!$item) { return $data; }
    foreach ($data as $key => $node) {
        if (!is_array($node)) { continue; }
        $types = (array) ($node['@type'] ?? array());
        if (in_array('ItemList', $types, true)) { unset($data[$key]); continue; }
        if (in_array('WebPage', $types, true)) {
            $data[$key]['name'] = $item['name'];
            $data[$key]['description'] = $item['description'];
            $data[$key]['url'] = $item['url'];
            // Only rewrite Rank Math's existing page identifier, not custom IDs.
            if (isset($node['@id']) && is_string($node['@id']) &&
                substr($node['@id'], -8) === '#webpage') {
                $data[$key]['@id'] = $item['url'] . '#webpage';
            }
        }
    }
    return $data;
}
add_filter('rank_math/json_ld', 'atn_lightview_archive_focus_schema', 99);
// End focused archive item metadata.
add_action('template_redirect', function () {
    if (!is_singular('page')) { return; }
    // A public ?preview=true request must not bypass an excluded archive page.
    // Editors remain exempt only through the explicit edit_post capability below.
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

/**
 * The newer country archives (including Sudan, Somalia, Djibouti and Comoros)
 * use "حصيلة كلمات البحث" rather than the original "كلمات البحث الرائجة".
 * Keep both forms in the same read-only archive listing without touching the
 * original WordPress collector, historic URLs, cache cadence, or DB queries.
 */
function atn_lightview_archive_title_supported($title) {
    if (!is_string($title)) { return false; }
    foreach (array(
        'كلمات البحث الرائجة',
        'حصيلة كلمات البحث',
        'الأغاني الأكثر تشغيلًا',
        'سجل الرواج',
        'حصيلة ترندات'
    ) as $phrase) {
        if (strpos($title, $phrase) !== false) { return true; }
    }
    return false;
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
            $title = get_the_title($p);
            // The original HTML can conceal an excluded source in href/src.
            // Validate it before stripping attributes for the display card.
            if (!atn_lightview_archive_title_allowed($title)) { continue; }
            // Screen existing page fields before accepting a new cached card.
            if (!atn_lightview_archive_content_allowed($p)) { continue; }
            $title = wp_strip_all_tags($title);
            if (!atn_lightview_archive_title_supported($title)) { continue; }
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
    // Root-relative links from the native renderer are local URLs too.
    // Reject protocol-relative and backslash-obfuscated destinations.
    if ($url[0] === '/' && (strlen($url) === 1 || $url[1] !== '/') &&
        strpos($url, chr(92)) === false) {
        $url = home_url($url);
    }
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
        // Only the original topic key is canonical. Reject duplicate/extra
        // parameters and fragments instead of silently retaining them.
        $query = $parts['query'] ?? '';
        return !isset($parts['fragment']) &&
            preg_match('/^atn_topic=[a-f0-9]{64}$/D', $query) ? $url : '';
    }
    // Use an existing, canonical daily/weekly country archive permalink if the
    // original renderer already exposes it. Do not synthesize a page or redirect
    // visitors to a media source, and do not allow query/fragment overrides.
    if (isset($parts['query']) || isset($parts['fragment'])) { return ''; }
    $countries = atn_lightview_country_codes();
    $pattern = '~^' . preg_quote($base, '~') .
        '/trend-archive/([a-z]{2})-(search|music|week)-(\d{4})-(\d{2})-(\d{2})(?:-[a-z0-9]+)?$~D';
    if (preg_match($pattern, $path, $m) && isset($countries[$m[1]]) &&
        checkdate((int) $m[4], (int) $m[5], (int) $m[3]) &&
        atn_lightview_archive_link_allowed($url)) { return $url; }
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
          var topic=u.searchParams.get('atn_topic')||'';
          if(path==='/arab-trends-now'&&/^[a-f0-9]{64}$/.test(topic)&&u.search==='?atn_topic='+topic&&!u.hash)return u.href;
          if(/^\/trend-archive\/topic-[a-f0-9]{24}$/.test(path)&&!u.search&&!u.hash)return u.href;
          // Country cards can already contain a real internal archive action.
          // Reuse only its verified permalink; leave thumbnails and source
          // buttons untouched, even for Sudan, Somalia, Djibouti and Comoros.
          var m=/^\/trend-archive\/([a-z]{2})-(search|music|week)-(\d{4})-(\d{2})-(\d{2})(?:-[a-z0-9]+)?$/.exec(path);
          if(m&&!u.search&&!u.hash&&' sa ae eg kw qa bh om jo lb iq sy sd ps ye ly tn dz ma mr so dj km '.indexOf(' '+m[1]+' ')!==-1){
            var day=m[3]+'-'+m[4]+'-'+m[5];
            if(new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day)return u.href;
          }
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

