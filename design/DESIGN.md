---
name: LogSight
description: Batch log anomaly detection printed as tickets, receipts and stamped report sheets.
colors:
  wine: "#7f011f"
  sand: "#f5ebd0"
  sand-deep: "#eadcb6"
  paper: "#fbf4e0"
  ink: "#2b1218"
  ink-soft: "#5c4046"
  rule: "#2b121838"
  view-semantic: "#96590f"
  view-structural: "#4f6b99"
  view-temporal: "#3b4a40"
  sev-low: "#b8902a"
  sev-medium: "#c24e14"
  sev-high: "#85141f"
  sev-critical: "#3f0810"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Arial Narrow', sans-serif"
    fontSize: "clamp(3rem, 2rem + 5.2vw, 5.75rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 68"
  headline:
    fontFamily: "'Archivo Variable', 'Arial Narrow', sans-serif"
    fontSize: "clamp(2.5rem, 2rem + 2.4vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 68"
  title:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
  lede:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Archivo Variable', 'Arial Narrow', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 80"
  data:
    fontFamily: "'Sometype Mono Variable', ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
rounded:
  none: "0"
  sm: "4px"
  md: "6px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
  "8": "4.5rem"
  "9": "7rem"
  gutter: "clamp(1rem, 4vw, 2.5rem)"
  page: "78rem"
components:
  button-primary:
    backgroundColor: "{colors.wine}"
    textColor: "{colors.sand}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 1.5rem"
    height: "3rem"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sand}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.wine}"
    rounded: "{rounded.none}"
    padding: "0 1.5rem"
    height: "3rem"
  button-ghost-hover:
    backgroundColor: "{colors.wine}"
    textColor: "{colors.sand}"
  button-small:
    backgroundColor: "{colors.wine}"
    textColor: "{colors.sand}"
    rounded: "{rounded.none}"
    padding: "0 0.75rem"
    height: "2.25rem"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 0.75rem"
    height: "3rem"
  ticket:
    backgroundColor: "{colors.wine}"
    textColor: "{colors.sand}"
    rounded: "{rounded.none}"
    padding: "2rem"
  ticket-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "2rem"
  receipt:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "2.7rem 1.5rem"
  stamp:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "1rem"
  notice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "1.5rem"
    width: "44rem"
  report-stub-link-active:
    backgroundColor: "{colors.wine}"
    textColor: "{colors.sand}"
    padding: "0.5rem"
  chart-tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sand}"
    typography: "{typography.small}"
    padding: "0.5rem 0.75rem"
  tag:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
---

## Direction update, 2 Oct 2026 (supersedes the older brand rules below where they differ)

Back to the printed ticket, stamp and receipt look, with a new palette and a conventional dashboard inside it.

- **Palette, by importance:** Primal Crimson `#940501` (actions, key figures, severity), Cloudlight Periwinkle `#95BBEA` (secondary, chart areas, info), Latte Silk `#FFF8E6` (the ground). Tints and shades of these only. Ink is a warm dark brown `#2A1514`, never black. No dark theme.
- **Background:** the latte ground with a soft periwinkle-to-crimson wash that drifts slowly. No orbs, no dot grids.
- **Views:** periwinkle blue `#2A5DBA`, green `#0E8A6A`, ochre `#B7791A` (validated together, all pairs). Always named beside the colour.
- **Severity:** a crimson ramp from light rose to deep crimson, always with its word.
- **Shapes:** ticket (hero, upload), receipt (live progress), stamps (three views), ink stamp, barcode. Small radius: 6px, 4px on chips, 0 on charts and table cells.
- **Type:** Archivo in capitals for titles, IBM Plex Sans for text, IBM Plex Mono for figures and log lines.
- **Dashboard:** five numbered groups (Overview, When and where, Incidents, The three views, Every flagged line), each with a one-line purpose.
- **Motion:** React Bits (SplitText, AnimatedContent, DecryptedText, LetterGlitch in binary digits). Plays once on scroll-in except the ambient background and the progress meter. All off under `prefers-reduced-motion`. No custom cursor. Hover changes are instant.
- **Never:** harsh gradients, lucide icons, pure white, rainbow colouring, drop shadows, feature cards in a row, emoji, liquid glass, em dashes, Inter/Geist/Space Grotesk, terminal windows, fake testimonials, bento grids, "it's not x, it's y" copy, checkmark bullets, pricing tiers, soft or pill corners, purple and black, radial orbs, dot grids, sparkle icons, animated arrows, coloured left stripes, basic pastels.
- **Must have:** a real product demo, skeleton loaders, Terms of service, Privacy policy.

