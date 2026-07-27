# Plan: Randomize visual mode and initial loaded bundled MIDI at launch

Last reviewed: 2026-07-27 (updated)
Date: 2026-07-27
Author: devin
Status: complete (2026-07-27)
Linked issue/PR: n/a

## Goal

Enhance the first-launch experience by randomly selecting both a visual mode (2D or 3D) and a bundled MIDI file, showcasing the variety of visualization modes and demo scores available in the application. This provides users with immediate visual variety and encourages exploration of different modes and scores.

**Scope note**: This is UI-layer randomization only. It does not modify the MIDI parser, score-to-geometry mapper, or renderers, and thus does not require `DESIGN.md` or `ARCHITECTURE.md` updates or determinism-regression tests in `src/core`/renderers per `AGENTS.md` rules 1-3.

## Out of scope

- Randomizing any other configuration parameters (origin mode, color schemes, etc.).
- Changing the user's manual selection after launch.
- Persisting random selections across sessions.
- Modifying the demo MIDI file selection dropdown behavior beyond initial value sync.
- The `source-midi-select` dropdown (external MIDI sites) is a completely separate control and is unaffected by randomization.

## Approach

Implement randomization logic in a new module `src/ui/launchRandomizer.ts` and call it in the app constructor.

- **Variations list**: Define the `VARIATIONS` array containing all 10 visual variation string literals (both 2D and 3D) inside `src/ui/launchRandomizer.ts`. To prevent drift when new variations are added to `types.ts`, add a test assertion that `VARIATIONS.length === 10`:
  ```typescript
  import { Variation } from '../core/types.js';
  export const VARIATIONS: readonly Variation[] = [
    'lines', 'circles', 'vertical_tone', 'tonal_time_lines', 'polar_fan',
    '3d_lines', '3d_note_halos', '3d_note_spheres', '3d_piano_roll', '3d_polar_fan'
  ] as const;
  ```
  This keeps `src/core` completely untouched, but ensures compile-time type-safety.
- **Demo MIDI catalog**: Dynamically read the catalog options from the DOM's `demo-midi-select` at runtime. To avoid iterating over parent `<optgroup>` elements, we read from the `demoSelect.options` collection, which is a flat list of `HTMLOptionElement`s.
- **Empty Catalog Fallback**: If the DOM select has no options (e.g. loading issue), we skip randomization entirely and boot directly into the generative study in `lines` mode, preventing `pickRandom` from throwing on an empty array. This is a defensive fallback for a broken build state.
- **3D Cold-Start & Performance**: Include 3D variations in the initial randomization pool. We lazy-load the Three.js bundle as before. To ensure the experience is smooth, we set a target budget of `<250ms` for the time from constructor start until the first rendered 3D frame (resolving the dynamic import and initial WebGL render) on local/cached runs.
- **Graceful 3D Fallback**: If dynamic import of Three.js or WebGL context creation fails at launch (or any other time), the application will catch the exception in `render3D()`. If the user is still on a 3D variation when the failure occurs, it will display a status message, update `currentConfig.variation = 'lines'`, call `updateCanvasMode()`, update the `variation-select` dropdown value, and re-render.
- **Fallback-on-failure policy for MIDI**: If fetching the randomly selected MIDI file fails (e.g. network issue), the app will remain on the generative study and display a status message, using the existing error-handling path in `loadUrl()`. No retry is attempted.
- **First-Paint Behavior (Generative Study)**: Since fetching the randomly selected MIDI file is asynchronous and happens via `loadUrl` after the initial render, the application will perform its first synchronous render on the default generative study score `generateDemoScore()` using the randomized visual mode. If a 3D variation is chosen, the user will briefly see the generative study in 3D (once loaded) until the MIDI file is fetched, at which point the canvas will update with the chosen MIDI. This is expected and acceptable.
- **Launch vs. refresh semantics**: The page will re-randomize on every page load/refresh. We explicitly choose *not* to use `sessionStorage` or any other stickiness mechanism to preserve state across reloads. This keeps the implementation simple, zero-dependency, and ensures that a user refreshing the page gets to see a new random combination immediately, showcasing the app's diversity.
- **Programmatic select values**: Programmatically setting `.value` on select dropdowns does NOT fire their `change` event listeners, which prevents double-rendering.

