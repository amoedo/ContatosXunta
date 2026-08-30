import { describe, expect, it } from 'vitest';

import { parseOrganismSelection, writeOrganismSelection } from '../src/lib/organismFilter';

const allIds = ['11', '215', '513'];

describe('organism URL filtering', () => {
  it('defaults to all and serializes one deselection as an exclusion', () => {
    expect(parseOrganismSelection(new URLSearchParams(), allIds)).toEqual(allIds);
    const params = new URLSearchParams();

    writeOrganismSelection(params, ['11', '513'], allIds);

    expect(params.toString()).toBe('excludeOrganisms=215');
    expect(parseOrganismSelection(params, allIds)).toEqual(['11', '513']);
  });

  it('supports compact positive, empty, and legacy selections', () => {
    const positive = new URLSearchParams();
    writeOrganismSelection(positive, ['215'], allIds);
    expect(positive.toString()).toBe('organisms=215');
    expect(parseOrganismSelection(positive, allIds)).toEqual(['215']);

    const empty = new URLSearchParams();
    writeOrganismSelection(empty, [], allIds);
    expect(empty.toString()).toBe('organisms=none');
    expect(parseOrganismSelection(empty, allIds)).toEqual([]);

    expect(parseOrganismSelection(new URLSearchParams('organism=513'), allIds)).toEqual(['513']);
  });
});