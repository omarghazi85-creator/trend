# ArabiaTrend external worker

This repository stores the isolated Node.js/TypeScript backend for arabiatrend.com. This is a safe pre-production prototype: it does **not** replace the current WordPress trending plugin, run scheduled jobs, update archived trends or automatically publish content.

The Netlify project **arabiatrend-worker** exists separately from the English translation project. Connect this repository through the Netlify dashboard after review.

Controls:
- WordPress writes are disabled by default (`WP_WRITE_ENABLED` must be exactly `true`).
- A protected preview endpoint requires `ATN_WORKER_SECRET`; never commit secrets.
- Existing articles are never overwritten; optional creation is draft-only.
- The health endpoint never calls WordPress.
- No production scheduled jobs are configured.

Next stage: obtain the original `arabiatrend-now` v0.11.0 source, map source integrations and cron hooks, implement idempotent collection off hosting, and run shadow comparisons before cutover.
