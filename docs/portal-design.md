# Raahat portal redesign

The homepage and shared site chrome now use a compact public-service portal layout: bilingual masthead, accessibility strip, blue navigation, a large interactive situation map, a report summary, quick service cards, safety advisories and an official-resources directory. Raahat's original seal and citizen-project identity remain in place.

Reference destinations requested or identified:

- NDEM / NRSC: https://ndem.nrsc.gov.in/#/
- NDMA: https://ndma.gov.in/
- SACHET: https://sachet.ndma.gov.in/
- NIDM: https://nidm.gov.in/
- IMD: https://mausam.imd.gov.in/

Live inspection of these destinations was denied by the environment's outbound proxy (403). This is an independent interpretation of the portal style, not a verified pixel-for-pixel reproduction of NDEM. Domain additions were saved to the environment draft for review. Revisit the reference after access is enabled before claiming an exact match.

## Behavior

- The three banner tabs work with clicks and the Left/Right/Home/End keys. No auto-advancing animation.
- The live-map tab opens automatically on the homepage, with a pan/zoom map centred on India. Public reports and incident radii refresh every 5 seconds; requests omit authentication cookies so the API supplies public locations even for signed-in responders. Scroll-wheel zoom is disabled on the homepage to preserve normal page scrolling.
- The mobile navigation expands using a labelled button and closes after choosing a link.
- Language selection, text size, high contrast, theme settings, existing report uploads and responder routes retain their existing implementation.
- Report counts use existing Cloudinary data. If fetching fails, the summary shows dashes and an unavailable message, rather than an invented zero.
- The other banner tabs use a decorative geographic illustration. The full-map link opens the existing map route. The homepage base map remains available when report data cannot be fetched, with a visible unavailable status.
- System fonts and inline SVG icons remove extra font downloads from the page.

## Geography credit

`public/regional-overview.svg` is a locally rendered, decorative regional overview derived from Natural Earth's public-domain 1:110m country geometries:
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson

Natural Earth: https://www.naturalearthdata.com/about/terms-of-use/
The simplified overview is illustrative and is not an authoritative boundary map.

`src/lib/regional-overview.json` contains the same public-domain regional geometries, rounded to four decimal places. The homepage renders them as a Leaflet layer underneath the external raster tiles. If tile downloads fail, this geographic layer still pans and zooms with report markers. It does not contain street-level detail.

## Development and validation

Use the existing checkout; no worktree is required. Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`. Run the production server with `npm start -- --port 3010` after building. Live reports and uploads require the Cloudinary environment variables documented in `.env.example`; do not invent credentials.

Validate desktop/mobile widths, tab keyboard navigation, mobile menu, language switching, dark/high-contrast modes, and the existing report/check/map/responder routes. An HTTP page rendering successfully does not establish that Cloudinary uploads work without credentials. Deployment is separate from local validation.
