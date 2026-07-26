# Plan: Track-Average Color for Gradient/Highlight on Dark Background

Last reviewed: 2026-07-25
Date: 2026-07-25
Author: Antigravity
Status: complete (revised 2026-07-25 per user feedback)
Linked issue/PR: n/a

## Goal

Replace the fixed highlight color (currently blue-grey `#0a0b14` / `#020204` in 3D and the mint `hsl(168, 70%, 50%)` fallback in 2D) with the track's computed average color when rendering on a black background. This makes the atmospheric glow and 3D background gradient adapt dynamically to the music's visual key.

## Out of scope

- Changing the default `average` background mode color computation.
- Adding complex multi-stop radial atmosphere blending to the SVG exporter (which does not draw atmosphere glows by design).

## Approach

1. **Enhance `I3DRenderer` with `setBackground`**: Add `setBackground(backgroundColor: string, atmosphereColors?: string[]): void` to the `I3DRenderer` interface.
2. **Implement in `ThreeDRenderer` with Caching & Disposal**:
   - Store cache variables `currentBgColor: string | null` and `currentAtmosphereColors: string[] | null`. If the incoming background color and atmosphere colors match the cached values, return early to avoid unnecessary texture re-creations and GPU uploads.
   - **Explicit hue merging across all visible tracks**: when `atmosphereColors` is non-empty, compute the circular average across *all* track accents (one merged hue), producing a single top color. This intentionally differs from the 2D `drawAtmosphere` path, which renders up to four distinct per-track radial gradients. The 3D background uses one gradient; the 2D path keeps its multi-radial design. This asymmetry is intentional (2D atmosphere = localized glows; 3D background = global key).
   - If `atmosphereColors` are provided and non-empty:
     - Compute the circular average of HSL hues (using `Math.atan2` for correct angle wrapping).
     - Generate a linear gradient canvas texture transitioning from a dark version of the averaged hue (e.g. `hsl(avgHue, 25%, 8%)`) down to the `backgroundColor` (e.g. `#000000`).
     - Dispose of the old `this.scene.background` texture if it is an instance of `THREE.Texture` to prevent GPU memory leaks, then assign the new texture.
   - If `atmosphereColors` are empty or undefined, derive a two-stop vertical gradient from `backgroundColor` itself (e.g. top stop = `backgroundColor`, bottom stop = `hsl(0, 0%, 1%)` for pure-black fallback, or a darkened variant of the same hue), and assign a `CanvasTexture` — **do not collapse to a flat `THREE.Color`**. This preserves the existing `makeGradientBackground()` gradient aesthetic in `'average'` mode (where `backgroundColor` is `getAverageScoreBackground(...)` returning a flat `hsl(hue, 32%, 9%)`). Dispose the old texture with the same `instanceof THREE.Texture` guard.
   - Update `this.scene.fog` by guarding with `this.scene.fog instanceof THREE.FogExp2` (or the `isFogExp2` flag) — **not** `'color' in this.scene.fog`, which does not discriminate `Fog` from `FogExp2`. Then call `.color.set(backgroundColor)`. `color.set()` is safe on either subclass, so the explicit `FogExp2` check keeps the guard meaningful.
3. **Connect in `app.ts`**:
   - Call `renderer.setBackground(this.backgroundColor(), this.atmosphereColors())` inside `render3D()` (after `ensureThreeRenderer()`).
   - Call `setBackground` in `downloadPng3D()` **after** the existing `if (!renderer) return;` null guard — **do not** switch to `ensureThreeRenderer()` or the call may throw when the renderer was never mounted.
4. **Fix 2D Fading Color in `canvasRenderer.ts`**:
   - Implement a `getTransparentColor(color: string): string` helper to parse HSL/hex strings and return an alpha-zero variant (e.g. `rgba(0, 0, 0, 0)` for black backgrounds).
   - Use this helper for the gradient's stop-1 transparent fallback in `drawAtmosphere` to prevent dark-blue fringes (today's `rgba(9, 17, 31, 0)`) on black canvases.
5. **Add tests**: Add unit tests mock-testing `CanvasRenderer` rendering properties and checking background configuration behavior.

### Alternatives considered

| Option | Why not chosen |
|---|---|
| Hardcode dynamic highlight only in 3D | Fails to synchronize 2D and 3D backgrounds and doesn't resolve the canvas blending fringe in 2D. |
| Pass background variables via `RenderedGeometry3D` | Background color is a rendering option (like `showLegend` or `viewport`), not a layout configuration; keeping it in the renderer options interface is cleaner. |

## Proposed file changes

```
src/renderers/three/I3DRenderer.ts     — add setBackground definition
src/renderers/three/ThreeDRenderer.ts  — implement setBackground with color caching, HSL circular averaging, WebGL texture disposal, and 2-stop gradient fallback (never flat) for empty accent lists
src/renderers/canvas/canvasRenderer.ts — resolve transparent color fade blending fringe in drawAtmosphere using getTransparentColor helper
src/ui/app.ts                          — route current background and atmosphere colors to ThreeDRenderer in render3D and PNG capture (setBackground after the existing null guard in downloadPng3D)
tests/viewportRenderers.test.ts        — add unit tests asserting transparent gradient stop color updates based on options.backgroundColor
```