---

# Design System: LogSight

## Overview

**Creative North Star: "The Ticket Office"**

A log run is a ticket. A file is handed in, the machine prints a receipt line by line as each pipeline stage completes, and what comes back is a stamped report sheet. Everything on screen is a piece of printed ephemera on a sand counter: admission tickets with punched notches and a perforated stub, receipts with a saw-tooth tear, postage stamps with scalloped edges, barcodes generated from the run id, and an ink stamp pressed onto finished work.

The system is flat and printed, with small corners. One heavy colour (Wine Red) sits on one pinned ground (Light Sand); structure comes from hairline rules, dashed perforations and edges cut with CSS masks. There is no shadow, no large radius and no dark theme: the user pinned the Light Sand ground, so the build ships a single light scheme. The system refuses the SaaS dashboard of rounded metric cards and the dark "hacker" console; figures are set as ledger tallies with dotted leaders, and one message is given per band.

Every figure on screen comes from the live API. The frontend holds only the human wording for backend identifiers (`frontend/src/lib/vocabulary.ts`); numbers, stage order and identifiers are never hard-coded.

**Key Characteristics:**
- Light Sand ground, Wine Red as the one heavy colour, wine-tinted ink for text.
- Small radius: 6px on cards, buttons, inputs, tags and panels; 4px on small chips; 0 on charts, table cells, bars and dividers. Set once as `--radius` and `--radius-sm` in `base.css`.
- No shadows; shapes are cut with masks so they sit on any ground.
- Heavy condensed caps for ticket lettering, a plain grotesque for reading, a mono only for log lines and figures.
- Hover and focus states change instantly; motion is reserved for printing, stamping and first reveal.
- Three view colours and a four-step severity ramp, always paired with a text label.

## Colors

A two-colour print job (wine on sand) with three stamp inks for the views and one warm ramp for severity.

### Primary
- **Wine Red** (`wine`): the one heavy colour. Primary buttons, the hero ticket, the hero headline, the wordmark, links, serial numbers, the active report tab, default bar fills, the focus ring, text selection and the ink stamp.

### Secondary
- **Ochre Ink** (`view-semantic`): the semantic view (what a line means).
- **Slate Blue Ink** (`view-structural`): the structural view (what shape a line has).
- **Green-Grey Ink** (`view-temporal`): the temporal view (when and how often).

The three stamp inks appear as stamp faces, share-bar segments, and square swatches beside the view name. They differ in lightness as well as hue and were run through a colour-blind separation validator.

### Tertiary
- **Severity ramp** (`sev-low`, `sev-medium`, `sev-high`, `sev-critical`): one warm ramp from light mustard through burnt orange and wine to near-black wine. Darker means more severe. Used for stacked chart bars and tag swatches, validated for colour-blind separation, and always accompanied by the severity word.

### Neutral
- **Light Sand** (`sand`): the page ground, pinned by the user. Also the text colour on wine and on ink.
- **Paper** (`paper`): a lighter sheet laid on the sand: receipts, paper tickets, inputs, notices, the report stub, expanded detail panels.
- **Deep Sand** (`sand-deep`): skeleton loaders and the scrollbar track only.
- **Wine Ink** (`ink`): body text, strong rules (1px solid), chart axes, the done mark on a receipt line, the tooltip ground, and the primary button's hover ground.
- **Soft Ink** (`ink-soft`): secondary text, notes under figures, chart tick labels, pending receipt lines.
- **Hairline** (`rule`): the same ink at 22% alpha for quiet dividers between rows.

### Named Rules
**The One Heavy Colour Rule.** Wine is the only saturated brand colour. View inks and severity colours encode data and never decorate; nothing else is introduced.

