# Show Timer — Design System & Consistency Plan

> Created: 2026-06-10  
> Goal: make every screen feel like it came from the same hand — consistent tokens, spacing rhythm, component patterns, and interaction style.

---

## 1. Design Principles

1. **Theatre-first dark UI.** The app is used in dim wings and tech boxes. Dark backgrounds are not optional; they are the primary experience. Light mode can come later.
2. **Readability at a glance.** A stage manager shouldn't need to squint. Time values must be large, high-contrast, monospaced, and tabular.
3. **One accent colour.** Amber (`#f59e0b`) is the brand colour and the single interactive accent. Purple is reserved strictly for interval/hold states. Green signals completion only. Red = over/danger only. No other hues bleed into the UI.
4. **Low visual noise.** Borders, backgrounds, and decorative elements should recede. The data — times, labels, over-under — should always be the loudest thing on screen.
5. **Consistent density.** All cards, rows, and panels follow the same 8px base grid. No one component should feel cramped while another feels airy.

---

## 2. Colour Tokens

All custom colours are defined in `tailwind.config.js` under `theme.extend.colors.show` and `boxShadow`. Never use raw hex in components — always reference a token.

### Surface hierarchy (dark → light = further from base)
| Token | Hex | Usage |
|---|---|---|
| `show-base` | `#06070d` | App root background |
| `show-surface` | `#0a0d16` | Header, footer bars, input backgrounds |
| `show-card` | `#101524` | Cards, panels, dropdowns |
| `show-card-alt` | `#141d2e` | Elevated card states (active segment panel) |
| `show-hover` | `#1a2540` | Hover state fills |
| `show-border` | `#1c2b42` | Default borders, dividers |
| `show-border-light` | `#243650` | Focus / hover borders |

### Semantic accent colours
| Role | Colour | Tailwind classes |
|---|---|---|
| **Brand / interactive** | Amber | `amber-400` text, `amber-500` fill, `amber-500/10–15` tint, `amber-500/30–40` border |
| **Active / running** | Amber (same) | Active segment cards glow amber |
| **Complete** | Green | `green-400` text, `green-500/10` tint |
| **Interval / hold** | Purple | `purple-400` text, `purple-500/10` tint |
| **Over schedule** | Red | `red-400` text, `red-500/10` tint (only when >5 min over) |
| **Danger / delete** | Red | `red-400` hover on destructive actions |
| **Muted / disabled** | Slate | `slate-500` → `slate-700` range for secondary text |

### Current inconsistencies to fix
- `SegmentCard` uses a hardcoded `bg-[#141a0a]` for active state — should become `bg-show-card-alt`.
- `ActiveSegmentPanel` uses `bg-[#0e0a18]` for interval active — should be a token.
- The `accentBar` colour on `SegmentCard` still falls back to `bg-show-border` for pending; this is correct but could be made an explicit `bg-transparent` so the intent is clear.

---

## 3. Typography Scale

| Role | Size | Weight | Font | Colour |
|---|---|---|---|---|
| Clock digits | `text-[5.5rem]` | `font-light` | Mono | `slate-100` / `amber-300` (seconds) |
| Active segment elapsed | `text-3xl` | `font-light` | Mono | Accent colour |
| Section heading | `text-xs` | `font-semibold` | Sans | `slate-500` uppercase + `tracking-widest` |
| Card primary label | `text-sm` | `font-semibold` | Sans | `slate-200` |
| Card secondary / meta | `text-xs` | `font-normal` | Sans | `slate-500`–`slate-600` |
| Time values (inline) | `text-sm` | `font-medium` | Mono | `slate-300` |
| Over/under badge | `text-xs` | `font-semibold` | Sans | Contextual accent |
| Input / textarea | `text-xs`–`text-sm` | `font-normal` | Sans | `slate-300` |

**Rule:** Never use `font-bold` on time values — use `font-semibold` max. Heavy weight on tabular numbers looks cramped.

---

## 4. Spacing Rhythm

Base unit = 4px (`Tailwind 1` = 4px).

