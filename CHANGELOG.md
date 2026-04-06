# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-05

### Changed

- Split the analytics runtime into explicit capture, ingestion, reporting, and admin catalog layers
- Refactored `/track` to delegate event normalization and persistence through dedicated capture and ingestion modules
- Introduced a portable ingestion backend to encapsulate raw event writes, custom event writes, and daily stats updates
- Refactored reporting routes to use a portable reporting backend instead of querying storage directly
- Migrated the main analytics dashboard and site overview widget to the reporting layer for core stats flows
- Extracted admin detection catalog building into a dedicated module so admin routing no longer mixes UI orchestration with storage querying
- Added a shared reporting backend resolver for dashboard and route consumers

### Fixed

- Aligned `StorageCollection.deleteMany` typing with the EmDash storage contract
- Hardened the release by removing remaining loose typing from the new runtime-split layers

### Tests

- Added coverage for capture normalization and filtering
- Added coverage for portable ingestion and `handleTrack()` integration
- Added coverage for portable reporting backends and reporting routes
- Added coverage for dashboard/widget and admin catalog integration flows

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
