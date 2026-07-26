import { clearSoundfontCache, getCacheStatus, prefetchBank } from '../audio/soundfont/soundfontLibrary.js';

export const LIBRARY_PROMPT_FLAG = 'av-soundfont-library-prompted';

export interface LibraryUIContext {
  element: <T extends HTMLElement>(id: string) => T;
  setStatus: (message: string, isError?: boolean) => void;
  getDownloadAbort?: () => AbortController | null;
  setDownloadAbort?: (controller: AbortController | null) => void;
}

export function maybeShowLibraryPrompt(ctx: LibraryUIContext): void {
  let alreadyPrompted = false;
  try {
    alreadyPrompted = localStorage.getItem(LIBRARY_PROMPT_FLAG) === '1';
  } catch {
    /* storage unavailable */
  }
  if (alreadyPrompted) return;
  const dialog = ctx.element<HTMLDialogElement>('library-prompt');
  if (typeof dialog.showModal === 'function') dialog.showModal();
}

export function dismissLibraryPrompt(ctx: LibraryUIContext): void {
  try {
    localStorage.setItem(LIBRARY_PROMPT_FLAG, '1');
  } catch {
    /* storage unavailable */
  }
  const dialog = ctx.element<HTMLDialogElement>('library-prompt');
  if (dialog.open) dialog.close();
}

export async function refreshCacheStatus(ctx: LibraryUIContext): Promise<void> {
  const label = ctx.element<HTMLElement>('sf-cache-status');
  const status = await getCacheStatus('FluidR3_GM');
  if (!status.available) {
    label.textContent = 'Offline cache unavailable in this browser.';
    return;
  }
  label.textContent = `SoundFont cache: ${status.cached}/${status.total} FluidR3 GM instruments stored.`;
}

export async function downloadLibrary(ctx: LibraryUIContext): Promise<void> {
  if (ctx.getDownloadAbort?.()) return; // a download is already running
  const downloadBtn = ctx.element<HTMLButtonElement>('btn-download-library');
  const cancelBtn = ctx.element<HTMLButtonElement>('btn-cancel-download');
  const clearBtn = ctx.element<HTMLButtonElement>('btn-clear-cache');
  const progress = ctx.element<HTMLElement>('sf-progress');
  const fill = ctx.element<HTMLElement>('sf-progress-fill');
  const progressLabel = ctx.element<HTMLElement>('sf-progress-label');

  const controller = new AbortController();
  ctx.setDownloadAbort?.(controller);
  downloadBtn.hidden = true;
  cancelBtn.hidden = false;
  clearBtn.disabled = true;
  progress.hidden = false;

  const result = await prefetchBank(
    'FluidR3_GM',
    (p) => {
      const pct = Math.round((p.done / p.total) * 100);
      fill.style.width = `${pct}%`;
      progressLabel.textContent = `${p.done}/${p.total} · ${p.slug.replace(/_/g, ' ')}`;
    },
    controller.signal
  );

  ctx.setDownloadAbort?.(null);
  downloadBtn.hidden = false;
  cancelBtn.hidden = true;
  clearBtn.disabled = false;
  progress.hidden = true;
  fill.style.width = '0%';

  if (result.aborted) ctx.setStatus(`Library download cancelled (${result.ok} instruments cached).`);
  else if (result.failed > 0) ctx.setStatus(`Library download finished — ${result.ok} cached, ${result.failed} unavailable.`, result.ok === 0);
  else ctx.setStatus(`Full SoundFont library downloaded (${result.ok} instruments).`);
  await refreshCacheStatus(ctx);
}

export async function clearLibraryCache(ctx: LibraryUIContext): Promise<void> {
  const cleared = await clearSoundfontCache();
  ctx.setStatus(cleared ? 'SoundFont cache cleared.' : 'No SoundFont cache to clear.');
  await refreshCacheStatus(ctx);
}