| Context | Padding | Gap |
|---|---|---|
| Page container sides | `px-6` (24px) | — |
| Card internal | `px-4 py-3` (16/12px) | `gap-2.5` |
| Header bar | `px-5 h-14` | `gap-1`/`gap-2.5` |
| Button internal | `px-3 py-1.5` small, `px-4 py-2` medium | — |
| Stack of cards | `space-y-2` | — |
| Section dividers | `mb-8` between settings sections | — |

**Inconsistency to fix:** `TimerView` uses `pb-3` on the show-info bar and `pb-4` on the segment list; these should be normalised.

---

## 5. Component Patterns

### 5.1 Cards
All cards:
- `rounded-xl` (12px)
- `border` using a `show-border` token
- `bg-show-card` default
- Left accent bar: 4px wide, full-height, colour = state (amber = active, green = complete, transparent = pending)
- `shadow-card` (`0 4px 24px rgba(0,0,0,0.4)`)
- Transition: `transition-colors duration-300` on border/background

Active state additionally:
- `border-amber-500/40`
- `bg-show-card-alt` (replace current hardcoded hex)
- `shadow-amber-glow` or `glow-amber`

### 5.2 Buttons — three tiers

| Tier | Appearance | Usage |
|---|---|---|
| **Primary** | Solid amber fill, dark text, `shadow-amber-glow-sm` | Main CTA (Start, End & go to, Export PDF) |
| **Secondary** | `border border-show-border`, transparent fill, `slate-400` text → hover `slate-200` | Supporting actions (Hold, Edit, Copy) |
| **Ghost / icon** | No border, no fill, `slate-600` → hover `slate-300` | Icon buttons in header/card action rows |

**Current issue:** some "End" and "Stop" buttons use `bg-slate-700` which reads as a tertiary filled button — it should be a secondary outlined button to maintain consistent hierarchy (primary = amber, not grey).

### 5.3 Badges / Pills
Inline status badges:
- `text-xs font-semibold`
- `px-2 py-0.5 rounded-full`
- Colour matched to semantic role (amber/green/red/purple)
- `bg-{color}-500/10 border border-{color}-500/20 text-{color}-400`

Type badges (e.g. "LIVE", "Interval", "Hold"):
- `text-[10px] font-bold uppercase tracking-widest`
- `px-1.5 py-0.5 rounded`
- `bg-{color}-500/20 text-{color}-400`

### 5.4 Inputs
- `bg-show-surface border border-show-border rounded-lg px-3 py-2`
- `text-xs text-slate-300 placeholder-slate-700`
- Focus: `focus:outline-none focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/10`
- Inline underline variants (e.g. show notes bar) keep `border-b border-show-border` but same focus treatment

**Inconsistency:** `TimeEditModal` and `ShowSetupModal` need auditing — modals tend to accumulate one-off styles.

### 5.5 Modals
- Backdrop: `bg-black/60` with `backdrop-blur-sm`
- Panel: `bg-show-card border border-show-border rounded-2xl` with `shadow-[0_20px_60px_rgba(0,0,0,0.7)]`
- Max width: `max-w-md` for standard modals
- Padding: `p-6` internal
- Header: icon + title (`text-base font-semibold text-slate-100`) + optional subtitle (`text-xs text-slate-500`)
- Footer: right-aligned button row with `gap-2`

### 5.6 Empty states
- Centered vertically and horizontally in the available space
- Icon in a `w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20` container
- `text-xl font-semibold text-slate-200` heading
- `text-sm text-slate-500 leading-relaxed` description
- Optional CTA button (primary)

All three views (Timer, History, Settings) have empty states — they should use identical structure.

---

## 6. Screen-by-Screen Issues

### Timer View
- [ ] Clock section: add a subtle `border-b border-show-border` separator below the clock + show-info bar, so the scrolling content area has a clear start.
- [ ] Show info bar: production name is `text-xs font-medium text-slate-500 uppercase tracking-wider` — slightly too muted. Consider `text-slate-400` and remove uppercase.
- [ ] Total bar (bottom): currently `bg-show-surface` — this matches the header. Good. Keep.
- [ ] Show notes input in total bar: `border-b` underline only. Change focus ring to match other inputs.
- [ ] "Add Segment" dashed button: feels disconnected. Move it inside a card-like container that fills the same width as segment cards.

