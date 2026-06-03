# Show Timer — App Overview & Plan

> A professional show timing application for theatre stage managers and crew.
> Last updated: 2026-06-03

---

## 1. Purpose

Replace paper-based or generic stopwatch show reporting with a dedicated desktop app that captures every key time event during a live theatre performance, calculates durations automatically, and produces a clean report ready to send.

---

## 2. Platform Strategy

| Platform | Target | Notes |
|---|---|---|
| Windows 10/11 | Primary | x64 |
| macOS Apple Silicon | Primary | ARM64 (M1/M2/M3/M4) |
| macOS Intel | Bonus | x64, same build with universal binary |

**Tech stack recommendation: Tauri 2 + React + TypeScript + Tailwind CSS**

- Tauri produces native ARM64 `.dmg` for Apple Silicon and an `.exe` installer for Windows from the same codebase — no need for two separate codebases.
- Rust backend handles timing logic, file I/O, and persistence with zero-overhead precision.
- React + Tailwind frontend gives full control over a beautiful, custom UI.
- Final app bundle is ~5–15 MB vs Electron's ~150 MB.
- If Tauri is a blocker (Rust unfamiliar), fallback is **Electron + React + TypeScript + Tailwind**.

---

## 3. Core Concepts

### Show
A single performance event (e.g. "Phantom — Saturday Matinee 2026-06-03"). A show contains one or more **Acts** separated by zero or more **Intervals**.

### Show Session
One complete run of timing for a show. Multiple sessions can be stored for history and comparison.

### Segment Types
| Segment | Description |
|---|---|
| **Doors** | Venue doors open to audience |
| **House Open** | House/auditorium open (may differ from Doors) |
| **Act** | A performance act (Act 1, Act 2, etc.) |
| **Interval** | Break between acts |
| **Curtain Call** | Post-show applause / bows |
| **Show End** | Audience dismissed / show concluded |

Each segment has: `expected_duration`, `actual_start`, `actual_end`, `notes`.

### Expected vs Actual
Every segment can have a pre-set expected duration. The app shows a live running over/under indicator so the stage manager knows at a glance if the show is ahead or behind schedule.

---

## 4. Feature List

### 4.1 Timer Core
- [x] **One-tap start/stop** — grabs the exact current system time on tap
- [x] **Manual time entry** — type in a time for any event (for when you forgot to start the timer)
- [x] **Retroactive start** — set a timer that began in the past; the elapsed time will be calculated from that past time going forward
- [x] **Live running clock** — always-visible current time displayed prominently
- [x] **Per-segment elapsed timer** — shows how long the current segment has been running
- [x] **Total show elapsed timer** — running total from show start to now
- [x] **Pause/resume** — handle unexpected holds/delays mid-act
- [x] **Hold events** — stamp a "Hold" and a "Resume" within any act for stopped-clock reporting

### 4.2 Show Structure
- [x] **Flexible act count** — add as many acts as needed (2-act, 3-act, one-act, etc.)
- [x] **Flexible interval count** — intervals are auto-inserted between acts; can add or remove
- [x] **Multiple shows in one session** — e.g. a double-bill or two performances in one day
- [x] **Show templates** — save a show structure (act/interval layout + expected times) and reuse it for future performances of the same production
- [x] **Reorder segments** — drag to reorder if the running order changes

### 4.3 Time Entry Options
- [x] **12-hour / 24-hour toggle** — global setting, respected everywhere
- [x] **Time picker UI** — scrollable wheel or keyboard input for manual times
- [x] **"Now" shortcut** — one click to fill any manual field with current time
- [x] **Past-time start** — enter a time in the past, timer continues forward from there automatically

### 4.4 Expected Times / Planning
- [x] **Expected duration per segment** — set how long each act/interval/doors period is planned to be
- [x] **Scheduled show times** — set a planned start time for the whole show
- [x] **Over/Under indicator** — colour-coded: green (on time ±2 min), amber (±5 min), red (>5 min over)
- [x] **Countdown mode** — optionally show a countdown to the expected end of the current segment
- [x] **Running total over/under** — how the whole show is tracking vs. the planned schedule

