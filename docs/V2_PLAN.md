# Show Timer — v2 Implementation Plan

> Working reference for the v2 overhaul. Kept in `docs/` so it survives context loss.
> Branch: `v2`. Status legend: ⬜ not started · 🟡 in progress · ✅ done.

## Vision

Each show **file** becomes three linked faces of one event:

| Face | Holds | For |
|---|---|---|
| **People** | Staff (name, role, arrival, leave) + client arrival/departure | Staffing / billing |
| **Run Sheet** | Bump in/out, doors, acts, intervals, manually-added show finish | The operator live |
| **Report** | Combined output + tech comments + client comments + signature | Handover document |

Underlying goal: **billable time accounting** (time *in show* vs *not in show*) and a **signed handover PDF**. Production runs roll per-day reports into one combined summary.

## Locked decisions (2026-06-11)

- **Show layout:** tabs within the show — People · Run Sheet · Report.
- **Billable "show time":** doors open → show finish. Doors count as show time. Bump in/out, rehearsal, plotting = "not in show".
- **Manager preset delivery:** both file export/import (`.showtimer.json`) and push-over-live-session.
- **Dev mode:** seed + dev panel (CLI flags + preset test shows + in-app dev panel with clock-jump & state dump).

## Data model (foundation)

`src/types/index.ts` — extend `Show`:

```ts
interface StaffMember {
  id: string;
  name: string;
  role: string;
  arrival: string | null;    // ISO
  departure: string | null;  // ISO
}

interface Show {
  // ...existing...
  staff: StaffMember[];           // NEW
  clientArrival: string | null;   // NEW
  clientDeparture: string | null; // NEW
  techNotes: string;              // EXISTS → UI label "Tech Comments"
  clientComments: string;         // NEW
  clientSignature: string | null; // NEW — base64 PNG
}
```

`AppSettings` additions:
```ts
reportTimeFormat: '12h' | '24h' | 'match';  // report clock, separate from interface
showTimeStartsAt: 'doors' | 'show_start';   // billing boundary (default 'doors')
devMode: boolean;
```

Migration: `normalizeShow()` in `loadTauriStore()` fills new fields on old saved shows. **Must land first.**

## Timing semantics

- **Show time** = from doors-open segment start (or `showTimeStartsAt`) to show-finish timestamp. Doors included.
- **Non-show time** = bump_in, bump_out, rehearsal, plotting segments.
- New helpers in `types/index.ts`: `getShowTimeWindowMs(show)`, `getNonShowTimeMs(show)`. Keep existing `getShowTimeMs`/`getProductionSegmentMs` until report refactor, then reconcile.

## Phases

### Phase 1 — Data model + migration + timer-behaviour fixes ✅
- ✅ Add new types + `normalizeShow()` migration (load path in `store/index.ts`).
- ✅ Store actions: `addStaff`, `updateStaff`, `removeStaff`, `setClientTime(field)`, `updateClientComments`, `setSignature`.
- ✅ **Undo bump-in auto-start**: `defaultSegments()` → bump_in `actualStart: null`.
- ✅ **Show finish manual**: removed `show_end` from `defaultSegments()` + run template; added "＋ Show Finish" menu action (`addShowFinish`), single-instance enforced.
- ✅ `createShow`/`createRun`/`startNextPerformance` initialise People fields via `defaultPeople()`.
- ✅ New timing helpers `getShowTimeWindowMs` / `getNonShowTimeMs` (doors→finish billing).

### Phase 2 — 12/24h time editing everywhere ✅
- ✅ Reusable `TimePicker.tsx`: `BigTimePicker` (modal HH:MM:SS), `InlineHmPicker` (HH:MM), `CompactTimePicker` (set/clear wrapper); AM/PM toggle in 12h, hidden in 24h. `to12h`/`from12h` helpers.
- ✅ `TimeEditModal` uses `BigTimePicker` (was hard 0–23).
- ✅ `SegmentCard` planned start/end use `InlineHmPicker` (removed both `type="time"`).
- ✅ `ShowSetupModal` + `RunSetupModal` use shared `CompactTimePicker` (removed remaining `type="time"`).
- ✅ Verified in browser: 12h shows AM/PM (07:30 PM), 24h shows 19:30 with no toggle.

### Phase 3 — Bidirectional duration ⇄ planned-end ✅
- ✅ `reconcileSchedule(seg, edited)` in store + `hmToMin`/`minToHm` (overnight-wrapping). Edit duration → recompute end (or start); edit planned end → recompute duration (or start); edit planned start → hold duration, shift end (or derive duration). Wired into `updateSegmentExpected` and `updateSegmentSchedule` (clearing a field skips derivation).

### Phase 4 — People face ✅
- ✅ `PeoplePanel` — client access (arrival/departure + on-site duration) and staff table (name, role, in/out, computed hours, add/remove).
- ✅ Generic `TimestampModal` (BigTimePicker-based, anchors HH:MM:SS to show date, Use-Current-Time / Clear) used by every staff & client time cell.
- ✅ Within-show **Run Sheet · People** tab strip in `TimerView` (people count badge). Report still the existing side panel until Phase 5/7.
- ✅ Verified in browser: tabs switch, staff rows add, timestamp modal saves, hours compute.

### Phase 5 — Report overhaul ✅
- ✅ Settings: `reportTimeFormat` ('12h'|'24h'|'match'), `showTimeStartsAt`, `devMode`; `resolveReportFormat()` helper; SettingsView "Report Clock" control; defaults merged onto old saved settings.
- ✅ Redesigned `pdf.ts`: header · client-access cards · staff table · show-timing table (NO +/− column) · in-show vs not-in-show totals · tech + client comment boxes · signature (image or sign-here line) · multi-page footer.
- ✅ `generateRunReportPDF(run, shows)` combined summary (per-day client in/out, staff in/out, show time, run totals) + `generateAllRunReports()`.
- ✅ `SignaturePad` canvas component (base64 PNG → `clientSignature`).
- ✅ New **Report tab** (`ReportTab`): live summary + tech/client comments + signature + PDF actions. Replaced the old side `ReportPanel` (removed it + `report.ts` + header toggle). Third within-show tab.
- ✅ Verified: Report tab renders, PDF generates with no console errors.

### Phase 6 — Sync whole run + export/import + manager preset ⬜
- ⬜ Broadcast `{ runs, shows, currentShowId }` slice (`broadcastState`); merge by id (`applyRemoteState`). Rust just relays JSON — only field renames in `session.rs`.
- ⬜ Export/import `.showtimer.json` (Tauri dialog + fs plugin) for a show or whole run.
- ⬜ Manager preset: build run w/ planned times, no actuals → export file AND/OR push over session; staff loads → presses Start.

### Phase 7 — Dev mode + interface redesign + polish ⬜
- ⬜ CLI flags in `main.rs`/`lib.rs`: `--dev`, `--seed`, `--scenario=<name>`.
- ⬜ Dev panel (gated by `devMode`): seed preset shows, jump clock, simulate peer, dump/log sync traffic; verbose sync logging.
- ⬜ Interface redesign around People / Run Sheet / Report tabs; fix mixed pre/show/post list confusion.
- ⬜ General bug + visual sweep; expose more custom settings.

## Notes / ideas worth adding as we go
- Clock-jump dev tool needs a global "now" injection (currently `useClock` reads real `new Date()`); add a dev clock offset in the store that `useClock` and timing helpers respect.
- Signature pad: small canvas component → base64 PNG into `clientSignature`.
- Export filename convention: `<Production>-<date>.showtimer.json`.
- Consider a `schemaVersion` field on the persisted store for future migrations.