### Segment Cards
- [ ] Active background `bg-[#141a0a]` → `bg-show-card-alt`.
- [ ] The `End` button uses `bg-slate-700` — should be outlined secondary to maintain button hierarchy.
- [ ] Expected duration input (`ExpectedMinInput`) has its own bespoke border style. Align with standard input tokens.
- [ ] Over/under badge and back-at pill sit next to the expected-input row. On narrow windows these wrap unpredictably — add `min-w-0` guards.
- [ ] Notes textarea expand animation is nice — keep it.

### Active Segment Panel
- [ ] Interval active background `bg-[#0e0a18]` → new token `show-panel-alt` or just use `show-card`.
- [ ] "LIVE" / "Interval" type badge inconsistency: both show only the type but not the segment name in the badge — this is fine. Label is shown in the `h3` below.
- [ ] "Up next" hint text at `text-[11px]` — consider bumping to `text-xs` for legibility.

### Report Panel
- [ ] Header is identical in structure to the main header's show-info area — good consistency.
- [ ] Segment rows use `text-[11px]` — bump to `text-xs` across the board for consistency.
- [ ] `text-[10px]` for section labels and totals — this is the minimum readable size; acceptable but note it.

### History View
- [ ] "CURRENT" pill badge uses `text-[10px]` — should match other badge sizing (`text-xs`).
- [ ] No search or filter; fine for now.

### Settings View
- [ ] Section icons use mixed colours (`amber-400`, `green-400`, `purple-400`) for Clock/Bell. Standardise: all section header icons should be `text-amber-400` for brand consistency; semantic colours are for interactive elements only.
- [ ] `Toggle` component works well; consider extracting it as a shared component file.

---

## 7. Motion & Animation

Current state: Framer Motion is used throughout; patterns are good. Standardise the values:

| Animation | Duration | Easing |
|---|---|---|
| View switch (opacity fade) | `0.15s` | default |
| Card appear (y slide) | `0.2s` | default |
| Panel slide-in (spring) | `damping: 28, stiffness: 280` | spring |
| Dropdown appear | `0.12s, y: -4 → 0` | default |
| Active segment panel | `0.2s, y: -8 → 0` | default |

All of these are already used. No change needed — just codify them here so new components match.

---

## 8. Proposed Token Additions

Add to `tailwind.config.js`:

```js
// In colors.show:
'panel-alt': '#0e0a18',  // Interval/hold panel bg (currently hardcoded)
'active':    '#141d2e',  // Active segment card bg (alias for card-alt, explicit name)

// In boxShadow:
'purple-glow-sm': '0 0 12px rgba(168,85,247,0.25)',  // For interval active state
```

Remove the two hardcoded hex values from `SegmentCard.tsx` and `ActiveSegmentPanel.tsx` once these tokens are in.

---

## 9. Consistency Checklist (Priority Order)

1. **[HIGH] Replace hardcoded hex values** with tokens in `SegmentCard` and `ActiveSegmentPanel`.
2. **[HIGH] Button hierarchy** — `End`/`Stop` buttons from filled-grey → outlined secondary style.
3. **[MED] Font size floor** — audit all `text-[10px]` and `text-[11px]` usages; replace with `text-xs` where context allows.
4. **[MED] Settings icon colours** — standardise section header icons to all amber.
5. **[MED] "Add Segment" button** — wrap in a container matching card width/style.
6. **[LOW] Toggle component** — move to `src/components/ui/Toggle.tsx`.
7. **[LOW] Empty state structure** — verify all three views use the same template.
8. **[LOW] Modal design** — audit `ShowSetupModal` and `TimeEditModal` against modal pattern in §5.5.

---

*Update this document as design decisions are made and items are completed.*

---

## 10. Identity & Uniqueness — Direction Ideas

The current UI is clean and functional but feels generic — it could be any dark SaaS dashboard. These ideas root the visual language in the world of live theatre: stage lighting, cue systems, the physical tension of a live performance. All ideas keep the dark professional base but add character.

---

### Idea A — Spotlight Active State

**Concept:** When a segment goes active, a radial "spotlight" bloom grows behind its card — like a performer stepping into a follow spot. The rest of the list subtly dims. The bloom colour shifts between amber (act) and purple (interval). The clock's seconds digit pulses with a faint warm halo.

