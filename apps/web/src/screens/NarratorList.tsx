import { useSearchParams } from 'react-router';
import { narratorPath, pickLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { bookCount, useNarrators } from '../api/people';
import { PeopleList } from './PeopleList';

/** Library tab: every narrator A–Z with book count. */
export function NarratorList() {
  const [params] = useSearchParams();
  const libs = useLibraries();
  const libraryId = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const narrators = useNarrators(libraryId);
  const rows = narrators.data?.map((n) => ({
    key: n.name,
    name: n.name,
    caption: bookCount(n.numBooks),
    href: narratorPath(n.name, libraryId),
  }));
  return <PeopleList noun="narrators" rows={rows} failed={libs.isError || narrators.isError} />;
}
