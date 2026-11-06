import { useState, useSyncExternalStore } from 'react';
import { FilterChip, PillButton, Select, Sheet } from '@joepittsy/ui';
import { NO_FILTERS, PROGRESS_OPTIONS, activeKeys, chipLabel, countActive } from '../api/filters';
import type { FilterData, Filters } from '../api/filters';
import styles from './LibraryFilters.module.css';

const WIDE = '(min-width: 48em)';
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia?.(WIDE);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
};
/** True on a screen wide enough for the inline filter row; false on a phone (and where matchMedia is missing). */
const useWide = (): boolean => useSyncExternalStore(subscribe, () => !!window.matchMedia?.(WIDE).matches, () => false);

const ANY = '';
/** "Any" first, then the options; a value from a shared link that ABS doesn't list is kept so the select can show it. */
function options(any: string, values: string[], current: string, label: (v: string) => string = (v) => v) {
  const list = current && !values.includes(current) ? [current, ...values] : values;
  return [{ value: ANY, label: any }, ...list.map((v) => ({ value: v, label: label(v) }))];
}

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  data: FilterData | undefined;
}

/**
 * Library filters. A wide screen gets Genre, Progress and (when the library has several languages) Language inline,
 * and a "More filters" sheet for the rest. A phone gets one "Filters" button whose sheet holds them all.
 */
export function LibraryFilters({ filters, onChange, data }: Props) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });

  const genre = (
    <Select
      label="Genre"
      value={filters.genre}
      options={options('Any genre', data?.genres ?? [], filters.genre)}
      onChange={(v) => set('genre', v)}
    />
  );
  const progress = (
    <Select
      label="Progress"
      value={filters.progress}
      options={[{ value: ANY, label: 'Any progress' }, ...PROGRESS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]}
      onChange={(v) => set('progress', v)}
    />
  );
  // Only worth a control when there is a choice to make.
  const languages = data?.languages ?? [];
  const language =
    languages.length > 1 || filters.lang ? (
      <Select
        label="Language"
        value={filters.lang}
        options={options('Any language', languages, filters.lang)}
        onChange={(v) => set('lang', v)}
      />
    ) : null;

  const moreCount = countActive({ ...NO_FILTERS, tag: filters.tag, publisher: filters.publisher, decade: filters.decade, abridged: filters.abridged, ebook: filters.ebook });
  const buttonCount = wide ? moreCount : countActive({ ...filters, narrator: '' }); // narrator has no control here
  const buttonLabel = wide ? 'More filters' : 'Filters';

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        {wide && (
          <>
            {genre}
            {progress}
            {language}
          </>
        )}
        <PillButton className={styles.more} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {buttonCount > 0 ? `${buttonLabel} (${buttonCount})` : buttonLabel}
        </PillButton>
      </div>
      {countActive(filters) > 0 && (
        <ul className={styles.chips} aria-label="Active filters">
          {activeKeys(filters).map((k) => (
            <li key={k}>
              <FilterChip label={chipLabel(filters, k)} onRemove={() => set(k, NO_FILTERS[k])} />
            </li>
          ))}
          <li>
            <PillButton onClick={() => onChange(NO_FILTERS)}>Clear all</PillButton>
          </li>
        </ul>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={wide ? 'More filters' : 'Filters'}>
        <div className={styles.sheet}>
          {!wide && (
            <>
              {genre}
              {progress}
              {language}
            </>
          )}
          <Select
            label="Tag"
            value={filters.tag}
            options={options('Any tag', data?.tags ?? [], filters.tag)}
            onChange={(v) => set('tag', v)}
          />
          <Select
            label="Publisher"
            value={filters.publisher}
            options={options('Any publisher', data?.publishers ?? [], filters.publisher)}
            onChange={(v) => set('publisher', v)}
          />
          <Select
            label="Published"
            value={filters.decade}
            options={options('Any decade', data?.publishedDecades ?? [], filters.decade, (d) => `${d}s`)}
            onChange={(v) => set('decade', v)}
          />
          <Select
            label="Abridged"
            value={filters.abridged ? '1' : ''}
            options={[
              { value: '', label: 'Any' },
              { value: '1', label: 'Abridged only' },
            ]}
            onChange={(v) => set('abridged', v === '1')}
          />
          <Select
            label="Ebook"
            value={filters.ebook ? '1' : ''}
            options={[
              { value: '', label: 'Any' },
              { value: '1', label: 'Has an ebook' },
            ]}
            onChange={(v) => set('ebook', v === '1')}
          />
          <div className={styles.actions}>
            <PillButton onClick={() => onChange(NO_FILTERS)} disabled={countActive(filters) === 0}>
              Clear all
            </PillButton>
            <PillButton variant="primary" onClick={() => setOpen(false)}>
              Done
            </PillButton>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