**What makes it unique:** Every live-production app has green/red state indicators. Nobody has the feeling of a stage light turning on. It's instantly evocative without being literal.

**Implementation:** CSS radial-gradient on the card background, animated via Framer Motion `animate` on opacity and scale. Backdrop brightness filter on sibling cards.

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    19 : 32 : 47                                  │
│                  ·           · ← subtle amber halo on :47        │
│                                                                  │
│  ╔═══════════════════════════════════════════════════════════╗   │
│  ║  ░░░░░░░░░░░░░░░ radial glow ░░░░░░░░░░░░░░░░░░░░░░░░░   ║   │
│  ║  ● ACT 2                            00:32:47  ▶  +2:45   ║   │  ← active card glows
│  ║  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ║   │
│  ╚═══════════════════════════════════════════════════════════╝   │
│                                                                  │
│  ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄   │
│    ○  Interval           --:--      [START]                      │  ← sibling cards dimmed ~40%
│  ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄   │
│    ○  Act 3              --:--      [START]                      │
└──────────────────────────────────────────────────────────────────┘
```

**Transitions:**
- Inactive → active: bloom fades in over `0.4s` ease-out; siblings dim over `0.3s`
- Active → complete: bloom fades out, card accent bar animates from amber → green over `0.5s`

---

### Idea B — Split-Flap Clock

**Concept:** The main `HH:MM:SS` clock uses a split-flap (Solari board / airport departure board) animation on each digit change. Each digit lives in a "tile" — on change, the top half flips down to reveal the new number. The tiles have a very slight bevel and a hairline gap in the middle. The font stays mono, but the tile treatment makes the clock feel like a physical object in the room.

**What makes it unique:** Flip clocks are nostalgic and tactile. In a theatre context they also reference the physical countdown clocks used in broadcast and live TV. It's a strong, recognisable signature that no competitor has.

**Implementation:** Each digit is a `<span>` with a flip animation triggered on value change (compare prev/next digit). CSS `perspective` + `rotateX` transform on the top half, `0.18s` ease-in flip. No library needed.

```
  ┌────┐  ┌────┐     ┌────┐  ┌────┐     ┌────┐  ┌────┐
  │    │  │    │     │    │  │    │     │    │  │    │
  │ 1  │  │ 9  │  :  │ 3  │  │ 2  │  :  │ 4  │  │ 7  │
  ├────┤  ├────┤     ├────┤  ├────┤     ├────┤  ├────┤   ← hairline gap
  │    │  │    │     │    │  │    │     │    │  │    │
  └────┘  └────┘     └────┘  └────┘     └────┘  └────┘
     H       H          M       M          S       S

  On digit change (S: 47 → 48):
  top half folds down  ↓↓
  ┌────┐                      new top half reveals "4"
  │ 4  │   ← flips in        ┌────┐
  ├────┤                      │ 4  │
  │ 8  │   ← stays            ├────┤
  └────┘                      │ 8  │
                               └────┘
```

**Token addition:** `--digit-tile-bg: #111827`, `--digit-tile-border: #1f2d45`, subtle `inset-shadow` for depth.

---

### Idea C — Cue Light Segments

**Concept:** Each segment card grows a small "cue light" indicator — a physical LED-style dot on the far left edge, replacing the current thin accent bar. Pending = dark (off). Active = bright amber pulse. Complete = solid green. On hold = amber slow-blink. The dot has a crisp glow ring around it when lit.

The segment cards themselves become simpler and more horizontal — more like a production runsheet than a dashboard card. Dense but readable. This makes the full show rundown feel like a proper cue sheet.

**What makes it unique:** Cue lights are the visual language of theatrical backstage. Stage managers live by them. Seeing that metaphor in the app immediately signals "this was made for us."

