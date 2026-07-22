# AudioVisualizer — Music → Visual Score Art Design Document

**Date:** 2026-07-21  
**Status:** Historical concept draft — implementation contract lives in [`DESIGN.md`](../../../DESIGN.md).
**Author:** AI Agent + User  
**Target:** macOS (Phase 1 Desktop App & Web), Windows/Linux (Phase 2), Mobile (Phase 3)

---

## 1. Overview & Purpose

**AudioVisualizer** turns music (MIDI note events initially, audio later) into deterministic, reproducible visual score art and animations. Geometric figures are driven explicitly by musical parameters: pitch, duration, interval, velocity, and voice/channel, paired with published human-readable and machine-readable rule sets.

### Key Requirements
1. **Deterministic Reproducibility**: Given the same MIDI file + configuration + seed, output image (SVG/PNG) is 100% identical.
2. **Multiple Visual Variations**:
   - **Variation A (Lines / Polylines)**: Multi-segment paths per voice.
   - **Variation B (Circles)**: Disks/rings per note with radius scaling.
   - **Variation C (Vertical Tone / Staff)**: Horizontal time, vertical pitch graph.
3. **Origin Modes**:
   - **Left-to-Right**: Progresses horizontally across canvas.
   - **Center-Outward**: Grows outward from center origin.
   - **Outside-Inward**: Grows inward from frame perimeter.
4. **Legend Generation**: Every export can include an embedded or downloadable legend explaining stroke/color/angle mappings.
5. **Pen-Plotter Compatibility**: Clean SVG output mode (stroke-only, no fills, contiguous paths).

---

## 2. System Architecture

The application is structured into four decoupled layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Layer (Control Panel)                  │
│       Vite + TypeScript + Modern CSS (Vite / Desktop Shell) │
└──────────────────────────────┬──────────────────────────────┘
                               │ User Config & Actions
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Domain Engine (Pure TS)                   │
│   • MIDI Parser (@tonejs/midi)                              │
│   • Score Normalizer (NoteEvent Stream per Voice)           │
│   • Geometry Mapper (Rule Engine & Presets A/B/C)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ Generated Geometry & Paths
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐┌──────────────────────────────┐
│       SVG Builder            ││     Canvas 2D Renderer       │
│  • Vector Path Generator     ││  • Real-time Playback / Scrub │
│  • Pen-Plotter SVG Export    ││  • Interactive Zoom/Pan      │
│  • Embedded Legend Group     ││  • Frame Exporter (PNG/WebM)  │
└──────────────────────────────┘└──────────────────────────────┘
```

---

## 3. Data Model & Rule Engine

### 3.1 Note Event Schema
```typescript
interface NoteEvent {
  id: string;
  pitch: number;      // MIDI note (0 - 127)
  onset: number;      // Time in seconds
  duration: number;   // Duration in seconds
  velocity: number;   // 0 - 127
  voice: number;      // Channel / Track index
  pitchClass: number; // midi % 12 (0 = C, 1 = C#, ...)
}
```

### 3.2 Mapping Parameters (Rule Config)
| Parameter | Values / Formula | Visual Effect |
|---|---|---|
| **Origin Mode** | `Left-to-Right`, `Center-Outward`, `Outside-Inward` | Coordinates of initial cursor & growth direction |
| **Pitch Hue** | `PitchClass` (`(midi % 12)/12 * 360`) or `Register` (`(midi * k) % 360`) | Rainbow color mapping |
| **Duration Scale** | `pixelsPerSecond` or `pixelsPerBeat` | Segment length or circle radius |
| **Turn Angle** | `interval * semitoneAngleScale` | Turn angle delta per note |
| **Velocity Weight** | `minWidth + (velocity/127) * widthRange` | Stroke width / opacity |
| **Gap Policy** | `liftPen`, `faintLine`, `ghost` | Rest behavior between notes |

---

## 4. Technology Stack

- **Frontend Core**: TypeScript, HTML5 Canvas 2D, SVG DOM / String rendering, Vite dev server.
- **MIDI Parsing**: `@tonejs/midi`.
- **Desktop Shell**: Not implemented; the current product is browser-only.
- **Code Quality**: TypeScript strict mode and Vitest unit tests. ESLint and Prettier are not currently configured.

---

## 5. File Tree Structure

```text
AudioVisualizer/
├── .context/
│   └── project-profile.md
├── docs/
│   └── superpowers/specs/
│       └── 2026-07-21-music-to-visual-score-art-design.md
├── src/
│   ├── core/
│   │   ├── midi/            # MIDI parsing & normalization
│   │   ├── mapper/          # Score → Geometry mapping engine
│   │   ├── presets/         # Preset configurations (A, B, C)
│   │   └── types.ts         # NoteEvent, Config, Geometry types
│   ├── renderers/
│   │   ├── svg/             # SVG path builder & legend exporter
│   │   └── canvas/          # Canvas 2D live renderer & animator
│   ├── ui/
│   │   ├── components/      # Control panel, sliders, file dropzone
│   │   ├── styles/          # Modern Vanilla CSS design system
│   │   └── app.ts           # UI entrypoint & state manager
│   └── index.html
├── src-tauri/               # Tauri 2.0 desktop shell configuration
├── tests/
│   ├── midi.test.ts
│   ├── mapper.test.ts
│   └── svg.test.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 6. Verification & Testing Strategy

1. **Unit Tests**: Vitest suite verifying MIDI parsing accuracy, geometry calculation determinism, and SVG string output equality.
2. **Visual Verification**: Sample MIDI fixtures rendered to SVG and verified for exact path counts, colors, and bounding boxes.
3. **Build Verification**: `npm run build` and `npm run test` pass clean.

---

## 7. Next Steps

1. Create implementation plan (`implementation_plan.md`).
2. Repoint Git remote if requested by user.
3. Initialize Vite + TypeScript scaffold with Tauri configuration.
