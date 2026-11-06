import { Navigate, useParams, useSearchParams } from 'react-router';
import { narratorPath } from '../api/libraries';
import { decodeName } from '../api/people';

/** Old /narrator/:name links: the library filtered to that narrator. */
export function NarratorRedirect() {
  const name = decodeName(useParams().name ?? '');
  const [params] = useSearchParams();
  return <Navigate replace to={narratorPath(name, params.get('library'))} />;
}
