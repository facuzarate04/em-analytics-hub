# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-03

### Added

- Initial release of em-analytics-hub for EmDash CMS
- Native privacy-first tracking beacon (~2KB) with sendBeacon transport
- Pageview, scroll depth, read detection, engaged view, and recirculation tracking
- UTM attribution capture (source, medium, campaign) from URL parameters
- Custom events API via `window.emAnalytics.track(name, props)`
- Template and collection metadata capture via `<meta>` tags
- Admin dashboard with stat cards, timeseries charts, and trend comparisons
- Top pages table with template/collection segmentation
- Referrer breakdown with pie chart
- UTM campaign tables (source, medium, campaign)
- Custom events panel with counts and trend timeseries (top 5 events)
- Site Overview dashboard widget
- Daily-rotating IP hash for visitor deduplication (no cookies, no fingerprinting)
- DNT (Do Not Track) respect
- Bot/crawler filtering via User-Agent patterns
- Configurable excluded paths and excluded IPs
- Cron-based daily salt rotation and data pruning
- 30-day data retention (free plan)
- Portable IP extraction (Cloudflare → x-forwarded-for → x-real-ip fallback)
- Country detection via Cloudflare headers (graceful skip on Node.js)
- Astro component for manual beacon injection
- Feature gating system with Free/Pro/Business plan definitions
- Contextual upsell hints in dashboard for Pro features
- Full test suite (helpers, beacon, UTM, aggregation, privacy)
