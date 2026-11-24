# UI SPEC: KhataGST

## GOAL
Mobile-first PWA for shopkeepers on mid-range Android phones, many more comfortable in Hindi than English. Calm, trustworthy, "ledger paper" feel. Build ONLY the 4 screens below. No extra screens, no chatbot, no voice entry, no analytics dashboard, no gamification, no confetti.

## STACK
React + Vite + TypeScript, Tailwind (tokens below as CSS variables + Tailwind theme extension), shadcn/ui primitives where useful, Framer Motion (subtle only), Recharts (one small chart, Summary only), i18next (en, hi). Icons: lucide-react, stroke style. No emoji anywhere in the UI.

## DESIGN TOKENS
(use exactly; define as CSS variables, never hardcode hex in components)
```css
--ground: #E5E4E2          /* page background (platinum silver) */
--surface: #F6F6F5         /* cards, nav bar */
--border: #BDBCBA
--divider: #CBCAC8
--chip-neutral: #D5D4D2
--ink: #2A211C             /* primary text */
--text-2: #3D342E          /* secondary text */
--muted: #5E5650           /* helper text */
--primary: #6F4E37         /* mocha brown: primary buttons, active states (white text on it) */
--primary-deep: #3E2A1D    /* readiness card background */
--nav-pill-bg: #E3D6CB
--nav-pill-text: #4E3424
```

### HIGHLIGHTER
(lavender, used ONLY for "where this value came from" and the readiness arc):
```css
--hl-fill: rgba(176,160,235,0.30)
--hl-border: #8576C4
--hl-label-bg: #5B4B9A     /* (white text) */
--hl-arc: #CFC4F0
```

### SEMANTIC
(used ONLY for validation states, always with a text label, never colour alone):
```css
--blocking-bg: #F8DCE0  --blocking-text: #A8182B  --blocking-border: #E3A3AC
--warning-bg: #F3E9B8   --warning-text: #6B5400
--ok-bg: #D6F0E2        --ok-text: #0B5E3A
```

### UTILITY
```css
--demo-chip-bg: #2B2623  --demo-chip-text: #F5F4F2
--disabled-bg: #D0CFCD   --disabled-text: #4F4943
--on-primary-deep-title: #FFFDF7  --on-primary-deep-body: #E6DDD5
--ring-track: rgba(255,255,255,0.22)
--photo-paper: #FFFFFF  --photo-ink: #2B3A55  --photo-rule: #C9D3E6
```

**Rules:** lavender is never used for errors or warnings; red/yellow/green are never used for branding or decoration. Support light theme only (no dark mode).

## TYPOGRAPHY
Inter (Latin) + Noto Sans Devanagari (Hindi), loaded via fonts with `font-display: swap` and system fallbacks. Body 15-16px, secondary 13px, smallest label 12px (never below 12). Page title 18px/700. Hindi text line-height 1.5 minimum.

## LAYOUT AND ACCESSIBILITY
- Design for 390x844 first; must work from 360px width up; on desktop show the same layout centered at max 480px, or a two-column table view for Review at 1024px+.
- Touch targets minimum 44px (buttons 48px). Bottom navigation with 4 tabs: Scan, Review, Summary, Export. Active tab = filled pill (`--nav-pill-bg`, `--nav-pill-text`).
- Use real `<button>`, `<a>`, `<input>`+`<label>`. `aria-label` on icon-only buttons. Visible focus rings (2px `--primary` offset 2px). Respect `prefers-reduced-motion` (disable animations).
- Text contrast target: 4.5:1 for text, 3:1 for graphics. Run a contrast check script over all token pairs in CI and print failures; do not claim compliance without running it.

## GLOBAL BANNERS (always visible where tax data appears)
- Chip "DEMO data" (`--demo-chip`) whenever seeded demo data is shown.
- Chip "Rates: <rate_table_version>" (+ "(unverified)" if any row has verified=false).
- Chip "Draft: review before filing".
- Language toggle "EN | हिं" top-right on every screen; persists in user profile and localStorage (wrap storage in try/catch).

## SCREEN 1: SCAN
- Large camera button using `<input type="file" accept="image/*" capture="environment">` (no custom camera in MVP). Also "Choose from gallery" and "Enter manually".
- Document type selector (Sales / Purchase / Register page) as a 3-segment control.
- Simple client-side quality checks before upload (too dark, too blurry via variance of Laplacian on a downscaled canvas; show a friendly amber-free text hint, not a blocking error).
- Multi-page: thumbnails strip, remove a page, "Add another page".
- Upload progress bar, then an extraction state with skeleton rows (no spinners). If extraction FAILED/PARTIAL, show a friendly message and open the manual entry form.
- Friendly empty state: illustration (simple inline SVG), one clear action.

