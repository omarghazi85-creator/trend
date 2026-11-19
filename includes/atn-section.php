<?php
/** Shared presentation scope for existing and future trend pages. */
if (!defined('ABSPATH')) { exit; }

function atn_lightview_is_section($post = null) {
    static $known = array();
    if ($post === null) {
        if (!is_singular('page')) { return false; }
        $post = get_queried_object_id();
    }
    $post = get_post($post);
    if (!$post || $post->post_type !== 'page') { return false; }
    $id = (int) $post->ID;
    if (array_key_exists($id, $known)) { return $known[$id]; }
    $roots = array(61258, 61269);
    if (in_array($id, $roots, true)) { return $known[$id] = true; }
    $ancestors = array_map('intval', get_post_ancestors($post));
    if (array_intersect($roots, $ancestors)) { return $known[$id] = true; }
    foreach (array('arabiatrend_now', 'atn_archive_index', 'atn_lightview') as $tag) {
        if (has_shortcode($post->post_content, $tag)) { return $known[$id] = true; }
    }
    return $known[$id] = false;
}

add_filter('body_class', function ($classes) {
    if (is_singular('page') && atn_lightview_is_section(get_queried_object_id())) {
        $classes[] = 'atn-trend-section';
    }
    return array_values(array_unique($classes));
});

/** Read a quoted attribute from the opening tag of existing stored markup. */
function atn_lightview_archive_attribute($tag, $name) {
    $tag = substr($tag, 0, strpos($tag, '>') + 1);
    $pattern = '~(?<![\w:-])' . preg_quote($name, '~') . '\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27)~i';
    if (!preg_match($pattern, $tag, $match)) { return ''; }
    return html_entity_decode($match[1] !== '' ? $match[1] : ($match[2] ?? ''), ENT_QUOTES, 'UTF-8');
}

/**
 * Organize the archived source already stored on topic history pages.
 * Byte-preserve the historical table, methodology and native enrichment.
 * No content writes, extra lookups, remote requests or related-article queries.
 */
function atn_lightview_archive_sources($content) {
    $post = get_post();
    if (!is_string($content) || !$post || !atn_lightview_is_section($post) ||
        !preg_match('/^topic-[a-f0-9]{24}$/D', $post->post_name) ||
        strpos($content, 'data-atn-archive-source="1"') !== false ||
        !preg_match('~<section\b[^>]*\bclass="atna"~i', $content)) { return $content; }

    // These boundaries identify the two standalone source elements in the
    // saved topic template, excluding media nested inside daily result cards.
    if (!preg_match('~</nav>\s*((?:<p>\s*)?(<a\b[^>]*>[\s\S]*?</a>)(?:\s*</p>)?)(?=\s*<h2\b)~i', $content, $thumb, PREG_OFFSET_CAPTURE) ||
        !preg_match('~</table>\s*</div>\s*(<p>\s*(<a\b[^>]*>[\s\S]*?</a>)\s*</p>)~i', $content, $source, PREG_OFFSET_CAPTURE)) {
        return $content;
    }
    $thumbnail = $thumb[2][0];
    $source_anchor = $source[2][0];
    $classes = preg_split('/\s+/', atn_lightview_archive_attribute($thumbnail, 'class'));
    $label = trim(html_entity_decode(wp_strip_all_tags($source_anchor), ENT_QUOTES, 'UTF-8'));
    if (!in_array('atn-thumb', $classes, true) || strpos($thumbnail, '<img') === false ||
        !preg_match('/^فتح العمل الأصلي\s*↗?$/u', $label)) { return $content; }
    $url = atn_lightview_archive_attribute($source_anchor, 'href');
    if ($url !== atn_lightview_archive_attribute($thumbnail, 'href')) { return $content; }
    $parts = wp_parse_url($url);
    if (!is_array($parts) || !in_array(strtolower($parts['scheme'] ?? ''), array('http', 'https'), true) ||
        empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) ||
        preg_match('/[\x00-\x20\x7f]/', $url) || !esc_url($url)) { return $content; }
    $title = trim(preg_replace('/\s*\|\s*سجل الرواج\s*$/u', '', wp_strip_all_tags($post->post_title)));
    if ($title === '') { return $content; }
    $block = '<section class="atn-archive-sources" data-atn-archive-source="1" aria-label="تغطيات مرتبطة بالموضوع">'
        . '<h3>تغطيات مرتبطة بالموضوع</h3><div class="atn-archive-source">' . $thumbnail
        . '<div><strong>' . esc_html($title) . '</strong>'
        . '<small dir="ltr">' . esc_html(strtolower($parts['host'])) . '</small></div></div></section>';

    // Remove the later duplicate link, then organize the existing thumbnail
    // in its original position, before the saved history table.
    // Everything outside these exact byte ranges remains untouched.
    $result = substr_replace($content, '', $source[1][1], strlen($source[1][0]));
    return substr_replace($result, $block, $thumb[1][1], strlen($thumb[1][0]));
}
add_filter('the_content', 'atn_lightview_archive_sources', 90);
