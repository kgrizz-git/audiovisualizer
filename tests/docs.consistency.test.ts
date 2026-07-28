// @ts-expect-error Node built-in used for test fixture loading
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legendSource = readFileSync(new URL('../src/core/legend/legendContent.ts', import.meta.url), 'utf8');
const modesDoc = readFileSync(new URL('../docs/modes.md', import.meta.url), 'utf8');
const nonModeHeadings = new Set(['Shared controls', '3D viewing and playback']);

function setOf(values: Iterable<string>): Set<string> {
  return new Set(values);
}

describe('docs/modes.md mode coverage', () => {
  it('has exactly the same mode set as legendContent.ts', () => {
    const legendModes = setOf([...legendSource.matchAll(/^\s*case '([^']+)':/gm)].map((match) => match[1]));
    const documentedModes = setOf(
      [...modesDoc.matchAll(/^## (.+)$/gm)]
        .map((match) => match[1])
        .filter((heading) => !nonModeHeadings.has(heading)),
    );
    expect(documentedModes).toEqual(legendModes);
  });
});
