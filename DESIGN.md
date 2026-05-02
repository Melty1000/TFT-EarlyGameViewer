---
name: "opnr.gg"
description: "A dense, player-controlled TFT build cockpit for sorting, filtering, and inspecting scraped comp signals."
colors:
  cockpit-void: "#08090d"
  panel-carbon: "#111216"
  panel-steel: "#15161b"
  ice-text: "#f7f7f7"
  ice-muted: "#f7f7f78f"
  ice-soft: "#f7f7f7c2"
  wire-line: "#f7f7f729"
  signal-lime: "#d9f933"
  success-mint: "#00df98"
  danger-orange: "#f2622c"
  rank-cyan: "#54d7ff"
  rank-violet: "#b7a4ff"
  legacy-violet: "#8560df"
  legacy-gold: "#f0b347"
typography:
  display:
    fontFamily: "Rajdhani, Arial Black, Impact, Helvetica Neue, Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0"
  headline:
    fontFamily: "Rajdhani, Arial Black, Impact, Helvetica Neue, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0"
  title:
    fontFamily: "Rajdhani, Segoe UI Variable Display, Bahnschrift, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0"
  body:
    fontFamily: "Rajdhani, Segoe UI Variable Text, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "DM Mono, Courier New, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  none: "0px"
  sm: "6px"
  md: "8px"
spacing:
  hair: "3px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "16px"
  panel-gap: "22px"
  panel-padding: "24px"
  header-bar: "36px"
  browser-bar: "38px"
components:
  button-bracket:
    backgroundColor: "transparent"
    textColor: "{colors.ice-text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "7px 8px"
    height: "34px"
  button-bracket-hover:
    backgroundColor: "transparent"
    textColor: "{colors.signal-lime}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "7px 8px"
    height: "34px"
  panel-shell:
    backgroundColor: "{colors.panel-carbon}"
    textColor: "{colors.ice-text}"
    rounded: "{rounded.none}"
    padding: "0"
  panel-drag-bar:
    backgroundColor: "transparent"
    textColor: "{colors.ice-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "{spacing.header-bar}"
  input-search:
    backgroundColor: "transparent"
    textColor: "{colors.ice-text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "28px"
  record-row:
    backgroundColor: "#f7f7f708"
    textColor: "{colors.ice-text}"
    rounded: "{rounded.none}"
    padding: "0"
  chip-filter:
    backgroundColor: "transparent"
    textColor: "{colors.ice-text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0"
---

# Design System: opnr.gg

## 1. Overview

**Creative North Star: "The Build Cockpit"**

opnr.gg is a desktop command surface for TFT players who want more control than any single build source gives them. The visual system should feel like a technical cockpit for comp discovery: dense, sharp, inspectable, and built for active manipulation. The dark dot-matrix field is not decoration alone; it creates a coordinate plane for draggable panels, fast scanning, and a sense that the user owns the workspace.

The system is intentionally square-edged, compressed, and signal-heavy. Bracket commands, mono metadata, Rajdhani headings, lime status color, and thin horizontal rules give the UI an arcade-terminal edge without turning it into a novelty skin. Every panel, row, chip, and guide block should answer the same question: can the player compare faster and with more confidence?

The design rejects serif editorial publication, soft SaaS marketing pages, airy landing-page heroes, generic card dashboards, decorative glassmorphism showcases, cozy productivity-app softness, corporate BI polish, blogs, brochures, and ordinary TFT guide sites.

**Key Characteristics:**
- Dense desktop information, organized for repeated scanning.
- Flat panel layers with linework and state color instead of decorative shadows.
- Bracketed commands and mono labels for a technical cockpit feel.
- Neon signal accent used sparingly for status, active states, and intent.
- Performance-conscious effects: motion must stay responsive during dragging, resizing, and hover inspection.

## 2. Colors

The palette is a restrained cockpit palette: near-black neutrals, icy text, and one high-voltage signal accent.

### Primary
- **Signal Lime**: The primary action and state color. Use for active filters, drag affordances, status counts, selected states, focused borders, and high-confidence data signals. Its rarity is the point.