**The Label Beside Colour Rule.** A view or severity colour never stands alone. It is a swatch or a fill with the word next to it (a tag, a legend entry, a table column), so meaning survives without colour vision.

**The Pinned Ground Rule.** The ground is Light Sand in every state. There is no dark theme and no pure white surface on screen; white appears only as the page background in print.

## Typography

**Display Font:** Archivo Variable, set condensed (width 68%), with Arial Narrow as fallback
**Body Font:** Archivo Variable at normal width, with system-ui as fallback
**Label/Mono Font:** Sometype Mono Variable, with ui-monospace as fallback

**Character:** One variable grotesque does two jobs: squeezed and heavy in capitals it is ticket lettering, at normal width it is a quiet reading face. The mono is the machine's own voice and appears only where the machine is speaking: log lines, serials, figures, the receipt.

### Hierarchy
- **Display** (800, `clamp(3rem, 2rem + 5.2vw, 5.75rem)`, line-height 0.95, uppercase, width 68%): page-level statements: the landing headline, upload, receipt status, runs and legal page titles.
- **Headline** (800, `clamp(2.5rem, 2rem + 2.4vw, 3.75rem)`, line-height 0.95, uppercase, width 68%): landing band headings and the report sheet title. A 2.125rem step of the same face sets ticket lettering and the receipt brand.
- **Title** (700, 1.5rem, line-height 1.2, sentence case, normal width): section headings inside a report sheet and view rows. Sub-headings drop to 1.1875rem.
- **Lede** (400, 1.1875rem, line-height 1.45, max 62ch): the one sentence under a heading.
- **Body** (400, 1rem, line-height 1.55, prose capped at 68ch): reading text. Notes and captions use 0.8125rem.
- **Label** (700, 0.8125rem, letter-spacing 0.05 to 0.06em, uppercase, width 80%): buttons, tags, and lettering printed on tickets and stamps.
- **Data** (Sometype Mono, 0.9375rem, tabular figures, letter-spacing -0.01em): figures, serials, timestamps, receipt lines. Raw log lines are set at 0.875rem with `overflow-wrap: anywhere`.

### Named Rules
**The Machine Voice Rule.** Mono is for what the machine printed: log lines, run serials, numbers, durations. Table column headings and prose stay in the reading face even when the column beneath is mono.

**The Lettering Rule.** Condensed uppercase is for page statements and ticket lettering. Section headings inside a report are sentence case at normal width so a dense sheet stays readable.

## Layout

A single centred page column (`min(100% - 2 * gutter, 78rem)`, gutter `clamp(1rem, 4vw, 2.5rem)`) under a 4rem sticky masthead. Spacing follows a nine-step scale from 0.25rem to 7rem.

- **Landing** is a sequence of bands, one message each, separated by a hairline and padded 7rem top and bottom (4.5rem below 64rem). Split bands use asymmetric two-column grids (5:6, 4:7, 7:4) with a 4.5rem gap; the introduction column of a split band sticks while its partner scrolls.
- **Operate pages** (upload, receipt) are a statement column beside a paper object: the heading and status on one side, the ticket or receipt on the other.
- **Report** is a 14rem ticket stub of navigation beside one sheet. The sheet is a stack of sections, each opened by a 1px ink rule with 3rem above it and 1.5rem below. Figures are ledger tallies, lists are ruled rows, and paired sections sit in two equal columns.
- **Rows, not cards.** Runs, incidents and flagged lines are full-width rows separated by hairlines; detail opens in place as a paper panel with a 1px ink border.

Breakpoints: at 64rem landing splits and the report collapse to one column and the report stub becomes a wrapped row of bordered tabs; at 56rem operate pages, list rows and paired report sections collapse; at 40rem the ticket loses its stub column and notches (the stub moves below a horizontal perforation), secondary masthead links hide, and stamps shrink. Wide tables scroll horizontally inside their own container. Print hides the masthead, footer and grain, and keeps report sections unbroken.

Layers are named: page content 0, sticky bars 10, tooltips 20, paper grain 30.

## Elevation & Depth

