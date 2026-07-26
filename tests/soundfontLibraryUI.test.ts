import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  maybeShowLibraryPrompt,
  dismissLibraryPrompt,
  refreshCacheStatus,
  clearLibraryCache,
  downloadLibrary,
  LIBRARY_PROMPT_FLAG,
  LibraryUIContext,
} from '../src/ui/soundfontLibraryUI.js';
import * as soundfontLibrary from '../src/audio/soundfont/soundfontLibrary.js';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, value);
  },
  clear: () => {
    storageMap.clear();
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

function createMockElement(id: string): any {
  return {
    id,
    textContent: '',
    hidden: false,
    disabled: false,
    open: false,
    style: { width: '' },
    showModal: vi.fn(function (this: any) {
      this.open = true;
    }),
    close: vi.fn(function (this: any) {
      this.open = false;
    }),
  };
}

describe('soundfontLibraryUI', () => {
  let elementsMap: Map<string, any>;
  let statusMessage = '';
  let statusIsError = false;
  let downloadAbort: AbortController | null = null;
  let mockContext: LibraryUIContext;

  beforeEach(() => {
    mockLocalStorage.clear();
    elementsMap = new Map();
    statusMessage = '';
    statusIsError = false;
    downloadAbort = null;

    mockContext = {
      element: <T extends HTMLElement>(id: string) => {
        if (!elementsMap.has(id)) {
          elementsMap.set(id, createMockElement(id));
        }
        return elementsMap.get(id) as T;
      },
      setStatus: (msg: string, isError = false) => {
        statusMessage = msg;
        statusIsError = isError;
      },
      getDownloadAbort: () => downloadAbort,
      setDownloadAbort: (ctrl) => {
        downloadAbort = ctrl;
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('maybeShowLibraryPrompt', () => {
    it('shows prompt modal if not already prompted', () => {
      const dialog = mockContext.element<HTMLDialogElement>('library-prompt');
      maybeShowLibraryPrompt(mockContext);
      expect((dialog as any).showModal).toHaveBeenCalled();
    });

    it('skips prompt if already prompted', () => {
      mockLocalStorage.setItem(LIBRARY_PROMPT_FLAG, '1');
      const dialog = mockContext.element<HTMLDialogElement>('library-prompt');
      maybeShowLibraryPrompt(mockContext);
      expect((dialog as any).showModal).not.toHaveBeenCalled();
    });
  });

  describe('dismissLibraryPrompt', () => {
    it('sets localStorage flag and closes dialog', () => {
      const dialog = mockContext.element<HTMLDialogElement>('library-prompt');
      (dialog as any).open = true;
      dismissLibraryPrompt(mockContext);
      expect(mockLocalStorage.getItem(LIBRARY_PROMPT_FLAG)).toBe('1');
      expect(dialog.close).toHaveBeenCalled();
    });
  });

  describe('refreshCacheStatus', () => {
    it('updates element text when cache is available', async () => {
      vi.spyOn(soundfontLibrary, 'getCacheStatus').mockResolvedValue({
        available: true,
        cached: 10,
        total: 128,
      });

      const label = mockContext.element<HTMLElement>('sf-cache-status');
      await refreshCacheStatus(mockContext);
      expect(label.textContent).toBe('SoundFont cache: 10/128 FluidR3 GM instruments stored.');
    });

    it('updates element text when cache is unavailable', async () => {
      vi.spyOn(soundfontLibrary, 'getCacheStatus').mockResolvedValue({
        available: false,
        cached: 0,
        total: 0,
      });

      const label = mockContext.element<HTMLElement>('sf-cache-status');
      await refreshCacheStatus(mockContext);
      expect(label.textContent).toBe('Offline cache unavailable in this browser.');
    });
  });

  describe('clearLibraryCache', () => {
    it('clears cache and sets status message', async () => {
      vi.spyOn(soundfontLibrary, 'clearSoundfontCache').mockResolvedValue(true);
      vi.spyOn(soundfontLibrary, 'getCacheStatus').mockResolvedValue({
        available: true,
        cached: 0,
        total: 128,
      });

      await clearLibraryCache(mockContext);
      expect(statusMessage).toBe('SoundFont cache cleared.');
    });

    it('handles case when no cache was cleared', async () => {
      vi.spyOn(soundfontLibrary, 'clearSoundfontCache').mockResolvedValue(false);
      vi.spyOn(soundfontLibrary, 'getCacheStatus').mockResolvedValue({
        available: true,
        cached: 0,
        total: 128,
      });

      await clearLibraryCache(mockContext);
      expect(statusMessage).toBe('No SoundFont cache to clear.');
    });
  });

  describe('downloadLibrary', () => {
    it('prefetches bank and updates status on completion', async () => {
      vi.spyOn(soundfontLibrary, 'prefetchBank').mockImplementation(async (_bank, onProgress) => {
        onProgress?.({ done: 5, total: 10, slug: 'acoustic_grand_piano', ok: true });
        return { ok: 10, failed: 0, aborted: false };
      });
      vi.spyOn(soundfontLibrary, 'getCacheStatus').mockResolvedValue({
        available: true,
        cached: 10,
        total: 128,
      });

      await downloadLibrary(mockContext);

      expect(statusMessage).toBe('Full SoundFont library downloaded (10 instruments).');
      expect(statusIsError).toBe(false);
      expect(downloadAbort).toBe(null);
    });

    it('handles cancellation / aborted download', async () => {
      vi.spyOn(soundfontLibrary, 'prefetchBank').mockResolvedValue({ ok: 3, failed: 0, aborted: true });
      vi.spyOn(soundfontLibrary, 'getCacheStatus').mockResolvedValue({
        available: true,
        cached: 3,
        total: 128,
      });

      await downloadLibrary(mockContext);

      expect(statusMessage).toBe('Library download cancelled (3 instruments cached).');
    });
  });
});