### Constructor sequencing sketch

The constructor body will follow this exact sequence:

```typescript
import { VARIATIONS, pickRandom } from './launchRandomizer.js';

constructor() {
  this.canvasRenderer = new CanvasRenderer(this.element<HTMLCanvasElement>('visualizer-canvas'));
  this.viewportController = new ViewportController();
  new ViewportGestures(
    this.element<HTMLCanvasElement>('visualizer-canvas'),
    this.viewportController,
    PREVIEW_SIZE,
    () => this.render()
  );
  this.voicePlayback = new Map(this.currentScore.tracks.map((track, index) => [track.channel, defaultVoiceSettings(index)]));
  this.voiceRouter.syncFromVoicePlayback(this.voicePlayback);
  
  // 1. Bind events first so listener registration is complete
  this.bindEvents();

  // 2. Retrieve DOM options to form the demo catalog
  const demoSelect = this.element<HTMLSelectElement>('demo-midi-select');
  let initialMidiUrl = '';
  let initialMidiTitle = '';
  let randomVariation: Variation = 'lines';
  
  if (demoSelect.options.length > 0) {
    const demoOptions = Array.from(demoSelect.options).map(opt => ({
      url: opt.value,
      title: opt.text
    }));
    // 3. Randomly select visual mode and MIDI file
    randomVariation = pickRandom(VARIATIONS, Math.random);
    const randomDemo = pickRandom(demoOptions, Math.random);
    initialMidiUrl = randomDemo.url;
    initialMidiTitle = randomDemo.title;
    
    // 4. Sync demo MIDI select value programmatically (does not fire listener)
    demoSelect.value = initialMidiUrl;
  }
  // else: empty catalog fallback — stay on generative study in 'lines' mode
  
  // 5. Apply variation to internal state
  this.currentConfig.variation = randomVariation;
  
  // 6. Sync variation select value programmatically (does not fire listener)
  this.element<HTMLSelectElement>('variation-select').value = randomVariation;
  
  // 7. Update canvas mode synchronously before first paint
  this.updateCanvasMode();

  // 8. Update UI labels and render generative study synchronously
  this.updateScoreUi();
  this.render();

  // 9. Load randomized MIDI asynchronously (if catalog was non-empty)
  if (initialMidiUrl) {
    void this.loadUrl(initialMidiUrl, initialMidiTitle);
  }
  void this.refreshCacheStatus();
  this.maybeShowLibraryPrompt();
}
```

### Alternatives considered

| Option | Why not chosen |
|---|---|
| User-configurable randomization settings | Adds complexity for a simple enhancement; users can manually select modes/files |
| Weighted randomization favoring certain modes | No clear usage data to justify weighting; uniform sampling is fairer |
| Session-sticky randomization (same random choice across refreshes) | Not chosen because we want the user to easily discover different modes by simply refreshing the page; re-randomizing on every load showcases the visual variety much better and avoids `sessionStorage` persistence complexity |
| Server-side randomization | Unnecessary client-side logic; keeps implementation simple and local |
| Excluding 3D modes from initial randomization | Considered to avoid Three.js lazy-load delay, but decided against because excluding them hides half of the app's visualization features. The lazy-load overhead is acceptable given our graceful 2D fallback path. |

## Proposed file changes

```
src/ui/launchRandomizer.ts — New module for randomization logic and VARIATIONS array
src/ui/app.ts — Import randomizer, retrieve DOM options, apply randomization in constructor, remove DEFAULT_DEMO_URL/DEFAULT_DEMO_TITLE, and implement graceful 3D fallback in render3D()
index.html — Remove `selected` attribute from the Bach <option> to prevent flash of old default
tests/launchRandomizer.test.ts — Automated tests validating pickRandom, VARIATIONS conformance, VARIATIONS.length === 10, and DOM options querying
```

