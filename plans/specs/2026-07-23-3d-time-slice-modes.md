# Design Spec: 3D Time-Slice Visualization Modes

Date: 2026-07-23 (polish & performance pass 2026-07-24)
Status: Revised — decisions locked; visual-polish and performance sections added
Implementation plan: [`plans/2026-07-24-3d-calligraphic-modes.md`](../2026-07-24-3d-calligraphic-modes.md)

## Overview

A new visualization family in which musical time advances along the positive Z axis and
the existing `lines` and `circles` (note halos) algorithms govern movement in the XY
plane. The result is a 3D calligraphic score: the interval/pitch-based path directions
and arc radii that currently draw flat on a canvas instead spiral and thread through
depth. Each note's onset time determines how far along Z its segment or disc sits.

Renderer: **Three.js** (WebGL), isolated behind a thin interface so the existing Canvas
2D / SVG pipeline is untouched.

Navigation: **Phase 1** — fixed angle presets. **Phase 2** — mouse/touch orbit
(`OrbitControls`). **Phase 3** — chase cam (playhead tracking) and free camera.

---

## 1. Coordinate System

| Axis | Meaning | Default range |
|------|---------|---------------|
| Z    | Musical time, positive = forward; Z₀ = score start | 0 … score.duration × zScale |
| X, Y | Spatial encoding from the existing interval/path algorithm | determined by note sequence |

A `zScale` parameter (pixels per second, like the existing `lengthScale` for XY) governs
how spread the score is in depth. The ratio `zScale / lengthScale` controls whether the
path reads as mostly "spatial" (small zScale) or mostly "temporal" (large zScale).

---

## 2. Phase 1 — 3D Path Extensions

### 2.1 3D Lines (`3d_lines`)

The existing `lines` mapper produces 2D segments with a heading angle (from interval
rules, `angleScale`, `spiralBias`) and a length (from `duration × lengthScale`). In 3D,
the segment is extended to six coordinates:

- **Start**: `(x₀, y₀, onset × zScale)`
- **End**: `(x₁, y₁, (onset + duration) × zScale)`

where `(x₁, y₁)` is the existing XY endpoint from the 2D heading algorithm. The segment
therefore moves simultaneously in XY (by pitch/interval) and in Z (by duration). A short
staccato note advances little in Z; a long sustained note pushes deep.

#### Gap handling

During rests the cursor XY stays fixed but Z advances to the next note's onset. With
`gapPolicy = 'lift_pen'` no geometry is emitted; with `'faint_line'` or `'ghost'` a
faint segment runs along Z with zero XY displacement, visually marking elapsed silence.

#### Polyphony (chordLayout = 'polyphony')

The existing centroid/fan logic is unchanged for XY; all branch points are at the
same Z = cluster onset. Each branch segment ends at its own `(x₁, y₁, z_end)`.

#### Three.js geometry

- Line segments → `THREE.LineSegments` (one `BufferGeometry` per voice).
- For thickness: `THREE.TubeGeometry` segments or a `LineSegments2` / `LineMaterial`
  from the Three.js examples extras (`three/examples/jsm/lines/`), which supports
  world-space pixel-width lines and avoids the WebGL single-pixel `gl.lineWidth` limit.
- Stroke color: existing pitch-class hue. Width: existing velocity-driven `strokeWidth`.
- Opacity: existing per-segment `opacity`.

---

### 2.2 3D Note Halos (`3d_note_halos`)

The existing `circles` mapper advances a center cursor in XY by the interval algorithm
(same headings as `lines`) and emits a circle at each step. In 3D each circle becomes a
flat disc in the XY plane floating at Z = onset × zScale:

- **Center**: `(x_center, y_center, onset × zScale)` — XY from existing cursor advance.
- **Radius**: same formula (`max(5, duration × lengthScale × 0.4)`).
- **Normal**: along +Z (disc faces the viewer when viewed from the +Z direction).

