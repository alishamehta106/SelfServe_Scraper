# SelfServe Hotel Scraper

SelfServe Hotel Scraper is a Next.js MVP for collecting structured hotel data from a public hotel website, identifying missing or uncertain fields, letting hotel staff review and correct the data, and giving the operator a cleaned JSON or CSV export.

The project is intentionally built as an end-to-end prototype rather than a production system. The priority is clear data flow, practical scraping decisions, visible gaps, and a working review/export loop.

## What The App Does

1. A user enters a hotel website URL on the homepage.
2. The app verifies that the link appears to be an official hotel/property website.
3. The scraper crawls the site, including common hotel pages such as rooms, dining, amenities, policies, gallery, spa, offers, and contact pages.
4. The scraper extracts structured hotel information:
   - Hotel name
   - Phone, email, address, additional phones, additional addresses
   - Amenities
   - Dining venues, hours, menu items, and prices when available
   - Services
   - Policies
   - Room types
   - Images grouped by likely category
5. Gap detection flags missing, partial, or uncertain fields.
6. The app creates a hotel review link for staff and routes the operator to the internal dashboard.
7. Hotel staff edits the prefilled data and submits it.
8. The operator dashboard updates to show the submitted final data.
9. The operator can download JSON or CSV.

## Tech Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Prisma 6
- SQLite for local persistence
- Zod for canonical data validation
- Cheerio for static HTML parsing
- Playwright for browser-rendered pages
- Sharp for image probing
- ESLint for code quality
- Tailwind CSS/PostCSS styling with project-specific classes in `globals.css`

## Local Setup

Install dependencies:

```bash
npm install
```

Install Playwright Chromium if it is not already installed:

```bash
npx playwright install chromium
```

Create `.env`:

```bash
DATABASE_URL="file:./dev.db"
```

Generate Prisma client:

