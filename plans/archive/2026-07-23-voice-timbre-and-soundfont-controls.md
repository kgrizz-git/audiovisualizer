# SoundFont & Voice Timbre Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** completed (2026-07-23)

**Goal:** Provide dynamic, engine-aware per-track voice controls (SoundFont GM instrument selector when in SoundFont/sample mode vs synth waveform selector in Oscillator mode), persistent browser caching for SoundFonts, and clear loading/fallback status reporting.

**Architecture:** Update `SoundfontPatchLoader` to persist CDN-fetched scripts in browser `CacheStorage` (`soundfonts-v1`); add per-channel patch-status tracking to `SoundfontPlayer` and make it honor per-channel program overrides; add per-channel program reassignment to `VoiceRouter`; and update `AudioVisualizerApp` in `src/ui/app.ts` to dynamically adapt the sidebar voice controls to the active engine with patch load status badges.

**Tech Stack:** TypeScript, Web Audio API, CacheStorage API, Vitest.

## Global Constraints

- Keep the MIDI parser, score mapper, and soundfont patch loader deterministic and side-effect free (network/CacheStorage access in the loader is the one allowed side effect, and must be guarded so it is a no-op when the API is unavailable — e.g. in tests/Node).
- All new code paths must degrade gracefully when `caches`, `fetch`, or `AudioContext` are undefined (the existing code already assumes this — see `createMockAudioContext` in `soundfontPlayer.ts` and the `typeof AudioContext !== 'undefined'` guard).
- Run `npm run validate` before claiming completion.

## Key facts verified against the current source (read before implementing)

- `SoundfontPatchLoader.fetchScript` (`src/audio/soundfont/soundfontPatchLoader.ts:67`) is **private** and tries `localSoundfontUrl` then `cdnSoundfontUrl`. `loadPatch` memoizes results in an in-memory `Map` keyed `` `${bank}:${slug}` ``.
- `SoundfontPlayer.start` (`src/audio/soundfont/soundfontPlayer.ts:52`) groups tracks into unique patches keyed by `` `${bank}:${track.program}` `` **using `track.program` directly** (lines 80–87). It does **not** currently go through `router.resolveTrackSettings(...).program`. This must change (Task 3) or program overrides will be ignored during playback.
- `SoundfontPlayer` computes `readyChannels` and `missChannels` locally inside `start()` but never stores them; there is no status accessor today (Task 2 adds one).
- `VoiceRouter.resolveTrackSettings` (`src/audio/soundfont/voiceRouter.ts:30`) returns `program: track.program`. There is no program override map today (added in Task 3).
- `app.ts` already registers `change` listeners on `playback-engine-select` (line 88) and `playback-bank-select` (line 91) that call `voiceRouter.setDefaults(...)`. Do **not** add second listeners — extend these existing ones.
- `updateScoreUi()` (`src/ui/app.ts:193`) rebuilds `#audio-voice-options`. The per-track waveform `<select>` is hardcoded to `['sine','triangle','sawtooth','square']` (line 212). Timbre changes call `this.voiceRouter.setMix(track.channel, settings)`.
- GM instrument names come from the exported const `GM_INSTRUMENT_SLUGS` and helper `getInstrumentSlug(program)` in `src/audio/soundfont/gmInstrumentSlugs.ts`. Slugs are `snake_case` (128 entries, program 0–127).
- `TrackScore` (`src/core/types.ts:22`) fields: `name`, `channel`, `program`, `instrumentName`, `notes`, optional `sustainEvents`. There is **no** `sustainEvents` requirement in test fixtures but existing tests include `sustainEvents: []`.

---

### Task 1: Persistent CacheStorage in SoundfontPatchLoader

**Files:**
- Modify: `src/audio/soundfont/soundfontPatchLoader.ts`
- Test: `tests/soundfontPatchLoader.test.ts`

**Interfaces:**
- Consumes: `localSoundfontUrl`, `cdnSoundfontUrl`, `parseMidiJsSoundfontScript`
- Produces: `SoundfontPatchLoader.fetchScript` reads from and writes to `caches.open('soundfonts-v1')` when the CacheStorage API is available; behavior is unchanged when it is not.

**Design notes:**
- Use a **stable, absolute cache key** so the browser's `Cache.put`/`Cache.match` scheme requirement (http/https only) is always satisfied and the key does not depend on which source (local vs CDN) served the script. Use `cdnSoundfontUrl(bank, slug)` as the cache key string for both read and write, regardless of which URL actually returned the bytes.
- Guard every CacheStorage access with `typeof caches !== 'undefined'` **and** a `try/catch` (private mode / storage errors must not break loading).