## Phases & checklist

### Task 1: Phase 1: Add randomization utilities and data structures

- [x] Create `src/ui/launchRandomizer.ts`:
  - Define `VARIATIONS` array containing all 10 `Variation` options.
  - Implement `pickRandom<T>(arr: readonly T[], rand: () => number): T` helper. Throw an error if the array is empty.
- [x] Create `tests/launchRandomizer.test.ts`:
  - Unit test `pickRandom` (normal arrays, single-item, empty array throws).
  - Verify all items in `VARIATIONS` are valid elements of the `Variation` union type.
  - Assert `VARIATIONS.length === 10` to catch drift when new variations are added to `types.ts`.
  - Mock a select element and test that options are correctly read and randomized.

### Task 2: Phase 2: Integrate randomization into app initialization

- [ ] Modify app constructor to follow the sequencing sketch: retrieve DOM options, select random states, apply and sync select values, call `updateCanvasMode()`, `updateScoreUi()`, `render()`, and load MIDI.
- [ ] Remove `DEFAULT_DEMO_URL` and `DEFAULT_DEMO_TITLE` constants from `app.ts` (they are replaced by the randomizer).
- [ ] Remove the `selected` attribute from the Bach `<option>` in `index.html` (line 19) to prevent a brief flash of the old default before the randomizer syncs the dropdown.
- [ ] Update `render3D()` in `src/ui/app.ts` to implement the graceful fallback: on catch, if `currentConfig.variation` is still a 3D variation, log the error, display status, set variation to `'lines'`, update canvas mode, update `variation-select.value` element, and re-render.

#### Phase 3: Verification and edge cases

- [ ] Verify that manual dropdown selections still function correctly post-randomization.
- [ ] Verify 3D dynamic imports load smoothly and fall back to 2D `lines` mode if dynamic import or WebGL fails.
- [ ] Verify that dropdown UI remains fully synchronized.

## Verification

How will we know this is done and correct?

- [ ] Automated tests: `npm test` passes with full coverage for `tests/launchRandomizer.test.ts`.
- [ ] Manual testing: Refresh page 10+ times and observe different initial modes and MIDI files (including 3D modes rendering correctly).
- [ ] Dropdowns are correctly synced to randomized values on load.
- [ ] Canvas visibility is correct (corresponding canvas is visible, controls match selected mode).
- [ ] No console errors or warnings related to randomization.

## Completion checklist

When all phases and verification are done:

- [ ] Update plan `Status:` to `complete` with completion date.
- [ ] Move plan to `plans/archive/`.
- [ ] Add entry to `CHANGELOG.md` (Unreleased section) with SemVer impact: **MINOR**.
  - *Rationale for MINOR*: This is a non-breaking behavior change that changes the initial default state on page load. Existing URLs and query parameters are not broken, and the user retains full manual control to select any score or visual mode. Thus, it does not constitute a breaking change (MAJOR) but is a user-visible enhancement.
- [ ] Remove the completed item from `dev-docs/TO_DO.md`.

## Open questions

*None. All decisions have been resolved.*

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 3D mode randomization causes slower initial load due to Three.js dynamic import | medium | low | Mitigated by lazy-loading chunks. App starts immediately and handles asynchronous load smoothly, falling back to 2D `lines` mode on WebGL or import failure. |
| User confusion when initial state changes on refresh | low | low | Documented behavior; users can still manually select preferred mode/file. Re-randomization on refresh is intentional for a SPA demo showcase. |
| Random selection of same mode/file repeatedly | low | low | True randomness allows this; it is expected behavior and not a bug. |
| `app.ts` exceeds file-size cap (currently 716 lines, hard limit 800) | low | low | Place randomization helpers in new `src/ui/launchRandomizer.ts` module to keep `app.ts` well below the 800-line hard limit. |