```bash
npm run postinstall
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful commands:

```bash
npm run lint
npm run build
npm run db:push
npm run db:studio
```

When running `npm run build`, stop the dev server first. Both `next dev` and `next build` write into `.next`, and running them at the same time can create missing chunk errors such as `Cannot find module './vendor-chunks/@swc.js'`.

## Program Flow

### 1. Homepage Intake

File: `src/app/page.tsx`

The homepage accepts a hotel URL or starts a demo record. For real URLs, it posts to:

```text
POST /api/hotels
```

The UI clears prior local state on load so a new visit starts fresh.

### 2. URL Verification

File: `src/lib/scraper/verifyHotelWebsite.ts`

Before scraping, the app checks whether the URL looks like a hotel website. It rejects obvious booking marketplace links and non-hotel pages. The verifier looks for signals such as:

- Hotel, resort, inn, motel, lodge, suites
- Rooms, accommodations, amenities, reservations
- Check-in/check-out language
- Front desk, concierge, parking, policies
- Hotel structured data
- Address and phone signals

This prevents creating scrape records for unrelated sites.

### 3. Scraping And Crawling

Main file: `src/lib/scraper/crawl.ts`

Supporting files:

- `src/lib/scraper/rendered.ts`
- `src/lib/scraper/jsonld.ts`
- `src/lib/scraper/sitemap.ts`
- `src/lib/robots.ts`

The crawler:

- Normalizes and validates the URL.
- Reads robots rules.
- Seeds the crawl with common hotel paths.
- Uses sitemap URLs when available.
- Scores links so hotel-relevant pages are crawled earlier.
- Fetches static HTML first.
- Uses Playwright on high-value or thin pages to capture JavaScript-rendered content.
- Extracts visible page text and keeps the source page list.
- Probes a small set of images.

Playwright does not bypass logins, CAPTCHAs, private APIs, robots restrictions, or complex manual flows. It helps when a public page renders useful content after JavaScript loads.

### 4. Extraction

Main file: `src/lib/extractors/fromText.ts`

Image files:

- `src/lib/extractors/imageDom.ts`
- `src/lib/extractors/imageProbe.ts`

The extractor combines visible text, HTML, Open Graph data, and JSON-LD hints into the canonical hotel object. It includes conservative formatting and cleanup rules:

- Phone numbers must match plausible phone formats.
- Addresses must look like real street addresses with ZIP/postal structure.
- Emails filter out placeholders and image filenames.
- Pet, cancellation, and smoking policies must match the correct policy type.
- Scraped policy question text is stripped before the hotel sees the draft.
- Pet policy does not accept generic marketing copy such as “pet-friendly rooms” unless policy details are present.
- Dining extraction uses bounded dining blocks so parking, pet policy, and other unrelated priced sentences are not treated as menu items.
- Dining hours are normalized into readable multi-line text when structured hours contain day ranges.
- Menu item extraction rejects policy, parking, valet, fee, and vehicle-price lines even when they contain dollar amounts.
- Room types reject noisy image/gallery/booking lines, press/article titles, addresses, amenities, and long description sentences.
- Image URLs are deduped, including query-string variants.
- Images are categorized as Rooms, Dining, Amenities, Property, or General when possible.

### 5. Canonical Schema

File: `src/lib/schema/hotel.ts`

This defines the canonical structured hotel payload used by scraping, review, normalization, and export.

Main shape:

- `hotel_name`
- `website`
- `contact`
- `amenities`
- `dining`
- `services`
- `policies`
- `room_types`
- `images`
- `metadata`

The same schema is used when hotel staff submits edits, so the review payload and export payload stay consistent.

### 6. Gap Detection

File: `src/lib/gap-detection.ts`

Gap detection checks the structured data and field confidence values. It marks fields as:

- `complete`
- `partial`
- `missing`
- `uncertain`

The review form uses these statuses to highlight fields that need attention.

### 7. Hotel Review Form

Files:

- `src/app/review/[hotelId]/[token]/page.tsx`
- `src/app/review/[hotelId]/[token]/ReviewForm.tsx`
- `src/app/api/hotels/[id]/review/route.ts`
- `src/app/api/hotels/[id]/upload/route.ts`
- `src/app/api/hotels/[id]/files/[filename]/route.ts`

Hotel staff sees the scraped draft in this order:

1. General info
2. Contact
3. Amenities
4. Dining
5. Services
6. Policies
7. Room types
8. Images

Staff can:

- Edit all prefilled fields.
- Add/remove dining rows.
- Add menu items and prices.
- Edit services and room types.
- Upload images.
- Submit the review.

The hotel client does not see JSON or CSV download buttons.

### 8. Normalization

File: `src/lib/normalize.ts`

When staff submits, the app merges scraped data and staff edits:

- Staff non-empty strings override scraper values and are treated as the final operator/export values.
- Contact arrays from the hotel form are deduped with the primary phone/address.
- Scraped policy answers are cleaned and checked against their policy type.
- Hotel-submitted policy answers are preserved as submitted.
- Room types submitted by the hotel are preserved after basic line trimming.
- Images submitted by the hotel are treated as the final image list.
- Provenance is recorded so exports can identify whether data came from scraper or hotel staff.

### 9. Operator Dashboard

Files:

- `src/app/operator/[hotelId]/[token]/page.tsx`
- `src/app/operator/[hotelId]/[token]/OperatorDashboard.tsx`
- `src/app/api/hotels/[id]/operator/route.ts`

The operator dashboard uses the same order as the hotel review form:

1. General info
2. Contact
3. Amenities
4. Dining
5. Services
6. Policies
7. Room types
8. Images
9. Exports

The dashboard shows whether hotel review is completed. It polls the operator API every 4 seconds so it updates after hotel staff submits, even if the operator page was already open.

Amenity wording distinguishes scraper uncertainty from confirmed staff review: draft data shows unchecked amenities as `Not found`, while completed hotel-submitted data shows unchecked amenities as `Not present`.

### 10. Exports

Files:

- `src/app/api/hotels/[id]/export/route.ts`
- `src/lib/export-report.ts`

The operator can download:

- JSON
- CSV

Before hotel review is complete, exports use the scraped draft. After review is complete, exports use normalized hotel-submitted data.

## Database Model

File: `prisma/schema.prisma`

The app stores one `Hotel` row per intake:

- `websiteUrl`
- `reviewToken`
- `operatorToken`
- `scrapedData`
- `gapReport`
- `missingFields`
- `normalizedData`
- `provenance`
- `status`
- `uploadedFiles`
- timestamps

Tokens separate the hotel review link from the internal operator dashboard.

## File Structure

```text
.
├── package.json
├── package-lock.json
├── next.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── tsconfig.json
├── prisma
│   ├── schema.prisma
│   └── init.sql
└── src
    ├── app
    │   ├── page.tsx
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── api
    │   │   └── hotels
    │   │       ├── route.ts
    │   │       └── [id]
    │   │           ├── export/route.ts
    │   │           ├── files/[filename]/route.ts
    │   │           ├── operator/route.ts
    │   │           ├── review/route.ts
    │   │           └── upload/route.ts
    │   ├── operator/[hotelId]/[token]
    │   │   ├── page.tsx
    │   │   └── OperatorDashboard.tsx
    │   └── review/[hotelId]/[token]
    │       ├── page.tsx
    │       └── ReviewForm.tsx
    └── lib
        ├── db.ts
        ├── demo-hotel.ts
        ├── export-report.ts
        ├── field-validation.ts
        ├── gap-detection.ts
        ├── hotel-tokens.ts
        ├── normalize.ts
        ├── robots.ts
        ├── schema/hotel.ts
        ├── extractors
        │   ├── fromText.ts
        │   ├── imageDom.ts
        │   └── imageProbe.ts
        └── scraper
            ├── crawl.ts
            ├── jsonld.ts
            ├── rendered.ts
            ├── sitemap.ts
            └── verifyHotelWebsite.ts
