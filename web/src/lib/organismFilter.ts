export function parseOrganismSelection(params: URLSearchParams, allIds: string[]) {
  const validIds = new Set(allIds);
  const included = params.has('organisms')
    ? params.get('organisms') ?? ''
    : params.get('organism');
  if (included !== null) {
    if (included === 'none') return [];
    const selected = new Set(included.split(',').filter((id) => validIds.has(id)));
    return allIds.filter((id) => selected.has(id));
  }

  const excluded = new Set(
    (params.get('excludeOrganisms') ?? '').split(',').filter((id) => validIds.has(id)),
  );
  return allIds.filter((id) => !excluded.has(id));
}

export function writeOrganismSelection(
  params: URLSearchParams,
  selectedIds: string[],
  allIds: string[],
) {
  params.delete('organism');
  params.delete('organisms');
  params.delete('excludeOrganisms');
  const selected = new Set(selectedIds);
  const normalized = allIds.filter((id) => selected.has(id));
  if (normalized.length === allIds.length) return;
  if (normalized.length === 0) {
    params.set('organisms', 'none');
    return;
  }
  const excluded = allIds.filter((id) => !selected.has(id));
  if (normalized.length <= excluded.length) params.set('organisms', normalized.join(','));
  else params.set('excludeOrganisms', excluded.join(','));
}