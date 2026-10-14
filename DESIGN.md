---
name: Command
description: Quiet, precise team app. Monochrome Geist UI with one team accent.
colors:
  background: "#ffffff"
  surface: "#fafafa"
  border: "#ebebeb"
  border-strong: "#d4d4d4"
  hover: "#f4f4f5"
  foreground: "#171717"
  muted: "#666666"
  accent: "#0070f3"
  accent-subtle: "#eef5ff"
  success: "#0a7a3d"
  warning: "#8a5a00"
  error: "#c62828"
  info: "#1a56c4"
  background-dark: "#000000"
  surface-dark: "#0a0a0a"
  border-dark: "#262626"
  foreground-dark: "#ededed"
  muted-dark: "#a1a1a1"
typography:
  title:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "13px"
rounded:
  control: "6px"
  card: "8px"
  pill: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "36px"
  card:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.card}"
    padding: "20px"
  input:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.control}"
    height: "36px"
---

# Design System: Command

## 1. Overview

**Creative North Star: "The Shop Clipboard"**

A clipboard on the shop wall: plain, legible at a glance, fast to mark. The interface stays out of the way so the team's own name, logo and accent carry identity. Black and white do the structural work; hairline borders and whitespace between groups do the separating.

This system rejects what PRODUCT.md rejects: cluttered admin panels with a dozen tabs, colourful decorative SaaS dashboards, oversized touch-first controls that waste space on desktop, and yellow or saturated accent fills on every button.

**Key Characteristics:**
- Neutral by default; the team accent is rare and meaningful.
- Dense but calm: tight type scale, 1px borders, space between groups rather than inside them.
- One set of components that works one-handed on a phone and efficiently on a desktop.
- Motion conveys state only.

## 2. Colors

Restrained: tinted-free neutrals plus one team accent, set per deployment from settings and derived into hover, subtle and foreground tokens.

### Primary
- **Team Accent** (#0070f3 default, overridden per team): links, focus rings, the brand mark, selection and live indicators such as the clock-in dot. Never a button fill.

### Neutral
- **Paper** (#ffffff light, #000000 dark): page background.
- **Panel** (#fafafa light, #0a0a0a dark): sidebar and secondary surfaces.
- **Hairline** (#ebebeb light, #262626 dark): every border. Stronger variant (#d4d4d4, #404040) on hover.
- **Ink** (#171717 light, #ededed dark): text and the primary button fill.
- **Quiet Ink** (#666666 light, #a1a1a1 dark): secondary text and inactive nav.

### Semantic
- **Success, Warning, Error, Info** each have a text colour and a subtle background tint, defined for light and dark. Always paired with a text label.

### Named Rules
**The Accent Rarity Rule.** Accent never fills a button or covers an inactive state. Its rarity is how users find live things.
**The Label Rule.** Colour is never the only carrier of meaning. Every status has words.

## 3. Typography

**Body and Display Font:** Geist Sans (fallback ui-sans-serif, system-ui)
**Data Font:** Geist Mono, for times, counts and prices

**Character:** One family does all the work. Hierarchy comes from size and weight, not from font pairing.

### Hierarchy
- **Title** (600, 24px, tracking -0.025em): page titles.
- **Card title** (600, 15px): card headers.
- **Body** (400, 14px desktop, 15px phones, 1.5): default text. Prose caps at 65 to 75ch.
- **Label** (500, 13px): nav, buttons, field labels.
- **Caption** (400, 12px to 13px, Quiet Ink): hints, metadata.
- **Data** (Geist Mono, 13px): clock times, hour totals, prices.

### Named Rules
**The Mono-For-Numbers Rule.** Anything a user compares or adds up is monospace.

## 4. Elevation

Flat by default. Depth comes from a hairline border and a 1px ambient shadow (`0 1px 2px rgb(0 0 0 / 0.04)`) on cards and fields. Dialogs use a larger shadow and a 50% black scrim. Sticky bars use solid backgrounds.

### Named Rules
**The Solid Bar Rule.** Sticky headers and tab bars are opaque. Translucent blur lets content bleed under the status bar and reads as a smudge.

## 5. Components

### Buttons
- **Shape:** 6px radius. Heights 32 to 36px on desktop, 40 to 44px on phones.
- **Primary:** Ink fill with Paper text. One per screen.
- **Secondary:** Paper fill, hairline border, hover darkens border and tints background.
- **Ghost, Danger, Link:** ghost for low-priority, danger for destructive, link for inline accent.
- **States:** 150ms colour transition, 0.98 press scale, 50% opacity disabled, 2px accent focus ring with 2px offset.

### Cards
- **Corner:** 8px. Hairline border, ambient shadow, 16 to 20px padding.
- **Rule:** never nested; most content needs no card at all.

### Inputs
- **Style:** 6px radius, hairline border, 16px text on phones to prevent iOS zoom.
- **Focus:** accent border plus a 3px accent ring at 20% opacity.

### Badges
- Pill, 12px text, subtle tint plus text label. Tones: neutral, success, warning, error, info, accent.

### Navigation
- **Desktop:** 240px sidebar, collapsible to a 64px rail, draggable. Active item has a hover tint and heavier weight.
- **Phone:** sticky solid header with team name, bottom tab bar of up to five slots, overflow behind More. Safe-area insets applied top and bottom.

### Empty States
- Dashed border, icon, one line on what the place is for, one action.

## 6. Do's and Don'ts

### Do:
- **Do** keep one obvious primary action per screen.
- **Do** keep touch targets at 44px minimum on phones.
- **Do** use skeletons for loading and teach the interface in empty states.
- **Do** respect reduced motion and keep transitions at 150 to 250ms.
- **Do** use bottom sheets or inline expansion before a centred modal.

### Don't:
- **Don't** build cluttered admin panels with a dozen tabs.
- **Don't** use colourful, decorative SaaS dashboard styling.
- **Don't** use oversized touch-first controls on desktop.
- **Don't** fill buttons with the accent or any saturated colour.
- **Don't** use translucent or blurred sticky bars.
- **Don't** use side-stripe borders, gradient text, nested cards or em dashes in copy.
