/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('approved font fallback stack', () => {
  it('is exactly IBM Plex Mono, ui-monospace, monospace', async () => {
    const css = await readFile(
      join(process.cwd(), 'src/ui/styles/tokens.css'),
      'utf8',
    );
    const declaration = css.match(/--font-family:\s*([^;]+);/);
    expect(declaration).not.toBeNull();
    const stack = (declaration?.[1] ?? '').replace(/\s+/g, ' ').trim();
    // Guards against extra or reordered fallback families (S03-WI01).
    expect(stack).toBe("'IBM Plex Mono', ui-monospace, monospace");
  });
});
