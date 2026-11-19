# Restore native trend details — 2026-11-19

Release: ArabiaTrend Light View 0.12.5 (section-wide follow-up to 0.12.4).

## Problem and correction

The temporary `/trend-detail` snapshot page flattened card text and bypassed the existing detail renderer. Titles now use each card's existing native topic URL from its follow control or detail action. Video and audio thumbnails retain their original external destinations.

The original renderer remains responsible for external sources and internal related coverage. External sources appear first; internal coverage is last and remains absent when the original renderer has no matching articles. Scoped CSS improves heading and list spacing. No replacement related-article query or content generation was introduced.

The initial shortcode output is repaired with `WP_HTML_Tag_Processor`; a narrowly scoped observer handles additional cards in `.atn-dashboard`. No click interception is used. Old `/trend-detail` links temporarily redirect to the existing search with the encoded title; no topic IDs are guessed and URL-supplied snapshots are no longer displayed.

## Scope and verification

- Shared scope now includes the current section and archive roots (61258/61269), their existing and future descendants, and pages using the known trend shortcodes. There is no date cutoff or individual-item allowlist.
- Archive `.atna` typography and `.atna-grid` title enhancement now share the spacing/routing rules. Existing archived topic thumbnails and their standalone source link are normalized into one source section without rewriting saved content.
- Historical tables and the native latest-observation enrichment remain intact. No extra source collection, related-article search, scheduled task, or post creation was added.
- Where a historical summary has only a plain title and no saved native destination, it is left as text. Do not infer a 64-character topic key from an archived 24-character slug or invent missing topic pages.
- Main page ID: 61258. Legacy snapshot page ID: 86386.
- Native `arabiatrend-now` plugin, saved monitoring data, collection schedules, and page content remain unchanged.
- Seven routing tests cover real search, audio and video card markup, appended cards, invalid destinations, DOM readiness, unchanged detail content, and the legacy redirect.
- Live browser verification covered an initial set of 24 cards, 48 cards after “عرض ترندات أكثر”, a video-title click, a detail page without internal coverage, and a detail page with external sources followed by internal coverage.
- Heading spacing was checked at a narrow 454 CSS-pixel viewport using browser zoom and at normal desktop width.

## Deployment and rollback

The installed plugin is `trend-atn-lightview-plugin/atn-lightview.php`, deployed from the `atn-lightview-plugin` branch ZIP. Keep the branch-based archive URL so WordPress preserves the plugin directory and activation state.

The main branch stores the same PHP file, routing tests, and fixture. Do not merge unrelated deployment-branch history into main.

If rollback is required, use a new revert commit on the deployment branch, verify its CI, and reinstall the same branch ZIP with overwrite enabled. Reverting to the earlier 0.12.1 behavior also restores the faulty snapshot route, so use a targeted revert when possible. No database cleanup or page deletion is required.