Gap Z advancement follows the same rules as 3D lines.

#### Three.js geometry

- `THREE.CircleGeometry` (filled, pitch-class hue at 75 % opacity) + `THREE.RingGeometry`
  outline (white, thin), both at the same Z position.
- `DoubleSide` material so discs are visible from both front and back during orbit.

---

### 2.3 New Rule Config Field

```typescript
// Added to RuleConfig
zScale: number;   // pixels per second along Z axis; default 200
```

`zScale` is BPM-free; it is a pure spatial scale. It should appear in the sidebar
alongside `lengthScale` and carry through to exports and manifests.

---

### 2.4 Export (Phase 1)

- **PNG**: Three.js `renderer.domElement.toDataURL()` after `renderer.render()`. Same
  resolution as existing PNG exports. Active camera angle (preset) is captured.
- **SVG**: Deferred; Three.js WebGL output cannot be serialized to SVG natively without
  a separate projection pass. Planned in Phase 2 as a projected-line SVG.
- **Plotter SVG**: Deferred to Phase 2 or later.
- **CLI `npm run render`**: Deferred until headless Three.js rendering is evaluated
  (e.g., via `gl` npm package or `puppeteer`-driven screenshot).

---

## 3. Projection — Three.js (confirmed)

Three.js is the renderer for all 3D modes. It was chosen over a software isometric
renderer because:

- Free-orbit navigation (Phase 2) and chase-cam (Phase 3) require GPU-accelerated
  per-frame re-rendering. A software renderer cannot sustain 60 fps during orbit on a
  dense polyphonic score.
- Proper Z-buffer eliminates painter's-algorithm sort errors for overlapping segments.
- `LineSegments2` / `LineMaterial` gives world-space line thickness, which the software
  renderer cannot match for 3D line geometry.
- The existing Canvas 2D / SVG pipeline is fully preserved for all 2D modes; Three.js
  runs in a sibling `<canvas>` element only when a 3D variation is active.

### Bundle impact

Three.js core (r160+) is ~600 KB minified; with tree-shaking and only the needed
geometries/materials the shipped chunk should be well under 300 KB. It should be
dynamically imported (`await import('three')`) so 2D-mode users do not pay the cost.

### Tauri compatibility

WebGL is available in all WebView2 / WKWebView targets; Three.js runs offline without
modification.

---

## 4. Navigation Phases

### Phase 1 — Fixed Angle Presets

A small set of named camera positions selectable from a sidebar dropdown or HUD badge
(same frosted-glass style as existing HUD controls):

| Preset | Azimuth | Elevation | Description |
|--------|---------|-----------|-------------|
| Isometric | 45° | 30° | Classic isometric; pitch and time both readable |
| Front | 0° | 0° | XY face only — reproduces 2D appearance |
| Side | 90° | 0° | Pure time/Z axis; pitch and register readable |
| Bird's Eye | 45° | 80° | Time as depth; color field above |

Camera uses `THREE.OrthographicCamera` in Phase 1 so scale is invariant across distance.
Preset changes trigger a short lerp (0.3 s) to the new angle.

Export captures whichever preset is active at export time; the active preset name is
recorded in PNG metadata and manifests.

### Phase 2 — Orbit Controls

Add `three/examples/jsm/controls/OrbitControls`. Click-drag orbits; scroll-wheel
zooms FOV; middle-drag or two-finger pan shifts the scene. Manual orbit suspends preset
snap (same pattern as existing `autoZoom` suspension on manual pan). Switch to
`THREE.PerspectiveCamera` (or keep orthographic with an orbit wrapper) — to be decided
at implementation time.

Export: serialize `{ azimuth, elevation, zoom }` in `ViewportTransform3D` so an
orbited view can be reproduced from a manifest.

### Phase 3 — Chase Cam and Free Camera

