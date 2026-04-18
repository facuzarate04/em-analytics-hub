# em-analytics-hub

CMS-aware, portable, privacy-first analytics for [EmDash](https://github.com/emdash-cms/emdash).

Track pageviews, UTM campaigns, custom events, funnels, goals, forms analytics, and more — segmented by route, template, and collection. Works on Cloudflare Workers and Node.js self-hosted.

**100% free and open source.** No license keys, no feature gates, no paid tiers.

<p align="center">
  <img src="./docs/screenshots/overview.png" alt="Analytics overview dashboard" width="49%" />
  <img src="./docs/screenshots/conversion.png" alt="Funnels, goals, and forms analytics" width="49%" />
</p>

## Install

```bash
npm install em-analytics-hub
```

```ts
// astro.config.mjs
import emdash from "emdash/astro";
import { analyticsHub } from "em-analytics-hub";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [analyticsHub()]
    })
  ]
});
```

Add the beacon component to your theme layout:

```astro
---
import AnalyticsBeacon from "em-analytics-hub/astro";
---

<AnalyticsBeacon />
```

## Features

- Dashboard inside EmDash admin
- Pageviews and unique visitors
- Top pages with template and collection segmentation
- Referrer breakdown
- UTM attribution (source, medium, campaign, term, content)
- Campaign intelligence with engagement metrics per source
- Custom events with counts, trends, and property breakdowns
- Funnels
- Goals (page, form, event)
- Forms analytics
- Countries breakdown
- Period comparison
- Configurable data retention (default: 365 days)
- Works on Cloudflare and Node.js

Goals and funnels can be configured from dedicated admin pages:

- `Analytics`
- `Goals`
- `Funnels`

## Complementary Plugins

If you want a lighter, post-focused analytics experience, pair this plugin with [em-content-insights](https://github.com/facuzarate04/em-content-insights).

- `em-analytics-hub` is the broader analytics layer for campaigns, custom events, funnels, goals, and forms.
- `em-content-insights` is optimized for editorial and post-level performance inside EmDash.
- They can coexist in the same EmDash installation when you want both business analytics and content analytics.

## Custom Events

Track custom events from your theme or pages:

```js
window.emAnalytics.track("cta_click", { variant: "hero", page: "pricing" });
```

Events appear in the dashboard with counts, trend charts, and property breakdowns.

## UTM Tracking

UTM parameters are captured automatically from URLs:

```
https://yoursite.com/blog/post?utm_source=twitter&utm_medium=social&utm_campaign=spring2026
```

Source, medium, campaign, term, and content are captured automatically and feed the campaign insights shown in the dashboard.

## Template and Collection Metadata

Add meta tags to your theme layouts to enable template and collection segmentation:

```html
<meta name="em:template" content="blog-post" />
<meta name="em:collection" content="blog" />
```

## Privacy

- No cookies
- No fingerprinting
- No localStorage
- Daily-rotating IP hashes (cannot cross-match visitors across days)
- Honors Do Not Track (DNT)
- Bot and crawler filtering
- Configurable excluded paths and IPs

## Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| Excluded Paths | Plugin setting | Comma-separated path prefixes to skip | `/_emdash/,/admin/` |
| Excluded IPs | Plugin setting | Comma-separated IPs to filter | Empty |
| Data Retention | Plugin setting | Days to keep raw events | 365 |

## Support the Project

em-analytics-hub is free and open source. If you find it useful, consider supporting the project:

- Star the repository
- Report bugs and suggest features
- Contribute code or documentation
- [Buy me a coffee](https://buymeacoffee.com/facuzarate)

## License

MIT — see [LICENSE](./LICENSE).
