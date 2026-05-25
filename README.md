# Powered by Positive — Novated Lease Calculator

Broker-facing novated lease calculator. UI keeps the existing science-blue chrome; PDF output uses the new customer-facing design.

## What changed vs. the PSP version

| Area | Change |
|------|--------|
| Header logo | Swapped to **Powered by Positive** mark (white version, sits on the dark header) |
| Footer logo & tagline | Same — Powered by Positive |
| PDF output | **Completely rewritten** to match the redesign mockup |
| App calculation engine | Unchanged — same formulas, brackets, FBT/ECM/LCA rules |
| Admin PIN | Unchanged |

## PDF design

The PDF generator lives in **`src/generatePbpPdf.js`** as a standalone module. `App.jsx` calls it via `generatePbpPdf({ ...state })`.

It produces a 2- or 3-page customer-facing A4 quote matching the design package mockup:

- **Page 1** — Hero (vehicle name + fortnightly net cost), Everything-included strip, Cash-vs-package comparison, Pricing/Lease/Tax breakdown
- **Page 2** — Recap band, ECM explainer (ECM quotes only), Broker card, two next-step pathways (online application CTA + phone), Terms, Consent callout
- **Page 3 (conditional)** — Luxury Car Adjustment supplement — appears automatically when `c.lca.applies` is true

The PDF works for both **ECM** and **EV-exempt** quotes from a single layout (the method pill swaps, the post-tax row drops). See the corresponding design file for the design rationale.

### Wiring the "Begin application" CTA

Currently the CTA in the PDF links to `#start-application` as a placeholder. To wire it to a real Salesforce flow / Experience Cloud form, edit the line in `generatePbpPdf.js`:

```js
doc.link(M + 4, y + pwH - 10, 44, 7, { url: "#start-application" });
```

Replace the URL with your flow endpoint, ideally with the quote ID pre-populated:

```js
doc.link(..., { url: "https://your-sf-domain/lwc/application?quoteId=" + data.quoteId });
```

### "Learn more" link (ECM explainer)

The ECM explainer button in the PDF links to:

```js
const ECM_LEARN_MORE_URL = "https://positivesalarypackaging.com.au/employee-contribution-method/";
```

Update this constant at the top of `generatePbpPdf.js` if you have a Powered-by-Positive–specific URL.

## Setup

1. Install dependencies: `npm install`
2. Run locally: `npm start`
3. Build for production: `npm run build`

## Deployment

Deployed via Netlify. Push to main branch to trigger a new deploy.

## Logo assets

The two PNGs live in `public/`:

- `powered-by-positive.png` — colour (blue + green tick). Used inside the **PDF header**.
- `powered-by-positive-white.png` — white-on-transparent. Used in the **app header + footer** (on the dark background).

## Admin PIN

Contact your administrator for the admin PIN.