**Chase cam**: Camera follows the active playhead along the Z axis, locked to the
current `t × zScale` Z position and offset behind it by a configurable `chaseLead`
distance. Similar to auto-zoom tracking in 2D, but in Z. Enabled/disabled from HUD.

**Free camera**: Camera position and look-at are fully detached from any preset or
orbit constraint. Keyboard or sidebar inputs drive fine-grained azimuth/elevation/roll/
position. Intended for art-direction and screenshot purposes.

---

## 5. Phase 2 — 3D Piano Roll Slab (deferred, later phase of this plan)

After the 3D path modes ship, the next planned XY encoding is the classical **piano roll
slab**: each note is an axis-aligned rectangular box in 3D where pitch → X, voice → Y,
and onset/duration → Z range.

- **X** = MIDI pitch (0 … 127), linearly mapped.
- **Y** = voice index, evenly spaced.
- **Z** = [onset × zScale, (onset + duration) × zScale].
- Color: pitch-class hue (same formula). Opacity: velocity-driven.

This is the most immediately legible 3D music visualization to a general audience; it
is deliberately saved for Phase 2 so the first phase focuses on modes that are visually
distinct from anything available elsewhere — the calligraphic 3D path is the novel
contribution.

Three.js geometry: `THREE.BoxGeometry` per note, or instanced mesh
(`THREE.InstancedMesh`) for performance on dense scores.

See the deferred XY mode section for other candidates considered and dropped for this plan.

---

## 6. Readability Constraints

These carry forward unchanged from the project's visual design rules:

1. **Pitch-class hue** — `hsl(pitchClass × 30, 85 %, 60 %)` is the primary musical
   signal in every 3D mode.
2. **Voice color offset** — `hueOffsetPerVoice` shifts apply as in 2D; the 3D spatial
   separation by voice (Phase 2 piano roll) makes color a secondary signal when XY
   already encodes voice.
3. **Temporal direction** — Z increases forward in time. A faint grid or axis indicator
   must mark "past" vs. "future" unambiguously. The Front preset (facing –Z) renders
   a time-forward view; the Side preset renders time as horizontal depth.
4. **Density** — Dense polyphonic sections must not be a solid mass. Translucent segment
   and disc materials (alpha 0.7 default, configurable) and depth-based fog
   (`THREE.FogExp2`) help separate depth layers.
5. **Determinism** — All 3D positions and camera presets are fully determined by the
   score, rule config, and the active camera preset / `ViewportTransform3D`. No
   randomness is introduced.
6. **Legend** — 3D modes require an updated legend explaining X, Y, Z axes. The legend
   must describe only the mapping, not music-theory inferences.

---

## 7. Architecture Impact

### New variation types

```typescript
export type Variation =
  | 'lines' | 'circles' | 'vertical_tone' | 'tonal_time_lines'   // existing 2D
  | '3d_lines'        // Phase 1: calligraphic path in 3D
  | '3d_note_halos'   // Phase 1: disc halos in 3D
  | '3d_piano_roll';  // Phase 2: pitch × voice × time boxes
```

### New geometry type

```typescript
export interface GeometrySegment3D {
  startX: number; startY: number; startZ: number;
  endX: number;   endY: number;   endZ: number;
  color: string;
  width: number;
  opacity: number;
  note: NoteEvent;
  role?: 'note' | 'gap';
  dashArray?: string;
}

export interface GeometryDisc3D {
  cx: number; cy: number; cz: number;
  radius: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  note: NoteEvent;
}

export interface RenderedGeometry3D {
  segments: GeometrySegment3D[];   // for 3d_lines
  discs:    GeometryDisc3D[];      // for 3d_note_halos
  config: RuleConfig;
  bpm: number;
}
```

### New viewport type

