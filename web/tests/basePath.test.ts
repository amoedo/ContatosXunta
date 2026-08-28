import { describe, expect, it } from 'vitest';

import { withBase } from '../src/lib/basePath';

describe('withBase', () => {
  it('joins root and GitHub Pages base paths without missing or duplicate slashes', () => {
    expect(withBase('/data/analysis.json', '/')).toBe('/data/analysis.json');
    expect(withBase('/data/analysis.json', '/ContatosXunta')).toBe('/ContatosXunta/data/analysis.json');
    expect(withBase('explorador', '/ContatosXunta/')).toBe('/ContatosXunta/explorador');
  });
});