### Secondary
- **Success Mint**: Use only for positive semantic states, successful operations, or confirmed healthy statuses.
- **Danger Orange**: Use only for danger, destructive intent, error, or urgent warning states.
- **Legacy Violet** and **Legacy Gold**: Legacy accent colors from the pre-Aptos layer. Use them only when maintaining older surfaces or rank/tier accents that already depend on them.

### Tertiary
- **Rank Cyan** and **Rank Violet**: Specialty rank accents. Keep them inside rank badges and tier markings, not general navigation or panel chrome.

### Neutral
- **Cockpit Void**: The application field and canvas backdrop.
- **Panel Carbon**: Primary panel material and dark panel fill.
- **Panel Steel**: Secondary surface layer for subtle separation.
- **Ice Text**: Primary foreground text on dark surfaces.
- **Ice Soft**: Secondary readable copy.
- **Ice Muted**: Metadata, labels, inactive controls, and quiet panel chrome.
- **Wire Line**: Thin borders, dividers, and panel outlines.

### Named Rules

**The Signal Rarity Rule.** Signal Lime is for live affordance and state, never decoration. If more than roughly 10 percent of a screen glows lime, the interface is shouting.

**The No Pure Void Rule.** Use Cockpit Void rather than pure black. Future dark neutrals should stay slightly tinted so the field feels engineered, not empty.

**The Semantic Reserve Rule.** Mint and orange are semantic colors. Do not use them to add visual excitement to inactive content.

## 3. Typography

**Display Font:** Rajdhani with Arial Black, Impact, Helvetica Neue, Arial fallback.
**Body Font:** Rajdhani with Segoe UI fallbacks.
**Label/Mono Font:** DM Mono with Courier New and Consolas fallback.

**Character:** Rajdhani gives the product its compressed esports-console voice. Mono labels provide mechanical precision for source, phase, count, and panel chrome, while body copy stays compact enough for dense decision surfaces.

### Hierarchy
- **Display** (700, 34px, 0.95): Empty states, large command phrases, and occasional major readouts.
- **Headline** (700, 18px, 0.95): Panel empty-state calls, build names, and compact section headings.
- **Title** (700, 13px, 1): Dense row titles, controls, and emphasis inside panels.
- **Body** (400, 14px, 1.45): Explanatory guide copy and longer notes. Cap prose around 65-75ch when it becomes paragraph text.
- **Label** (700, 10px, 0.08em, uppercase): Panel headers, metadata, drag labels, source names, status chips, and utility controls.

### Named Rules

**The Cockpit Label Rule.** Labels are uppercase, small, and mono. Do not use display-sized type for controls, metadata, or table labels.

**The Dense Read Rule.** Compact type is allowed, but every compact cluster needs a clear hierarchy: label, value, action, in that order.

## 4. Elevation

The current system is flat by default. Depth comes from absolute panel placement, dark tonal layers, thin wire borders, clipped row geometry, and hover/focus color shifts. Shadows are intentionally suppressed on the main dot-matrix UI because the workspace should feel like draggable instruments on a field, not floating cards.

### Shadow Vocabulary
- **None at rest** (`box-shadow: none`): Default for panels, rows, and draggable chrome.
- **Legacy Ink Shadow** (`rgba(0, 0, 0, 0.72)`): Legacy pre-Aptos surfaces only. Do not introduce it into the current draggable panel system.
- **Accent Micro Glow** (`0 0 7px color-mix(in srgb, var(--aptos-accent) 32%, transparent)`): Tiny item or board highlights only. Use sparingly.

### Named Rules

**The Flat Instrument Rule.** Panels are instruments, not cards. Use linework, coordinates, and state color for hierarchy before adding shadows.

**The No Decorative Glass Rule.** Do not add blur or glass effects unless the pixels underneath materially affect the component and performance remains stable.

## 5. Components

### Buttons