### 4.5 Reporting
- [x] **Live report view** — always up to date, visible alongside timers
- [x] **Final show report** — formatted summary of all times and durations
- [x] **Copy to clipboard** — paste directly into email or a show report document
- [x] **Export to PDF** — print-ready show report
- [x] **Export to CSV/TXT** — for spreadsheet imports or archiving
- [x] **Show history** — browse and re-open past show sessions
- [x] **Comparison view** — compare this performance's times against a previous one or the expected template

### 4.6 UX / UI
- [x] **Dark mode by default** — theatre environments are often dark; dark UI is essential; light mode also available
- [x] **Large, readable text** — timers should be visible from across a dimly lit wing
- [x] **Keyboard shortcuts** — stage managers need to operate without looking at screen
- [x] **Always-on-top option** — keep app above other windows while operating other software
- [x] **Auto-save** — every event is persisted immediately; no data lost if app crashes
- [x] **Undo last action** — in case a button was mis-tapped
- [x] **Notes field** — free-text notes per segment and per show (e.g. "LX delay", "late start due to latecomers")
- [x] **Show title & date** — label each show session clearly

---

## 5. Suggested Additional Features (Phase 2)

These are not core MVP but would make the app outstanding:

| Feature | Value |
|---|---|
| **Interval countdown alert** | Visual (and optional sound) alert when interval is X minutes from ending |
| **Pre-show call alerts** | Set "Half Hour", "15 min", "5 min", "Beginners" calls relative to show start |
| **Cast/crew call sheet** — link planned call times to the show start | Plan calls alongside timing |
| **Custom segment types** — e.g. "Meet & Greet", "Signing", "Technical Hold" | Works for festivals, tours, hybrid events |
| **Multi-show day summary** — if two shows in one day, show both reports consolidated | Useful for matinee/evening double-day |
| **Cloud sync / backup** — optional iCloud/OneDrive backup of show history | Data safety on tour |
| **Print to AirPrint / Windows printer** | Direct from app, no PDF step needed |
| **Theming** — choose an accent colour | Personal preference / company branding |
| **Wired show mode** — stripped-down single-screen layout for complex wired shows with many technical holds | Specialist use case mentioned |

---

## 6. Screen Layout Plan

### Main Timer Screen (primary view)
```
┌─────────────────────────────────────────────────────┐
│  [Show Title]              [Date]        [12/24hr]  │
│                                                     │
│         CURRENT TIME: 19:32:45                      │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  DOORS OPEN         19:00:00   ✓            │    │
│  │  HOUSE OPEN         19:05:12   ✓            │    │
│  │  ACT 1 START        19:30:00   ✓            │    │
│  │  ACT 1 RUNNING      00:32:45   ▶  [STOP]   │    │
│  │  Expected: 55 min   OVER: +2:45  🟡         │    │
│  │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│    │
│  │  INTERVAL 1         --:--:--    [START]     │    │
│  │  ACT 2 START        --:--:--    [START]     │    │
│  │  SHOW END           --:--:--    [START]     │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [+ ADD ACT]  [+ ADD INTERVAL]  [HOLD ⏸]           │
│                                                     │
│  TOTAL SHOW TIME:  00:32:45  (Expected: 2h 15m)     │
│                                                     │
│  [VIEW REPORT]  [EXPORT]  [SETTINGS]               │
└─────────────────────────────────────────────────────┘
```

