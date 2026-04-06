# trenuj.se — Design Values

> The core beliefs that shape every decision. Not a component list, not a process doc — the _why_ behind the app.

---

## The App in One Sentence

A dark, moody, read-heavy workout execution interface that feels like a native app built by someone who actually cares about the web platform.

---

## Visual Identity

### Dark and Layered

The UI is built on depth, not flatness. A near-black OKLCH base (`0.1766 0.0103 294.4`) with translucent white layers stacked on top — cards at 5% opacity, insets at 3%, hovers at 8%. Surfaces emerge from darkness rather than being drawn on a white canvas.

### Border Shine

The signature visual element. A multi-layered inset `box-shadow` that gives cards a subtle glass-like edge glow. Not a border — a _shine_. Three layers: a thin 1px inset ring, a top-edge highlight, and a soft drop shadow underneath. This is what makes the UI feel physical.

### Noise Texture

An SVG `feTurbulence` fractal noise overlaid on the entire page at `mix-blend-mode: soft-light`. Adds analog warmth to a digital interface. Subtle enough to not interfere with readability, present enough to prevent the flatness that plagues dark UIs.

### NRC-Inspired Typography

Bold, progressive-weight type that gets heavier as it gets bigger — regular at body size, extrabold at page titles. Plus Jakarta Sans for its geometric personality (Inter was tried and rejected — too neutral). The type scale follows a minor third ratio. Headings feel _confident_, body text stays _readable_.

### OKLCH Color Space — Everywhere

Every color in the system is OKLCH. Not hex, not HSL. OKLCH gives perceptually uniform lightness, which means derived colors (hover states, dimmed states, tints) look correct without manual tweaking. The accent color is stored as raw OKLCH components (`0.916 0.196 119.75`) so any opacity or relative-color derivation works from a single source of truth.

### Per-Workout Hue System

Each label gets a hue (0–360). From that single number, CSS derives everything: a subtle row tint, a saturated accent bar, a completed-state color, a today highlight. All via `oklch()` functions in CSS — no JS color math. When a label has no assigned hue, a deterministic hash of its key generates one. Same key → same color, always.

---

## Interaction Philosophy

### Read-Heavy, Write-Light

The app is primarily a _viewer_. You look at your weekly plan, expand a session to read the details, toggle a workout as complete. That's 95% of interaction. There are no complex forms, no drag-and-drop builders, no inline editing. The AI creates the plan via MCP; the UI presents it beautifully.

### Honest Interactions

If something isn't clickable, it doesn't pretend to be. No hover effects on non-interactive cards. No cursor changes on static text. Visual feedback maps 1:1 to real affordances. A `WorkoutCard` has no hover state because you don't click the card itself — you click the checkbox inside it, or the expand chevron.

### Connected Motion

Animations are _connected_, not _parallel_. The week navigation has a single green dot that slides between positions — not individual dots that fade in/out per pill. This creates continuity: the user's eye follows the dot, understanding the spatial relationship between weeks. Both open _and_ close transitions must be equally smooth — if the open animation is nice but closing snaps, that's a bug.

### Minimal and Quick

No page transitions. No elaborate reveals. No spring physics. One single easing curve for the entire app. Three duration tiers (fast/medium/slow), all quick enough that the UI never feels like it's making you wait. Micro-interactions (button scale on hover/active) add life without drama.

### Native App Feel

`user-select: none` on all app chrome — text in buttons, headers, and navigation isn't selectable, just like a native app. User-generated content (markdown, inputs) opts back into selection. The app should feel like something installed, not something loaded in a browser tab.

---

## Accessibility as a Core Value

### Keyboard Navigation is Not an Afterthought

Every interactive element is reachable and operable via keyboard. Focus rings are visible, styled, and intentional — not the browser default blue outline that designers typically suppress. The focus ring uses `outline` + `outline-offset` (never `box-shadow`, which gets stripped in Windows High Contrast / forced-colors mode).

### Focus Rings Only When Needed