- **Shape:** Square-edged command controls (0px radius).
- **Primary:** Transparent bracket buttons with Ice Text, mono uppercase labels, and tight 7px 8px padding.
- **Hover / Focus:** Shift text to Signal Lime and use short glitch feedback only on intentional command elements.
- **Secondary / Ghost:** Most controls are ghost buttons by default. Filled button treatments should be rare and tied to irreversible or high-emphasis actions.

### Chips

- **Style:** Transparent or nearly transparent, mono uppercase, thin dividers, and Signal Lime only for selected state or count emphasis.
- **State:** Selected chips must communicate state with text, bracket marks, or position, not color alone.

### Cards / Containers

- **Corner Style:** Draggable panels and cockpit containers use square corners (0px). Older static cards may use 6px or 8px only when preserving legacy surfaces.
- **Background:** Panel Carbon or a 94 percent mix of the primary surface. The body behind row groups should stay transparent when the dot field is part of the spatial read.
- **Shadow Strategy:** Flat by default. Use no panel shadows in the current cockpit.
- **Border:** Top and bottom wire borders are common. Avoid side stripes and colored side bars.
- **Internal Padding:** Dense panels use 10px body padding; larger legacy surfaces use 16px to 24px.

### Inputs / Fields

- **Style:** Transparent background, top/bottom or bottom-only wire border, mono uppercase placeholder, and 0px radius.
- **Focus:** Border shifts to Signal Lime. Avoid glows unless focus visibility needs extra help.
- **Error / Disabled:** Use Danger Orange for error and Ice Muted for disabled or inactive states.

### Navigation

- **Style:** The top bar is a thin technical strip: bracket menu left, OPNR.GG centered, theme/window controls right. Menu items are compact bracket commands, not large navigation cards.
- **States:** Hover changes text to Signal Lime and may trigger a short glitch effect. Active route/state should use text and structural position in addition to color.
- **Mobile:** Preserve the command-strip feel, but stack panels and controls instead of shrinking typography fluidly.

### Draggable Panels

The draggable panel is the signature component. It uses a 36px or 38px drag bar, mono uppercase title, right-aligned `[ Drag ]` affordance, hidden resize edges, and a transparent-to-carbon panel body. Panels should never move behind the top app bar and should remain draggable after resize.

### Build Record Rows

Build rows are compact, clipped polygons with source metadata, rank, build name, style, champion icons, augment icons, and component demand in one scan line. Hover and selected states use Signal Lime border/color shifts, not heavy fill.

### Board And Item Tokens

Board cells use hex geometry, champion portraits, small item pips, and rank/tier accents. Item and augment tokens should stay icon-first, compact, and hover-inspectable.

## 6. Do's and Don'ts

### Do:

- **Do** preserve the app/product posture: this is an app people work in, not a landing page.
- **Do** keep the cool, edgy, technical cockpit feel from PRODUCT.md.
- **Do** use Cockpit Void, Panel Carbon, Ice Text, Ice Muted, and Signal Lime as the core UI vocabulary.
- **Do** keep dense panels legible with clear label, value, and action ordering.
- **Do** treat performance as design. Dot backgrounds, panel resizing, hover inspection, and drag interactions must remain responsive.
- **Do** use familiar product affordances for search, filters, tabs, buttons, focus, and disabled states.
- **Do** verify text contrast and keyboard focus, especially where mono labels get small.

### Don't:

- **Don't** make opnr.gg feel like a serif editorial publication.
- **Don't** make it feel like a soft SaaS marketing page, airy landing-page hero, or brochure.
- **Don't** turn the app into a generic card dashboard or corporate BI surface.
- **Don't** use decorative glassmorphism showcases. Glass only works here if the underlying pixels actively shape the effect and the cost is proven.
- **Don't** use cozy productivity-app softness, rounded pill overload, or blog-like content layouts.
- **Don't** bury source data inside vague summaries when players need control, comparison, and inspection.
- **Don't** introduce side-stripe borders, gradient text, decorative motion, or heavy inactive-state color.
- **Don't** make every panel glow. Signal Lime should stay meaningful.