- [x] **Step 1: Write failing test for CacheStorage read + write**

Add to `tests/soundfontPatchLoader.test.ts`. Stub both `fetch` and `caches`. Example:

```ts
it('reads a cached script without fetching', async () => {
  const scriptText = readFileSync(
    new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
    'utf8',
  );
  const cacheKey = cdnSoundfontUrl('FluidR3_GM', 'acoustic_grand_piano');
  const store = new Map<string, string>([[cacheKey, scriptText]]);
  const cache = {
    match: vi.fn(async (k: string) => (store.has(k) ? { text: async () => store.get(k)! } : undefined)),
    put: vi.fn(async (k: string, resp: Response) => { store.set(k, await resp.text()); }),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  const fetchMock = vi.fn(async () => { throw new Error('network should not be hit'); });
  vi.stubGlobal('fetch', fetchMock);

  const loader = new SoundfontPatchLoader(async () => ({ duration: 0.1 } as AudioBuffer));
  const patch = await loader.loadPatch('FluidR3_GM', 0);

  expect(patch).not.toBeNull();
  expect(cache.match).toHaveBeenCalledWith(cacheKey);
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('writes a freshly fetched script into the cache', async () => {
  const scriptText = readFileSync(
    new URL('./fixtures/midi-js-acoustic_grand_piano-snippet.js', import.meta.url),
    'utf8',
  );
  const cacheKey = cdnSoundfontUrl('FluidR3_GM', 'acoustic_grand_piano');
  const store = new Map<string, string>();
  const cache = {
    match: vi.fn(async (k: string) => (store.has(k) ? { text: async () => store.get(k)! } : undefined)),
    put: vi.fn(async (k: string, resp: Response) => { store.set(k, await resp.text()); }),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  // local 404, CDN ok
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    String(url).startsWith('/soundfonts/')
      ? ({ ok: false, status: 404 } as Response)
      : ({ ok: true, text: async () => scriptText } as Response)));

  const loader = new SoundfontPatchLoader(async () => ({ duration: 0.1 } as AudioBuffer));
  await loader.loadPatch('FluidR3_GM', 0);

  expect(cache.put).toHaveBeenCalledWith(cacheKey, expect.anything());
  expect(store.get(cacheKey)).toBe(scriptText);
  vi.unstubAllGlobals();
});
```

Ensure the existing tests that do **not** stub `caches` still pass — the guard makes CacheStorage optional.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/soundfontPatchLoader.test.ts`

- [x] **Step 3: Implement CacheStorage in `fetchScript`**

Replace `fetchScript` in `src/audio/soundfont/soundfontPatchLoader.ts`:

```ts
  private async fetchScript(bank: SoundbankPreset, slug: string): Promise<string | null> {
    const cacheKey = cdnSoundfontUrl(bank, slug); // stable https key for both read + write
    const cache = await this.openCache();

    if (cache) {
      try {
        const match = await cache.match(cacheKey);
        if (match) return await match.text();
      } catch {
        /* ignore cache read error */
      }
    }

    for (const url of [localSoundfontUrl(bank, slug), cdnSoundfontUrl(bank, slug)]) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const text = await response.text();
          if (cache) {
            try {
              await cache.put(cacheKey, new Response(text));
            } catch {
              /* ignore cache write error */
            }
          }
          return text;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  }

  private async openCache(): Promise<Cache | null> {
    if (typeof caches === 'undefined') return null;
    try {
      return await caches.open('soundfonts-v1');
    } catch {
      return null;
    }
  }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/soundfontPatchLoader.test.ts`

- [x] **Step 5: Commit Task 1**

```bash
git add src/audio/soundfont/soundfontPatchLoader.ts tests/soundfontPatchLoader.test.ts
git commit -m "feat(soundfont): persist fetched patch scripts in CacheStorage"
```

---

### Task 2: Per-Channel Patch Status Tracking in SoundfontPlayer

**Files:**
- Modify: `src/audio/soundfont/soundfontPlayer.ts`
- Test: `tests/soundfontPlayer.test.ts`

**Interfaces:**
- Produces: `SoundfontPlayer.getStatusMap(): Map<number, PatchStatus>` where `type PatchStatus = 'loading' | 'loaded' | 'fallback'`. Add `export type PatchStatus = ...` to `soundfontTypes.ts` and re-export/import as needed.

**Design notes:**
- Add `private status = new Map<number, PatchStatus>();`.
- In `start()`: after computing the `audible` set, for the **sample** engine set every audible channel to `'loading'` before awaiting `loadPatch`. After loads resolve (and after the `this.generation !== localGen` early-return guard), set `'loaded'` for channels in `readyChannels` and `'fallback'` for channels in `missChannels`.
- For the **oscillator** engine branch (early return at lines 70–73) leave the status map empty (status badges are only meaningful in sample mode).
- Clear the map at the start of `start()` and in `stop()` so stale status from a previous score/session is not reported.
- `getStatusMap()` returns a copy: `new Map(this.status)`.

- [x] **Step 1: Write failing test for status reporting**

Add to `tests/soundfontPlayer.test.ts` (reuse the existing `demoScore()` helper and the mock-loader pattern already in that file):

```ts
it('reports loaded vs fallback status per channel', async () => {
  const fakeBuffer = {} as AudioBuffer;
  const loader = {
    loadPatch: vi.fn(async (_bank: string, program: number) =>
      program === 0
        ? { bank: 'FluidR3_GM', program: 0, slug: 'acoustic_grand_piano', buffers: { C4: fakeBuffer } }
        : null),
  };
  const player = new SoundfontPlayer({
    loader: loader as never,
    createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
  });
  const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
  await player.start(demoScore(), 0, { router });

  const status = player.getStatusMap();
  expect(status.get(0)).toBe('loaded');   // program 0 patch resolved
  expect(status.get(1)).toBe('fallback'); // program 32 patch null
});