```typescript
export interface ViewportTransform3D {
  preset: '3d_isometric' | '3d_front' | '3d_side' | '3d_birds_eye' | 'custom';
  azimuth: number;    // degrees; serializable for manifests
  elevation: number;  // degrees
  zoom: number;       // orthographic scale or perspective FOV
  panX: number;       // scene-space offset
  panY: number;
  chaseEnabled: boolean;  // Phase 3
  chaseLead: number;      // seconds ahead of playhead; Phase 3
}
```

### Renderer isolation

```typescript
// src/renderers/three/ThreeDRenderer.ts
export interface I3DRenderer {
  mount(canvas: HTMLCanvasElement): void;
  setGeometry(geo: RenderedGeometry3D): void;
  setViewport(vp: ViewportTransform3D): void;
  stepPlayhead(t: number): void;
  capturePNG(): Promise<Blob>;
  dispose(): void;
}
```

`ThreeDRenderer` implements `I3DRenderer` using Three.js. The 2D modes never import
Three.js; dynamic `import('three')` fires only when a 3D variation is first activated.

### Mapper extension

`mapScoreToGeometry()` returns `RenderedGeometry` (2D) or `RenderedGeometry3D` (3D)
depending on the active variation. The cleanest approach is a union:

```typescript
export type AnyRenderedGeometry = RenderedGeometry | RenderedGeometry3D;
```

with a discriminant (`is3D: boolean` or `type: '2d' | '3d'`) so callers can narrow
without casting.

---

## 8. Visual Polish & Atmosphere (bells and whistles)

These are what make the mode feel alive rather than a wireframe dump. They are grouped
by which phase they land in so the first release is already striking without blocking on
all of them.

### 8.1 Bloom / glow (Phase 1) — the signature look

Saturated pitch-hued lines and discs glowing against a black field is the single highest-
impact effect and is directly on-brand with the dark, high-contrast design language.

- Use `EffectComposer` + `UnrealBloomPass` (`three/examples/jsm/postprocessing/`).
- Drive bloom from an **emissive** material channel so only the strokes glow, not the
  background. Emissive intensity scales with velocity, so louder notes glow brighter.
- Bloom strength is a user control (0 = off, for a crisp technical look; high = neon).

### 8.2 The "now plane" playhead (Phase 1)

A translucent plane perpendicular to Z sweeps forward at `t × zScale` during playback —
a literal wavefront of the present moment cutting through the score solid.

- Notes **ahead** of the plane (future) render dim / desaturated; notes the plane has
  **passed** render at full glow. This gives an unmistakable temporal reading of an
  otherwise ambiguous 3D axis and doubles as the answer to the "which way is time?"
  readability constraint.
- The plane itself is a faint additive-blended quad with a bright leading edge line.

### 8.3 Onset pulse (Phase 1)

As the now-plane crosses a note's onset, that segment/disc briefly flares: a short
emissive spike and a ~1.15× scale pop easing back over ~150 ms. Chords visibly bloom
together. Purely playback-time; baked geometry is unchanged.

### 8.4 Depth fog & graded background (Phase 1)

- `THREE.FogExp2` in the background color tints distant geometry, separating depth layers
  and preventing the far end of a long score from reading as a flat wall.
- Background is a subtle vertical gradient (near-black to a very dark blue/violet) rather
  than pure `#000`, matching the "subtle atmosphere" the 2D modes already use.

### 8.5 Tube ribbons (Phase 1 or 2)

Render `3d_lines` as `TubeGeometry` (rounded, volumetric) rather than flat 1-px lines.
The path becomes a glowing calligraphic ribbon threading through space — the core novel
aesthetic of this feature. Tube radius follows the existing velocity-driven stroke width.

### 8.6 Grounding grid & parallax field (Phase 2)

- A faint reflective floor grid beneath the score gives the eye a ground plane and makes
  orbit motion legible. Reflections kept very subtle so color stays dominant.
- A sparse, slowly drifting particle field (points) adds parallax during orbit, selling
  the 3D depth without competing with the score. Deterministic seed → reproducible.