The `what-input` library tracks whether the user is using a mouse or keyboard. A custom PostCSS plugin rewrites `:focus-visible` selectors so focus rings only appear for keyboard users. Mouse clicks never show focus rings. Certain keys (Escape, Enter, Shift, arrows, Cmd) are excluded from triggering keyboard-intent detection, because pressing Escape to close a dialog shouldn't suddenly show focus rings everywhere.

### Semantic HTML

Interactive elements use real `<button>` and `<input>` elements, not styled `<div>`s. Base UI provides the behavior; CSS Modules provide the look. The DOM reads correctly to screen readers without ARIA workarounds. Non-interactive visual elements (like the completed-state checkbox icon) use `aria-hidden` so they don't confuse assistive tech.

### Inputs Get Special Treatment

Form inputs have dual-layer focus: a subtle border brightening on _any_ focus (including mouse click, so you know which field is active), plus the full accent-colored focus ring on _keyboard_ focus. This acknowledges that mouse users still need visual feedback for active fields — just not the full ring.

---

## CSS as the Platform

### CSS-First, JS-Minimal

If CSS can do it, CSS does it. Color derivation happens in `oklch()` functions, not in JavaScript. Hover/active states use relative color syntax (`oklch(from var(--accent) calc(l * 1.035) ...)`), not programmatic color manipulation. Height animations use `interpolate-size: allow-keywords` to transition to `height: auto` — no JS measurement. CSS nesting reduces repetition. The goal: components with almost no runtime style logic.

### Modern CSS, No Apologies

The app uses bleeding-edge CSS features: OKLCH, relative color syntax, `interpolate-size`, native nesting, `@layer`, `@property`, CSS mask gradients (for scroll fadeouts). These aren't experiments — they're deliberate choices that produce better results than their JavaScript or preprocessor alternatives. Browser support is good enough; this is a controlled app, not a public marketing site.

### Tokens Without Over-Abstraction

Design tokens exist for colors, typography, radii, and motion. But there are no spacing tokens — raw `px` values are used directly. This is intentional: spacing is too contextual to tokenize well, and a `--space-4` abstraction adds a layer of indirection without adding clarity. When you see `padding: 12px 16px`, you know exactly what it is.

### CSS Modules + Layers

Every component has its own `.module.css` file. PostCSS auto-assigns modules to `@layer components`, global styles to `@layer base`, and utilities to `@layer utilities`. This means cascade order is explicit and predictable — no specificity wars, no `!important`. Typography is shared via `composes: typography-sm from global`, not duplicated per component.

---

## The Aesthetic DNA, Summarized

| Element      | Choice                                          | Why                                             |
| ------------ | ----------------------------------------------- | ----------------------------------------------- |
| Background   | Near-black OKLCH with purple undertone          | Depth without pure-black harshness              |
| Surfaces     | Translucent white overlays (3–8%)               | Layered depth, not flat panels                  |
| Cards        | Border-shine box-shadow glow                    | Physical, glass-like presence                   |
| Texture      | SVG fractal noise, soft-light blend             | Analog warmth, anti-flatness                    |
| Accent       | Vivid yellow-green (OKLCH `0.916 0.196 119.75`) | Energy, visibility on dark backgrounds          |
| Type         | Plus Jakarta Sans, progressive weight           | Confident headings, readable body               |
| Code         | JetBrains Mono — only for `<code>`              | Clear separation of prose vs data               |
| Colors       | OKLCH everywhere, per-workout hue               | Perceptually uniform, CSS-native derivation     |
| Motion       | Single curve, three speeds, no spring physics   | Quick, consistent, never in the way             |
| Interactions | Honest — feedback matches real affordances      | Trust between the UI and its user               |
| Focus        | Keyboard-only rings, outline-based              | Accessible without visual noise for mouse users |
| Selection    | Disabled on chrome, enabled on content          | Native app feel                                 |
| Responsive   | Mobile-first, single breakpoint                 | The app lives on your phone                     |