```

## Important Files

### App Routes

- `src/app/page.tsx`: homepage URL intake and demo start.
- `src/app/api/hotels/route.ts`: main intake endpoint. Verifies URL, runs scraper, detects gaps, creates DB row, returns review and operator paths.
- `src/app/review/[hotelId]/[token]/ReviewForm.tsx`: hotel staff editing UI.
- `src/app/api/hotels/[id]/review/route.ts`: validates submitted hotel edits, normalizes data, marks review completed.
- `src/app/operator/[hotelId]/[token]/OperatorDashboard.tsx`: internal dashboard and export UI.
- `src/app/api/hotels/[id]/operator/route.ts`: polling endpoint for live operator updates.
- `src/app/api/hotels/[id]/export/route.ts`: JSON and CSV export endpoint.
- `src/app/api/hotels/[id]/upload/route.ts`: image upload endpoint.
- `src/app/api/hotels/[id]/files/[filename]/route.ts`: serves uploaded files by token.

### Scraper And Extraction

- `src/lib/scraper/verifyHotelWebsite.ts`: official hotel-site verifier.
- `src/lib/scraper/crawl.ts`: main crawler.
- `src/lib/scraper/rendered.ts`: Playwright rendered-page helper.
- `src/lib/scraper/jsonld.ts`: JSON-LD extraction for hotel and restaurant hints.
- `src/lib/scraper/sitemap.ts`: sitemap URL discovery.
- `src/lib/robots.ts`: robots.txt handling.
- `src/lib/extractors/fromText.ts`: main structured data extraction.
- `src/lib/extractors/imageDom.ts`: image URL, caption, alt text, and category extraction.
- `src/lib/extractors/imageProbe.ts`: image metadata probing.

### Data And Output

- `src/lib/schema/hotel.ts`: canonical Zod schema and TypeScript types.
- `src/lib/gap-detection.ts`: missing/partial/uncertain field detection.
- `src/lib/field-validation.ts`: form validation for phones, addresses, times, and image URLs.
- `src/lib/normalize.ts`: merge staff edits with scraped data.
- `src/lib/export-report.ts`: readable JSON export and long-form CSV export.
- `src/lib/demo-hotel.ts`: local demo payload.
- `src/lib/db.ts`: Prisma client singleton.

## Data Accuracy Notes

The scraper is intentionally conservative for fields that are easy to misclassify:

- A random number is not treated as a phone number unless it matches a plausible phone format.
- Address extraction requires street-address structure.
- Policy fields must match their policy type.
- Generic marketing language is not enough to fill a policy field.
- Dining hours are displayed as multi-line text when needed.
- Menu extraction is limited to likely food/beverage lines and rejects pet, parking, valet, and other non-menu priced text.
- Room types avoid long marketing paragraphs, article titles, addresses, amenities, and image/gallery labels.
- Duplicate images are removed by normalized URL.

If the scraper cannot confidently extract something, the field should remain blank or be marked for review rather than inventing content.

## Known Limitations

- Some hotel sites block automated traffic.
- Some sites disallow crawling in `robots.txt`.
- CAPTCHA, login, browser security checks, and private booking engines are not bypassed.
- Playwright improves JavaScript-rendered pages but cannot solve every interactive website.
- Menu extraction only works when menu items/prices are visible in crawlable or rendered HTML.
- The app uses local SQLite and local uploaded files, so it is not production deployment-ready.

## Maintenance Rule

When code behavior, UI format, data schema, routes, scraper logic, or export format changes, update this README in the same change. The README should stay aligned with the current implementation so a new developer can understand the project without reading the full codebase first.
