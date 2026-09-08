# Local frontend dependencies

The HTML and Razor views load their frontend libraries from `wwwroot/lib`.
All runtime files are stored in the project and are included by ASP.NET Core
when publishing. No CDN or package restore is required to serve these assets.

| Dependency | Version | Local runtime files | Source |
| --- | --- | --- | --- |
| Bootstrap | 5.3.3 | `bootstrap/dist/` (existing files) | https://getbootstrap.com/ |
| GSAP and ScrollTrigger | 3.12.5 | `gsap/dist/` | https://registry.npmjs.org/gsap/-/gsap-3.12.5.tgz |
| Chart.js | 4.4.7 | `chart.js/dist/chart.umd.js` | https://registry.npmjs.org/chart.js/-/chart.js-4.4.7.tgz |
| Leaflet | 1.9.4 | `leaflet/dist/`, including `images/` | https://registry.npmjs.org/leaflet/-/leaflet-1.9.4.tgz |
| Google Fonts | Snapshot downloaded 2026-09-04 | `fonts/fonts.css` and adjacent font files | See `fonts/sources.json` for exact URLs and SHA-256 hashes |

The existing local jQuery and validation packages remain in their original folders.
The Chart.js npm UMD distribution is already minified despite its `.js` filename.
Source maps and upstream package metadata are retained for the added libraries.
License files are included where supplied; GSAP's license notice is retained in
its scripts, package metadata, and README.

Local fonts cover Manrope (400–800), Noto Sans Devanagari (400–700), Noto Sans
Oriya (400–700), and Source Serif 4 (600–700). Font styles and display behavior
come from the original Google Fonts stylesheet. Their SIL Open Font Licenses
are stored alongside the fonts. The stylesheet uses only relative local URLs.

The map pages still retrieve their basemap tiles from OpenStreetMap. Tiles are
an external map service, not a frontend package; this change does not make
the basemap available offline. Ordinary links to partner websites and resources
also remain external.

When updating a library, copy its runtime dependencies and license notices,
update the relevant view references and this inventory, and verify that CSS
images and fonts resolve locally. HTML views use paths relative to the site's
root-level HTML pages; Razor views use `~/lib/` application-relative paths.