Flat. No `box-shadow` is used anywhere in the build, and none is needed: tickets, receipts and stamps have their edges cut with masks, so each shape reads against any ground by silhouette alone. Depth is conveyed by tone and line only: Paper laid on Sand, a 1px ink border, a dashed perforation, and a fixed paper-grain overlay (multiply blend, 50% opacity, drawn once) that makes every surface the same sheet.

### Named Rules
**The Cut Edge Rule.** A surface is separated from the ground by its cut edge, a rule or a change of paper tone. Never by a shadow, a blur or a glow.

## Shapes

Corners use `--radius` (6px) on cards, buttons, inputs, tags and panels, `--radius-sm` (4px) on small chips, and 0 on charts, table cells, bars and dividers. Tickets, receipts and stamps keep their notched, torn or perforated edges, produced by masks; only their outer corners take `--radius`:

- **Ticket:** scalloped short edges (0.3rem teeth), two 0.75rem punched notches where the stub meets the body, and a 2px dashed perforation between them. An inner 1px frame in the current colour is available.
- **Receipt:** a 0.7rem saw-tooth tear along the top and bottom edges.
- **Stamp:** 0.45rem scallops on all four sides, a paper margin, a coloured face with an inset 1px paper keyline. Stamps are tilted two to two and a half degrees, alternating.
- **Ink stamp:** a 3px double border in wine, heavy condensed caps, rotated minus six degrees.
- **Bracketed label:** a value held between two 2px square brackets, after the user's data-graphics reference.
- **Barcode:** vertical bars generated deterministically from a run id or file name; decorative and hidden from assistive technology.
- **Binary field:** rows of 0 and 1 in wine mono at varied opacity, fading in from the top, used as page texture behind a ticket.

Lines come in four kinds: 1px solid ink (structure), 1px hairline (rows), 2px dashed (perforation, drop zone), 1px dotted (tally leaders). Swatches, bullets and receipt marks are small filled squares.

## Components

### Buttons
Flat printed blocks: small radius, uppercase, heavy.
- **Shape:** radius 6px, 2px wine border, minimum height 3rem, 1.5rem side padding, label type at 1rem with 0.05em tracking.
- **Primary:** wine ground, sand text.
- **Ghost:** transparent ground, wine text and border.
- **Small:** 2.25rem high, 0.75rem padding, 0.8125rem text; used in the masthead and inside notices.
- **Hover / Focus:** hover swaps colours instantly with no transition (primary goes to ink, ghost fills with wine). Pressing moves the button down 1px. Focus shows a 2px wine outline offset 3px, the same on every focusable element.
- **Disabled:** transparent ground, ink border, soft ink text, 60% opacity.
- **Text link:** wine, weight 600, 1px underline offset 0.2em; hover turns it ink.

### Tags
- **Style:** a small filled square swatch followed by the word in label type. No ground, no border, no pill. Chips take the 4px radius.
- **Use:** severity and view names in tables, legends, tooltips. In a legend the tag sits inside a bracketed label with its count in mono.
- **Filter chip:** an active filter is a 3rem-high box with a 1px wine border holding the filter text and a text link to clear it.

### Cards / Containers
There are no generic cards. Containers are paper objects.
- **Ticket:** wine or paper ground, body plus stub (11rem to 16rem wide), 2rem padding. Wine for the hero run, paper for forms and the closing call to action.
- **Receipt:** paper ground, mono type, dashed dividers, label left and figure right, barcode at the foot, ink stamp when finished.
- **Panel / Notice:** paper ground, 1px ink border, 1.5rem padding, used for expanded row detail and for empty states. The error notice has a 2px wine border and carries a small retry button.
- **Shadow Strategy:** none; see Elevation & Depth.

### Inputs / Fields
- **Style:** label above in weight 600, control 3rem high with a 1px ink border on a paper ground, wine caret, hint beneath in small soft ink.
- **Focus:** the global 2px wine outline.
- **Drop zone:** 2px dashed ink border; when a file is dragged over or chosen the border turns solid wine and the ground turns sand.
- **Upload progress:** a 3rem box with a 2px wine border filling with wine from the left, percentage on a paper chip in the centre.