## SCREEN 2: REVIEW (reference mockup: the published "KhataGST Review Screen Mockup" canvas)
Top to bottom on mobile (390x844):
1. **Header:** title "Review entries", subtitle "Period: <Mon YYYY> . <Scheme> scheme", language toggle.
2. **Banner chips row** (see above).
3. **Source photo panel** (height ~132px, expandable to full screen on tap) showing the uploaded image. Tapping a field or entry highlights its bounding box on the photo: border 2px `--hl-border`, fill `--hl-fill`, plus a small tag (`--hl-label-bg`, white text, 10-11px) naming the field/row. ONLY if the extraction provider returns boxes; otherwise skip the highlight and show the full image without a box (never fake a box).
4. **Return Readiness card:** background `--primary-deep`, radius 14px. SVG ring: track `--ring-track`, arc `--hl-arc`, 76px, centered % label (`--on-primary-deep-title`). Value = `round(100 * entries with zero BLOCKING errors / total entries)`, computed from real validation results only. Text: "Return readiness" and "N of M entries have no blocking errors. Fix K to unlock export." Animate the arc with an ease-out transition (reduced-motion safe) when the value changes.
5. **Entry list** (cards, vertical). Each card shows party, invoice no, amount, and a severity badge with TEXT label (Blocking / Warning / OK). The entry with the highest-severity unresolved error is expanded by default and shows: bilingual explanation (selected language first, other language below), a "Listen" button (Web Speech API; if no voice for the language is available, hide the button and keep the text), and an action button. Action buttons only open the relevant field editor or propose a change the user must confirm; they never change data silently.
6. **Primary action:** "Export" button, disabled with label "Export locked: N blocking error(s)" while any BLOCKING error exists (`--disabled-*`), enabled (`--primary`, white text) otherwise.
7. **Bottom navigation.**

**Interactions:** swipe a card right to mark Reviewed, left to edit (also provide visible buttons for non-gesture users). Editing a field re-runs validation for that entry immediately and updates badges and the ring. Subtle row pulse (background flash with `--hl-fill`, 600ms) when an error is resolved. Desktop 1024px+: table view with editable cells, photo on the left, entries on the right.

## SCREEN 3: SUMMARY
- Period selector.
- Three stat tiles: Sales total, Tax collected, Purchases (for ITC reconciliation). Figures come only from reviewed entries; if there are blocking errors, show a note "Totals exclude entries with blocking errors" and exclude them. Do not show estimates or projections.
- One small Recharts bar chart: number of errors by rule (R01..R10), with text labels, using severity colours only for severity.
- List of unresolved errors, each linking back to the Review card.

## SCREEN 4: EXPORT
- "Ready to file" checklist with real status per item: no blocking errors, period selected, scheme selected, rate table version shown (and whether any rows are unverified), review completed. Each item shows pass/fail with an icon AND text.
- Format choice (Excel / JSON), download button (disabled until checklist passes).
- "Share with my CA" generates a read-only link (P2, build last, hide behind a feature flag).
- Static disclaimer: "Draft prepared for review. Check with your CA before filing."

## STATES AND COPY
- Every screen has loading (skeleton), empty, and error states with plain-language messages in both languages. No technical jargon, no raw error codes shown to the user (log them).
- All user-facing strings live in i18n files (`en.json`, `hi.json`). Validation messages use message keys with params, e.g. `rule.R04.mismatch` with `{rate, expected}`.

## BUILD ORDER FOR THE UI (after the backend steps in PROJECT_SPEC.md are working)
1. Tokens, theme, typography, layout shell, bottom nav, banners.
2. Review screen (static with seeded demo data first), then wire to the API.
3. Scan screen and upload/extraction states.
4. Readiness ring + validation badges live updates.
5. Export screen with checklist.
6. Summary screen and the one chart.
7. Hindi strings, Listen button, reduced-motion handling, contrast check script.
Stop after each step and show me before continuing.

## ACCEPTANCE CRITERIA
- All colours come from CSS variables; changing `--primary` updates every primary element.
- Lavender appears only on source highlights and the readiness arc; red/yellow/green appear only on validation states.
- Readiness percentage, totals and badges match the backend validation results exactly (add a test that compares them).
- Highlight boxes appear only when real bounding boxes exist.
- Export button is disabled whenever a BLOCKING error exists.
- App is usable at 360px width, with 44px touch targets, keyboard focus visible, and Hindi/English toggle working on every screen.
- No emoji, no dark mode, no chatbot, no gamification.

