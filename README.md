# Resolume Show Control

A timeline-driven show-control tool for a single Resolume Arena machine, styled in an
operator-console aesthetic (inspired by BlackPixel's Resolume Show Control). Lay your
show out on a timeline over the song, hit play, and the app fires clips and columns at
their exact moments over OSC while mirroring live state from Arena over REST/WebSocket.

## Locked decisions

| Area | Decision |
| --- | --- |
| Target | Working control tool — timeline + live triggering |
| Machines | Single Resolume machine (no cross-machine sync in v1; engine kept abstract so it can bolt on later) |
| Resolume | Arena 7.8+ → full REST + WebSocket + OSC (auto-discovery, thumbnails, live mirror) |
| Packaging | Electron desktop app (React + TypeScript + Vite), single installer |
| Aesthetic | Operator-console look + status bar + short boot splash; tool-first layout |

## Architecture

```
┌────────────────────────── Electron ──────────────────────────┐
│  Renderer (React + TS)                                        │
│   • Timeline editor · waveform · clip grid · transport        │
│   • Master clock  = Web Audio AudioContext                    │
│   • Look-ahead scheduler → dispatches fires to main via IPC   │
│                         ▲ IPC ▼                               │
│  Main (Node)  — ResolumeClient                                │
│   • OSC send (dgram UDP :7000)       ← fire clips/columns     │
│   • REST client (:8080 /api/v1)      ← discover + thumbnails  │
│   • WebSocket subscribe              ← live state mirror       │
│   • Disk I/O: shows, song bank, settings                      │
└───────────────────────────────────────────────────────────────┘
        │ OSC :7000 (fire)        │ REST/WS :8080 (state)
        ▼                         ▼
                    Resolume Arena 7.8+
```

Firing goes over **OSC** (low latency); discovery, thumbnails and live state come over
**REST + WebSocket**. The **look-ahead scheduler** (Web Audio clock, ~120 ms schedule
window on a ~25 ms tick) is what keeps triggers on the frame instead of drifting.

## v1 feature set

**Build now**
1. Connection manager (host/ports, status) + composition discovery with real clip thumbnails.
2. Live clip grid mirroring Arena — click to trigger by hand; active clips reflected via WebSocket.
3. Song loader → waveform → transport (play/stop/seek/playhead) + BPM (manual + tap) + beat/bar grid.
4. Multi-lane timeline: one lane per layer + a Columns lane; add/drag/delete triggers; snap to beat/bar.
5. Show engine: look-ahead scheduler firing OSC on playback + panic/blackout.
6. Song Bank: save/load songs (audio + timeline + BPM), batch import, library UI.
7. Local persistence (JSON shows, autosave) + console aesthetic + status bar (BPM/TC/connection).

**Design for, build later:** Ableton Link (tempo/phase lock), LTC/SMPTE-in, operator/fullscreen
mode, Ctrl/⌘-K palette, AI timeline programmer, and multi-machine master/follower sync.

## Milestones

- **M0 ✅ — De-risk the integration.** "Discover the composition + fire a clip" against real
  Arena, proven by the [`probe/`](probe/) and shipped as the live clip grid in the app.
- **M1 ✅ — Audio master clock.** Song load + waveform + transport + BPM/tap + beat grid,
  driven by the Web Audio clock ([`src/renderer/src/audio/engine.ts`](src/renderer/src/audio/engine.ts)).
- **M2 ✅ — Timeline editor.** Multi-lane authoring (clip + column cues), drag-to-schedule,
  beat/bar snap, shared playhead ([`src/renderer/src/components/Timeline.tsx`](src/renderer/src/components/Timeline.tsx),
  [`src/renderer/src/show/`](src/renderer/src/show/)).
- **M3** show engine (look-ahead scheduler fires the cues over OSC) → **M4** song bank +
  persistence → **M5** aesthetic pass + polish → **M6 (optional)** Link / operator mode / AI programmer.

## M0: run the probe

In Resolume Arena → **Preferences**: enable **Webserver** (port 8080) and **OSC Input**
(port 7000).

```bash
cd probe
npm install
node resolume-probe.mjs            # discover: prints the layer/clip grid
node resolume-probe.mjs fire 1 1   # fire layer 1, clip 1
```

If Resolume is on another machine, prefix with
`RESOLUME_HOST=<ip>`. M0 passes when `discover` prints your composition and `fire`
lights the clip in Arena (and the REST read-back reports it connected).

## Run the app (operator UI)

The probe validated the integration; the Electron app is the same integration behind a
live console.

```bash
npm install
npm run dev
```

On launch it shows the boot splash, then auto-connects to the host in the top bar
(defaults to `172.16.8.27` — edit the field and hit CONNECT, or press Enter, to point
elsewhere).

**M0 — live clip grid + firing**
- one row per layer, real thumbnails pulled from Arena;
- a **LINKED** LED + status bar (host, comp name, layer/clip totals, last-fired, clock);
- **click any clip to fire it** over OSC — the tile Arena reports connected lights green,
  mirrored live over the WebSocket.

**M1 — audio master clock + transport** (the clock the show will schedule against)
- **OPEN** (or drag-drop) an audio file → it decodes into a Web Audio buffer;
- **waveform** with click / drag to seek and a **beat + bar grid** overlaid from the BPM;
- **transport**: play / pause (**Space**), stop-to-zero, sample-accurate playhead + timecode;
- **BPM**: manual entry + **TAP** tempo, plus a beat **OFFSET** to line bar 1 up with the downbeat.

**M2 — timeline editor** (author the show; nothing fires yet — that's M3)
- a **lane per layer** (that has clips) plus a **COLUMNS** lane, sharing one time axis with the waveform;
- **schedule a clip**: drag it from the grid onto its layer's lane — drops snap to the beat/bar grid;
- **schedule a column**: double-click the COLUMNS lane; select the cue to step its column number;
- **edit**: drag a cue to move it (snapped), click to select, **Del** to remove, **CLEAR** to wipe;
- **SNAP** toggle: OFF / BEAT / BAR. Live playhead scrubs across ruler, waveform and lanes together.

> ⚠️ **Clicking a clip changes live output.** The default host is a real in-use rig, so
> only run this against a machine you're cleared to drive, or repoint the host first.

`npm run build` compiles all three bundles (main / preload / renderer); `npm start`
runs the built app.

## Reference

- REST API: https://resolume.com/docs/restapi/ · https://www.resolume.com/support/en/restapi
- OSC: https://resolume.com/support/en/osc
- Official React example: https://github.com/resolume/arena-rest-example
