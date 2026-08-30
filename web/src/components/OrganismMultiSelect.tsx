import { ChevronDown } from 'lucide-react';

export type OrganismOption = { id: string; name: string };

export default function OrganismMultiSelect({
  options,
  selectedIds,
  onChange,
  label,
  allLabel,
  noneLabel,
  selectedLabel,
  selectAllLabel,
  selectNoneLabel,
}: {
  options: OrganismOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
  allLabel: string;
  noneLabel: string;
  selectedLabel: (count: number) => string;
  selectAllLabel: string;
  selectNoneLabel: string;
}) {
  const selected = new Set(selectedIds);
  const summary = selectedIds.length === options.length
    ? allLabel
    : selectedIds.length === 0
      ? noneLabel
      : selectedIds.length === 1
        ? options.find((item) => selected.has(item.id))?.name ?? selectedLabel(1)
        : selectedLabel(selectedIds.length);

  return <details className="organism-multiselect">
    <summary><span>{summary}</span><ChevronDown size={17} aria-hidden="true" /></summary>
    <div className="organism-options" role="group" aria-label={label}>
      <div className="organism-actions">
        <button type="button" onClick={() => onChange(options.map((item) => item.id))}>{selectAllLabel}</button>
        <button type="button" onClick={() => onChange([])}>{selectNoneLabel}</button>
      </div>
      {options.map((item) => <label key={item.id}>
        <input
          type="checkbox"
          value={item.id}
          checked={selected.has(item.id)}
          onChange={(event) => onChange(event.target.checked
            ? options.filter((option) => selected.has(option.id) || option.id === item.id).map((option) => option.id)
            : selectedIds.filter((id) => id !== item.id))}
        />
        <span>{item.name}</span>
      </label>)}
    </div>
  </details>;
}