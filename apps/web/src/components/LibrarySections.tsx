import { useNavigate } from 'react-router';
import { Tabs } from '@joepittsy/ui';
import { visibleSections } from '../api/bookLists';
import type { SectionKey } from '../api/bookLists';
import { withLibrary } from '../api/people';

interface Props {
  current: SectionKey;
  libraryId: string | undefined;
  counts: { collections?: number; playlists?: number };
}

/**
 * Books, Collections and Playlists: the Library tab's own sections, as History has its own. Only there when the library
 * has collections or playlists; otherwise nothing at all.
 */
export function LibrarySections({ current, libraryId, counts }: Props) {
  const navigate = useNavigate();
  const sections = visibleSections(current, counts);
  if (sections.length === 0) return null;
  return (
    <Tabs
      label="Library sections"
      current={current}
      items={sections.map((s) => ({ key: s.key, label: s.label, href: withLibrary(s.path, libraryId) }))}
      onNavigate={(href) => void navigate(href)}
    />
  );
}