it('clears status on stop', async () => {
  const player = new SoundfontPlayer({
    loader: { loadPatch: vi.fn(async () => null) } as never,
    createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
  });
  const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
  await player.start(demoScore(), 0, { router });
  player.stop();
  expect(player.getStatusMap().size).toBe(0);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/soundfontPlayer.test.ts`

- [x] **Step 3: Implement status tracking**

1. In `soundfontTypes.ts` add: `export type PatchStatus = 'loading' | 'loaded' | 'fallback';`
2. In `soundfontPlayer.ts` import `PatchStatus`, add the `status` field, clear it in `stop()` and at the top of `start()`, set `'loading'` before the `loadPatch` `Promise.all`, and set `'loaded'`/`'fallback'` from `readyChannels`/`missChannels` after the generation guard. Add `getStatusMap()`.
3. Note the oscillator branch returns early and leaves `status` empty — that is intentional.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/soundfontPlayer.test.ts`

- [x] **Step 5: Commit Task 2**

```bash
git add src/audio/soundfont/soundfontPlayer.ts src/audio/soundfont/soundfontTypes.ts tests/soundfontPlayer.test.ts
git commit -m "feat(soundfont): track per-channel patch load status"
```

---

### Task 3: Per-Channel Program Reassignment (VoiceRouter + SoundfontPlayer)

> **Critical:** Adding `setProgram` to `VoiceRouter` alone is not enough. `SoundfontPlayer.start()` currently groups patches by `track.program` (lines 80–87), so it would ignore any override. Both changes below are required for instrument reassignment to actually affect playback.

**Files:**
- Modify: `src/audio/soundfont/voiceRouter.ts`
- Modify: `src/audio/soundfont/soundfontPlayer.ts`
- Test: `tests/voiceRouter.test.ts`
- Test: `tests/soundfontPlayer.test.ts`

**Interfaces:**
- Produces: `VoiceRouter.setProgram(channel: number, program: number): void`, `VoiceRouter.getProgram(channel: number): number | undefined`, and `VoiceRouter.clearPrograms(): void` (used by the UI when a new score is loaded so stale overrides do not leak between files).
- `VoiceRouter.resolveTrackSettings(...).program` returns the override when present, else `track.program`.

- [x] **Step 1: Write failing tests**

In `tests/voiceRouter.test.ts` (a `track(channel, program)` helper already exists in that file):

```ts
it('allows overriding a track GM program', () => {
  const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
  router.setProgram(0, 40); // violin
  expect(router.resolveTrackSettings(track(0, 0)).program).toBe(40);
  expect(router.getProgram(0)).toBe(40);
});

it('clearPrograms drops overrides', () => {
  const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
  router.setProgram(0, 40);
  router.clearPrograms();
  expect(router.resolveTrackSettings(track(0, 0)).program).toBe(0);
});
```

In `tests/soundfontPlayer.test.ts`, verify the player loads the overridden program:

```ts
it('loads the overridden program, not the track program', async () => {
  const loadPatch = vi.fn(async () => null);
  const player = new SoundfontPlayer({
    loader: { loadPatch } as never,
    createFallback: () => ({ start: vi.fn(async () => {}), stop: vi.fn() }) as never,
  });
  const router = new VoiceRouter({ engine: 'sample', soundbank: 'FluidR3_GM' });
  router.setProgram(0, 40); // track 0's stored program is 0
  await player.start(demoScore(), 0, { router });
  const programs = loadPatch.mock.calls.map((c) => c[1]);
  expect(programs).toContain(40);
  expect(programs).not.toContain(0);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/voiceRouter.test.ts tests/soundfontPlayer.test.ts`

- [x] **Step 3a: Implement `setProgram` in VoiceRouter**

In `src/audio/soundfont/voiceRouter.ts`:
- Add `private programs = new Map<number, number>();`
- Add methods:
  ```ts
  setProgram(channel: number, program: number): void { this.programs.set(channel, program); }
  getProgram(channel: number): number | undefined { return this.programs.get(channel); }
  clearPrograms(): void { this.programs.clear(); }
  ```
- In `resolveTrackSettings`, change the `program` field to:
  ```ts
  program: this.programs.get(track.channel) ?? track.program,
  ```

- [x] **Step 3b: Make SoundfontPlayer honor the resolved program**

In `src/audio/soundfont/soundfontPlayer.ts`, in the unique-patch grouping loop (currently lines 80–87), replace the use of `track.program` with the router-resolved program:

```ts
    const unique = new Map<string, { bank: SoundbankPreset; program: number; channels: number[] }>();
    for (const track of audible) {
      const bank = defaults.soundbank;
      const program = opts.router.resolveTrackSettings(track).program;
      const key = `${bank}:${program}`;
      const entry = unique.get(key) ?? { bank, program, channels: [] };
      entry.channels.push(track.channel);
      unique.set(key, entry);
    }
```

This keeps `patchByChannel` correct because the ready/miss bookkeeping is still keyed by `track.channel`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/voiceRouter.test.ts tests/soundfontPlayer.test.ts`

- [x] **Step 5: Commit Task 3**

```bash
git add src/audio/soundfont/voiceRouter.ts src/audio/soundfont/soundfontPlayer.ts tests/voiceRouter.test.ts tests/soundfontPlayer.test.ts
git commit -m "feat(audio): honor per-channel GM program overrides in playback"
```

---

### Task 4: Dynamic Engine-Aware Voice Controls & Status Badges in app.ts

**Files:**
- Modify: `src/ui/app.ts`
- (No `index.html` change needed — rows and badges are created dynamically inside `#audio-voice-options`.)

**Interfaces:**
- Consumes: `VoiceRouter` (`getDefaults`, `setProgram`, `getProgram`, `resolveTrackSettings`, `setMix`, `clearPrograms`), `SoundfontPlayer.getStatusMap`, `GM_INSTRUMENT_SLUGS`/`getInstrumentSlug`.
- Produces: per-voice control that switches between a GM instrument `<select>` (sample mode) and a synth waveform `<select>` (oscillator mode), plus a status badge per row in sample mode.

**Behavior contract (state the timing explicitly for the implementer):**
- Instrument/waveform selection and engine/bank changes take effect on the **next Play**, not instantly mid-note (the player reads the router at `start()`). Badges reflect the last `start()`.
- Before the first playback of a score, sample-mode badges show a neutral "not loaded" state (empty string or `—`); after `start()` resolves they show `✓ Loaded` / `⚡ Synth Fallback`; `⏳ Loading…` is shown for the brief window while `start()` is in flight (see Step 3).

- [x] **Step 1: Add a GM label helper and refactor the per-voice row builder**

In `src/ui/app.ts`:
1. Import `GM_INSTRUMENT_SLUGS` (and keep `getInstrumentSlug` if useful) from `../audio/soundfont/gmInstrumentSlugs.js`, and `PatchStatus` from `../audio/soundfont/soundfontTypes.js`.
2. Add a small helper to prettify a slug into a display name, e.g.
   ```ts
   private gmLabel(program: number): string {
     const slug = GM_INSTRUMENT_SLUGS[program] ?? 'acoustic_grand_piano';
     return `${program} · ${slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`;
   }
   ```

- [x] **Step 2: Make `updateScoreUi()` render the engine-appropriate control**

Rework the per-track loop in `updateScoreUi()` (currently `src/ui/app.ts:206–231`). Read `const engine = this.voiceRouter.getDefaults().engine;` once before the loop. For each track:

- **Sample mode (`engine === 'sample'`):**
  - Build a `<select>` populated from `GM_INSTRUMENT_SLUGS` (128 options, `value = String(index)`, label = `this.gmLabel(index)`), selecting `this.voiceRouter.resolveTrackSettings(track).program`.
  - On `change`: `this.voiceRouter.setProgram(track.channel, Number(select.value));` then refresh the row's badge to the neutral "pending" state (it will resolve on next Play). Do **not** call `setMix` here — program overrides are separate from mix.
  - Create a badge `<span class="patch-badge">` and set its text via a shared `this.applyBadge(span, this.soundfontPlayer?.getStatusMap().get(track.channel))` helper (see Step 3). Append the badge to the row.
- **Oscillator mode (`engine === 'oscillator'`):**
  - Keep the existing waveform `<select>` behavior (`['sine','triangle','sawtooth','square']`, updates `settings.timbre` then `this.voiceRouter.setMix(track.channel, settings)`).
  - No badge.
- The `gain`, `mute`, and `solo` controls are unchanged in both modes.

Add a badge helper:
```ts
private applyBadge(span: HTMLElement, status: PatchStatus | undefined): void {
  const map: Record<PatchStatus, string> = {
    loading: '⏳ Loading…',
    loaded: '✓ Loaded',
    fallback: '⚡ Synth Fallback',
  };
  span.textContent = status ? map[status] : '—';
}
```

- [x] **Step 3: Wire engine/bank changes and playback to refresh the controls/badges**

1. Extend the **existing** listeners (do not add new ones):
   - `playback-engine-select` change handler (`src/ui/app.ts:88`): after `setDefaults`, call `this.updateScoreUi();` so the controls switch between GM and waveform.
   - `playback-bank-select` change handler (`src/ui/app.ts:91`): after `setDefaults`, call `this.updateScoreUi();` so badges reset (new bank ⇒ patches must be re-evaluated on next Play).
2. On new score load: call `this.voiceRouter.clearPrograms();` before `updateScoreUi()` (find the load path around `src/ui/app.ts:185–188`) so instrument overrides do not leak between files.
3. In `togglePlay()` (`src/ui/app.ts:245`), after `await this.soundfontPlayer.start(...)` resolves, call `this.updateScoreUi();` (or a lighter badge-only refresh) so badges pick up the new `getStatusMap()`. Because `start()` awaits all patch loads before resolving, badges will jump straight to `loaded`/`fallback`; to make `⏳ Loading…` observable, optionally set sample-mode badges to `loading` immediately before `await start(...)`.

- [x] **Step 4: Update playback status text**

In `togglePlay()`, replace the fixed `this.setStatus('Playing MIDI preview')` with an engine-aware summary computed from `getStatusMap()`:
- Oscillator engine: `'Playing (oscillator synth)'`.
- Sample engine: count `loaded` vs `fallback` across the map, e.g. `Playing SoundFont — 2/2 patches loaded` or `Playing SoundFont — 1 track using synth fallback`. If the map is empty (no audible sample tracks) fall back to a generic `'Playing MIDI preview'`.

- [x] **Step 5: Run full validation**

Run: `npm run validate`
Expected: PASS (tests, type-check, and vite build all succeed).

- [x] **Step 6: Manual visual verification (per the spec's verification strategy)**

Use the `run` skill (or `npm run dev`) to confirm: switching Engine swaps the per-row control between GM instrument and waveform selects; selecting a GM instrument then pressing Play changes the sounding instrument; badges show Loaded/Synth Fallback; a CDN-fetched patch survives a page reload (CacheStorage).

- [x] **Step 7: Commit Task 4**

```bash
git add src/ui/app.ts
git commit -m "feat(ui): engine-aware voice controls with soundfont status badges"
```

---

### Task 5: Documentation

**Files:** `CHANGELOG.md`, `dev-docs/TO_DO.md`, and `dev-docs/ARCHITECTURE.md` / `dev-docs/DESIGN.md` if they describe the audio pipeline (match the pattern in recent commit `a33b395`).

- [x] **Step 1:** Add a CHANGELOG entry for engine-aware voice controls, persistent SoundFont caching, and patch status reporting.
- [x] **Step 2:** Check off / update the relevant item(s) in `dev-docs/TO_DO.md`.
- [x] **Step 3:** If the architecture/design docs enumerate `VoiceRouter` / `SoundfontPlayer` responsibilities, note the new program-override and status-tracking behavior.
- [x] **Step 4:** Commit.

```bash
git add CHANGELOG.md dev-docs/
git commit -m "docs: record engine-aware voice controls and soundfont caching"
```
</content>
</invoke>