### 8.7 Idle turntable & cinematic captures (Phase 3)

- When idle (not playing, not being orbited), the camera slowly auto-rotates
  (turntable), so the piece always looks alive on screen.
- **Turntable export**: capture a full 360° orbit (or one playback pass under the chase
  cam) to a WebM via `MediaRecorder` on the WebGL canvas — a shareable animated render of
  the score rotating or of the now-plane sweeping through. This is the "wow" export.

### 8.8 Anti-aliasing & color management

- Enable MSAA (`antialias: true`) or SMAA pass; thin bright lines alias badly without it.
- Use `THREE.ACESFilmicToneMapping` + `SRGBColorSpace` so bloomed saturated hues render
  gracefully instead of clipping to white.

---

## 9. Performance

3D changes the cost model from "draw N 2D primitives once" to "re-render the whole scene
every frame during orbit/playback." The following keep dense polyphonic scores smooth.

### 9.1 Geometry batching

- **Merge per voice**: combine all of a voice's line segments into one
  `BufferGeometry` (`BufferGeometryUtils.mergeGeometries`) → one draw call per voice
  instead of per note. A typical score drops from thousands of draw calls to a handful.
- **Instanced discs / boxes**: render `3d_note_halos` discs and Phase-2 piano-roll boxes
  with `THREE.InstancedMesh`; per-note color/opacity via instance attributes. One draw
  call for all discs of a kind.
- Vertex colors (per-note hue baked into the buffer) avoid per-note materials.

### 9.2 Render-on-demand

- When the scene is static (no playback, no orbit, no idle turntable), stop the render
  loop and only re-render on an `invalidate()` (preset change, resize, geometry change).
  This drops idle GPU/CPU use to zero — important on laptops and in a Tauri window.
- During playback/orbit, run a normal `requestAnimationFrame` loop.

### 9.3 Frame-cost controls

- Cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` so 4K/Retina panels don't
  quietly quadruple fragment cost.
- Frustum culling is automatic per-mesh, but merged-per-voice geometry limits its help;
  optionally split very long scores into a few Z-chunks so off-screen chunks cull.
- Bloom is the most expensive pass — render it at half resolution and allow disabling it
  on low-end hardware (auto-detect via a quick frame-time probe, or a quality toggle).

### 9.4 Lazy load & bundle discipline

- `await import('three')` (and postprocessing extras) only when a 3D variation first
  activates; 2D-only sessions never download or parse Three.js.
- Import named modules from `three/examples/jsm/...` so tree-shaking drops unused passes.

### 9.5 Memory hygiene

- Dispose geometries, materials, textures, and render targets on variation switch /
  score reload; Three.js does not garbage-collect GPU resources automatically. The
  `I3DRenderer.dispose()` contract enforces this.

### 9.6 Off-thread geometry build (optional, later)

If mapping a very large score to `RenderedGeometry3D` ever stalls the main thread, move
`map3DGeometry()` into a Worker returning transferable typed arrays. Not needed for v1.

---

## 10. Deferred XY Modes (not in this plan)

The following XY encoding candidates from the initial brainstorm were considered and
deferred. They are tracked individually on `dev-docs/TO_DO.md`:

| Mode | Concept | Deferred reason |
|------|---------|-----------------|
| **Chromagram Column** | X = pitch class, Y = octave; notes are pillars | Pitch-class/octave grid is static — less calligraphic than the path approach; needs careful bin collision handling |
| **Voice Ribbon Grid** | Y = voice lane, X = pitch within lane | Good for traceable voices; niche for solo instruments; Phase 2 piano roll covers this better |
| **Velocity-Height Spire** | X = pitch, Y = velocity; dynamic landscape | Velocity already in stroke-width; crowded for polyphony |
| **Frozen 2D Frame Stack** | Volumetric discretized stack of existing 2D frames | High engineering cost, modest visual gain; GPU voxel renderer needed |