```
  ╔══════════════════════════════════════════════════════════════╗
  ║  ●  Doors             19:00          ✓  30m            (done)║  ← green dot, solid
  ╠══════════════════════════════════════════════════════════════╣
  ║  ●  Act 1             19:30          ✓  55m            (done)║  ← green dot, solid
  ╠══════════════════════════════════════════════════════════════╣
  ║  ◉  Interval          20:28 →  00:14:22    Back 20:48       ║  ← purple pulsing dot
  ╠══════════════════════════════════════════════════════════════╣
  ║  ○  Act 2             --:--          Est 20:48   [START]     ║  ← dark dot, off
  ╠══════════════════════════════════════════════════════════════╣
  ║  ○  Show End          --:--                     [MARK]       ║  ← dark dot, off
  ╚══════════════════════════════════════════════════════════════╝

  Dot states:
  ○  pending   — #1c2b42 fill, no glow
  ●  complete  — #22c55e fill, faint green glow
  ◉  active    — #f59e0b fill, amber pulse-glow animation (keyframe: 1.5s ease-in-out)
  ◎  on hold   — #a855f7 fill, slow 3s blink
```

**Card redesign:** Remove the rounded corners and left bar entirely. Use a full-width table-like layout with `border-b border-show-border` row separators instead. Feels like a real cue sheet. Optional: subtle monospace font for segment labels to reinforce the technical feel.

---

### Idea D — Arc Progress on Active Segment Panel

**Concept:** The hero "Active Segment" panel shows a large circular arc (SVG, `stroke-dashoffset` animated) that represents elapsed-vs-expected time. The arc fills clockwise in amber as time passes. When it hits 100% it turns red and keeps animating as an "over" indicator. For intervals, it counts down in purple. The elapsed time number sits inside the arc.

This replaces the current plain text elapsed display with something visually engaging that communicates urgency at a glance.

**What makes it unique:** A backstage operator can read the arc from a distance without reading numbers. It's the only piece of the UI that's truly at-a-glance.

```
  ╔═══════════════════════════════════════════════════╗
  ║                                                   ║
  ║   LIVE · Act 2                                    ║
  ║                                                   ║
  ║         ╭ ─ ─ ─ ─ ─ ╮                            ║
  ║       ╱               ╲   ← amber arc, 68% filled ║
  ║      │   00:37:45      │                          ║
  ║      │   +2:45 over    │   ← inside the arc       ║
  ║       ╲               ╱                           ║
  ║         ╰ ─ ─ ─ ─ ─ ╯                            ║
  ║                                                   ║
  ║  [Hold]          End & go to Interval  →          ║
  ║                                                   ║
  ╚═══════════════════════════════════════════════════╝

  Arc colour:
  0–95% expected:   amber   (#f59e0b)
  95–100%:          amber → fades to red (crossfade)
  >100% (over):     red, arc restarts as a secondary ring
  Interval:         purple  (#a855f7), counts DOWN
```

**Implementation:** SVG `<circle>` with `stroke-dasharray` set to circumference, `stroke-dashoffset` driven by a Framer Motion `animate` value tied to `elapsedMs / expectedMs`. Smooth continuous animation via `useMotionValue` + `useEffect`.

---

### Recommended combination

These ideas work independently but the strongest version of the app picks **two** and does them well:

| Must-have | Nice-to-have |
|---|---|
| **Idea B — Split-flap clock** — signature moment, seen every time the app is open | **Idea A — Spotlight** — adds atmosphere without complexity |
| **Idea C — Cue light rows** — anchors the whole UI in theatre language | **Idea D — Arc progress** — elevates the active panel to something special |

Start with C (cue lights + row layout) as it touches every segment card and sets the new baseline. Then add B (clock animation) as a self-contained component change. A and D can layer in after.

---

### Motion language for the new direction

New keyframes to add to `tailwind.config.js`:

```js
// Cue light pulse (active segment)
cuePulse: {
  '0%, 100%': { opacity: '1', boxShadow: '0 0 8px 2px rgba(245,158,11,0.6)' },
  '50%':      { opacity: '0.85', boxShadow: '0 0 16px 4px rgba(245,158,11,0.3)' },
},
// Cue light hold blink (on hold)
cueHold: {
  '0%, 100%': { opacity: '1' },
  '50%':      { opacity: '0.25' },
},
// Split-flap digit flip
digitFlip: {
  '0%':   { transform: 'rotateX(0deg)' },
  '100%': { transform: 'rotateX(-90deg)' },
},
```

```
animation: {
  'cue-pulse': 'cuePulse 1.5s ease-in-out infinite',
  'cue-hold':  'cueHold 3s ease-in-out infinite',
  'digit-flip': 'digitFlip 0.18s ease-in forwards',
}
```
