# em-analytics-hub

CMS-aware, portable, privacy-first analytics for [EmDash](https://github.com/emdash-cms/emdash).

Track pageviews, UTM campaigns, custom events, and more — segmented by route, template, and collection. Works on Cloudflare Workers and Node.js self-hosted.

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

The tracking beacon is injected automatically into all pages. No theme changes required.

## Features

### Free

- Dashboard inside EmDash admin
- Pageviews and unique visitors
- Top pages with template and collection segmentation
- Referrer breakdown
- UTM attribution (source, medium, campaign)
- Custom events with counts and trends
- 30-day data retention
- 1 site
- Works on Cloudflare and Node.js

### Pro

- Funnels and goals
- Campaign intelligence (conversion and engagement analysis)
- Forms and search analytics
- Custom event property breakdowns and filters
- Annotations and alerts
- Period comparison
- Data export
- Countries breakdown
- Advanced segments
- 365-day retention
- Up to 3 sites
- External integrations

## Custom Events

Track custom events from your theme or pages:

```js
window.emAnalytics.track("cta_click", { variant: "hero", page: "pricing" });
```

Events appear in the dashboard with counts and trend charts.

## UTM Tracking

UTM parameters are captured automatically from URLs:

```
https://yoursite.com/blog/post?utm_source=twitter&utm_medium=social&utm_campaign=spring2026
```

Source, medium, and campaign appear in the Campaigns section of the dashboard.

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

| Setting | Description | Default |
|---------|-------------|---------|
| Excluded Paths | Comma-separated path prefixes to skip | `/_emdash/,/admin/` |
| Excluded IPs | Comma-separated IPs to filter | Empty |
| Data Retention | Days to keep raw events | 30 |
| License Key | Pro license key | Empty |

## License

MIT — see [LICENSE](./LICENSE).