## Phases & checklist

### Phase 1: Renderer contracts and Canvas 2D fix

- [x] Add `setBackground` to `I3DRenderer` interface.
- [x] Implement `setBackground` in `ThreeDRenderer` with:
  - Cache checks for early return
  - Safe circular HSL averaging (handling zero count checks), merging hues across all visible tracks into one top color
  - Explicit texture disposal (`instanceof THREE.Texture` check)
  - 2-stop gradient fallback (never flat `THREE.Color`) for empty/undefined accent lists, preserving the existing gradient aesthetic in `'average'` mode
  - `scene.fog.color.set(...)` guarded with `FogExp2` instanceof check (not `'color' in`), since `scene.fog` is always `FogExp2` from `mount()`
- [x] Implement `getTransparentColor` helper and fix the transparent fade color in `canvasRenderer.ts` to prevent grey/blue fringes when fading to a black background.

### Phase 2: App wiring and Verification

- [x] Call `renderer.setBackground` in `app.ts`'s `render3D()` (after `ensureThreeRenderer()`) and `downloadPng3D()` (after the existing `if (!renderer) return;` null guard — do not switch to `ensureThreeRenderer()`).
- [x] Write unit tests in `tests/viewportRenderers.test.ts` verifying that `CanvasRenderer` translates background options into the correct transparent gradient stops using mocked rendering contexts.
- [x] Run `npm run validate` to ensure TypeScript compilation, testing, and production build checks pass.

> **Cache invalidation note**: `setScore` (new MIDI load) does not dispose `threeRenderer`; the shared 3D instance is reused for page lifetime. `setBackground`'s cache-miss naturally rebuilds the texture on the next `render3D()` after a MIDI swap, so no explicit cache-bust call is needed — but note that identical new scores coincidentally yielding the same HSL averages will short-circuit the cache, which is correct behavior.

## Verification

How will we know this is done and correct?

- [x] When using a black background, the 3D scene background displays a subtle vertical gradient tinted by a single dominant hue (computed across all visible tracks) rather than one hue per track, so only ONE accent color is ever shown.
- [x] The accent changes visibly between tracks with distinct character, because the hue is the duration×velocity-weighted circular mean (so sustained or loudly-struck notes dominate) rather than an unweighted centroid that collapses toward a common value when notes span the full hue circle.
- [x] The accent strength stays subtle: 2D atmosphere alpha is 12% per radial gradient (one centered glow for the single accent), and the 3D top color is `hsl(avgHue, 25%, 8%)`, so notes remain legible and the glow is atmospheric rather than vibrant.
- [x] In `'average'` mode, the 3D background remains a vertical gradient (not a flat solid color), preserving the existing gradient aesthetic derived from `getAverageScoreBackground`.
- [x] In 3D mode, the fog matches the background color so far-away notes fade cleanly.
- [x] No WebGL textures or resources are leaked when repeatedly toggling background mode in a 3D variation or loading new MIDI files in 3D mode (old `THREE.CanvasTexture` is disposed before assigning a new one; cache short-circuits identical input).

## Revision note (2026-07-25)

The first implementation shipped per-track circular-mean accents (multiple
competing gradient stops in 3D and 4 radial gradients in 2D), bumped the 2D
atmosphere opacity to 22%, and used 75%/15% saturation/lightness in 3D. User
feedback: the accent often did not change between tracks, multiple accent
colors were visible at once, and the glow was too strong. The revised
implementation:
1. Adds `getDominantScoreAccent` (single accent across all visible tracks) and
   routes `app.ts` `atmosphereColors()` to a one-element array.
2. Reverts 2D `drawAtmosphere` to 12% opacity with a single centered radial
   glow for the single-accent case.
3. Reverts 3D `setBackground` to one circularly-merged hue at the plan's
   recommended 25%/8% saturation/lightness, dropping the multi-stop path.

A second revision (same day) corrected the weighting: both
`getDominantScoreAccent` and `getAverageScoreBackground` now use a
duration×velocity-weighted circular mean (shared `weightedHueAccumulator`
helper), mirroring the "Weight → velocity × sounding overlap" coloring already
used by the tonal-time-lines band colors. The original circular mean counted
notes one-to-one, ignoring that a four-beat sustained note or a fortissimo
strike should weigh more than a grace note. The weighted mean makes the accent
(and the 'average' background mode) reflect the perceived average color over
the course of the piece.


## Open questions

- [x] What is the optimal saturation/lightness for the 3D highlight top color to ensure notes remain clearly legible? (Recommend `25%` saturation and `8%` lightness, tune on dense compositions).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Texture leakage when recreating background | medium | medium | Ensure we explicitly call `dispose()` on the old `THREE.CanvasTexture` before assigning a new one. Verify in a 3D variation, not pure 2D (the 3D path is skipped in 2D rendering). |
| Gradient rendering performance cost | low | low | Introduce color parameters caching in `ThreeDRenderer` so canvas gradient texture generation only occurs on changes, not per frame. Playback ticks call `stepPlayhead()` directly and bypass `setBackground`, so caching mainly defends against paused re-renders (scrubbing, voice-filter toggles, control changes). |