### Report View
```
┌──────────────────────────────────┐
│  SHOW REPORT                     │
│  Phantom of the Opera            │
│  Tuesday 3 June 2026             │
│  ──────────────────────────────  │
│  Doors Open:        19:00        │
│  House Open:        19:05        │
│  Act 1 Start:       19:30        │
│  Act 1 End:         20:28  (58m) │
│  Interval 1 Start:  20:28        │
│  Interval 1 End:    20:47  (19m) │
│  Act 2 Start:       20:47        │
│  Act 2 End:         21:45  (58m) │
│  Curtain Down:      21:46        │
│  ──────────────────────────────  │
│  Total Performance: 2h 15m       │
│  Total Running:     1h 56m       │
│  ──────────────────────────────  │
│  Notes: Late start — latecomers  │
│  ──────────────────────────────  │
│  [COPY]  [EXPORT PDF]  [CSV]     │
└──────────────────────────────────┘
```

---

## 7. Data Model (Outline)

```
Show
  ├── id: uuid
  ├── title: string
  ├── date: date
  ├── production: string (optional, links to a Template)
  ├── notes: string
  ├── time_format: "12h" | "24h"
  └── segments: Segment[]

Segment
  ├── id: uuid
  ├── type: "doors" | "house_open" | "act" | "interval" | "curtain_call" | "show_end" | "custom"
  ├── label: string (editable, e.g. "Act 1", "Interval", "Meet & Greet")
  ├── expected_duration_minutes: number | null
  ├── actual_start: datetime | null
  ├── actual_end: datetime | null
  ├── holds: Hold[]
  └── notes: string

Hold
  ├── start: datetime
  └── end: datetime | null

Template
  ├── id: uuid
  ├── production_name: string
  └── segments: TemplateSegment[]

TemplateSegment
  ├── type: SegmentType
  ├── label: string
  └── expected_duration_minutes: number | null
```

---

## 8. Keyboard Shortcuts (Proposed)

| Key | Action |
|---|---|
| `Space` | Start/Stop current active segment |
| `H` | Hold / Resume hold on current segment |
| `N` | New segment / advance to next |
| `Ctrl/Cmd + Z` | Undo last action |
| `Ctrl/Cmd + R` | Open report view |
| `Ctrl/Cmd + E` | Export |
| `Ctrl/Cmd + N` | New show |
| `Ctrl/Cmd + T` | Toggle 12/24hr |
| `Escape` | Close modal / go back |

---

## 9. Build & Distribution Plan

| Target | Format | Notes |
|---|---|---|
| Windows | `.exe` (NSIS installer) or `.msi` | Tauri generates both |
| macOS Apple Silicon | `.dmg` (ARM64) | Universal binary optionally includes Intel |
| macOS Intel | `.dmg` (x64) | Same codebase |

Local data stored in:
- Windows: `%APPDATA%\ShowTimer\`
- macOS: `~/Library/Application Support/ShowTimer/`

Format: SQLite via Tauri's `tauri-plugin-sql` or flat JSON files per show.

---

## 10. Build Phases

### Phase 1 — MVP
- Show creation with flexible segments
- Start/stop/manual/retroactive timers
- 12/24hr toggle
- Expected durations + over/under indicator
- Copy-to-clipboard report
- Dark/light mode
- Auto-save

### Phase 2 — Polish
- PDF/CSV export
- Show templates
- Show history & comparison
- Keyboard shortcuts
- Always-on-top
- Hold events within acts
- Undo

### Phase 3 — Power Features
- Pre-show call alerts / interval warnings
- Cloud backup
- Multi-show day summary
- Wired show mode
- Theming / accent colours

---

## 11. Open Questions (Decide Before Building)

1. **Tauri vs Electron?** Tauri is recommended — leaner, faster, native ARM. Requires Rust install in dev environment. Electron is heavier but easier if Rust is a blocker.
2. **Local DB vs JSON files?** SQLite is more robust for show history. Plain JSON is simpler for MVP. Recommend SQLite with Tauri plugin.
3. **Single window or multi-panel?** Suggest single resizable window with a collapsible report panel on the right.
4. **Sound alerts?** Useful for interval warnings but needs a mute option.
5. **Report format?** What fields does your theatre's show report form require? Knowing this shapes the export template.

---

*This document is the living plan. Update it as decisions are made.*
