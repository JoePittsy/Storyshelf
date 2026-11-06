import { useSearchParams } from 'react-router';
import { authorImageUrl, pickLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { bookCount, useAuthors, withLibrary } from '../api/people';
import { PeopleList } from './PeopleList';

/** Library tab: every author A–Z by surname, with photo and book count. */
export function AuthorList() {
  const [params] = useSearchParams();
  const libs = useLibraries();
  const libraryId = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const authors = useAuthors(libraryId);
  const rows = authors.data?.map((a) => ({
    key: a.id,
    name: a.lastFirst || a.name,
    avatarName: a.name,
    caption: bookCount(a.numBooks),
    href: withLibrary(`/author/${encodeURIComponent(a.id)}`, libraryId),
    imageUrl: authorImageUrl(a),
  }));
  return <PeopleList noun="authors" rows={rows} failed={libs.isError || authors.isError} />;
}