### Navigation
- **Masthead:** sticky, sand ground, 1px ink rule beneath, 4rem high. Wordmark is a small barcode plus the name in weight 900 condensed wine caps. Links are weight 600; hover and the current page turn wine with a 2px underline. The upload action is a small primary button.
- **Report stub:** a paper slip with a 1px ink border and a dashed right edge, carrying the run serial, name, date span and barcode above a ruled list of sheets. The current sheet is a wine block with sand text. Below 64rem it becomes a row of bordered tabs with a dashed bottom edge.
- **Footer:** a 1px ink rule, small text, legal links.

### Tally
The ledger form of a figure: label, dotted leader, mono figure aligned right, with an optional small note beneath saying what the number measures. The large variant sets the figure at 1.5rem. This replaces metric cards throughout.

### Charts
- **Timeline:** stacked vertical bars in the severity ramp on hairline gridlines with a single ink baseline and mono tick labels. Hovering dims the other bars and shows an ink tooltip with tagged counts. A disclosure beneath gives the same data as a table.
- **Bar list:** horizontal bars with no track and no axis, the figure printed in mono directly after the bar. Bars are wine unless they encode a view or severity.
- **Share bar:** one bar split into labelled segments with a 2px gap.
- **Drift:** a 2px ink step line with flagged windows marked as wine ticks along the base and a dashed marker for the held-out period.

### Receipt (signature)
Each stage prints as the backend starts it, shows its elapsed time in the price column, and is ticked when the next begins. Pending lines are soft ink at 60% opacity; the running line is bold wine with a blinking square mark and its label resolving out of binary digits; done lines carry a filled ink square with a check; failed lines a cross. Totals follow a dashed divider. On completion an ink stamp reading "Processed" is pressed on (or "Void" on failure). The receipt feeds in from the top when it first appears.

### Motion
Motion means printing. Entrances use `cubic-bezier(0.16, 1, 0.3, 1)` over 0.35s to 0.9s: the receipt feeds, marks punch, the stamp presses, bars grow from the left, headline words rise, bands reveal on scroll, large figures count up. Skeleton loaders sweep sand-deep to paper every 1.4s. Scroll, text and count effects come from React Bits components used unmodified. Every animation is removed under `prefers-reduced-motion`, leaving content plainly visible. State changes on hover and focus have no transition at all.

### Loading, empty, error
Every fetched region has a skeleton shaped like the content it replaces, an empty notice that says what will appear and how to make it appear, and an error notice with the server's message and a retry.

## Do's and Don'ts

### Do:
- **Do** keep the ground Light Sand and use Paper for any sheet laid on it.
- **Do** take every corner from `--radius` (6px) or `--radius-sm` (4px); keep charts, table cells, bars and dividers at 0.
- **Do** separate surfaces with a cut edge, a 1px rule, a dashed perforation or a tone change.
- **Do** pair every view and severity colour with its word, and offer chart data as a table.
- **Do** set figures as tallies or mono table cells with a note saying what the number measures.
- **Do** make hover and focus changes instant, and keep the 2px wine focus outline on every control.
- **Do** take every figure from the API; put only human wording in `vocabulary.ts`.
- **Do** gate every animation behind `prefers-reduced-motion`.
- **Do** give each fetched region a skeleton, an empty state and an error state.
- **Do** use masks freely to cut ticket, receipt and stamp edges; mask gradients are how the shapes are made.

### Don't:
- **Don't** add `box-shadow`, blur, glow or any drop shadow.
- **Don't** go past 6px radius or use pills.
- **Don't** add a dark theme or a pure white screen surface.
- **Don't** animate on hover: no transitions, lifts, scale or moving arrows.
- **Don't** introduce a colour beyond wine, the sand and ink neutrals, the three view inks and the severity ramp.
- **Don't** use visible colour gradients as decoration, radial orbs, dot grids or glass effects. (Masks and the skeleton sweep are the only gradients in the build.)
- **Don't** lay out feature cards in a row or a bento grid. KPI tiles are allowed: a sand panel, 6px radius, wine figure, one per fact.
- **Don't** encode severity or view by colour alone.
- **Don't** set mono type for prose or headings, and do not use Inter, Geist or Space Grotesk.
- **Don't** use a terminal-window motif, emoji, sparkle icons or em dashes.
- **Don't** hard-code a figure, a stage list or an identifier in the frontend.
