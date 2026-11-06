import { Link } from 'react-router';
import { EmptyState, PillButton } from '@joepittsy/ui';
import { AbsError } from '../api/auth';

/** A page's load error: "not found" with a way back for a 404, anything else with a retry. */
export function LoadFailed({ error, noun, onRetry }: { error: unknown; noun: string; onRetry: () => void }) {
  if (error instanceof AbsError && error.status === 404)
    return (
      <EmptyState title={`We couldn't find that ${noun}`} action={<Link to="/">Back to your library</Link>}>
        It may have been removed, or it isn't in a library you can open.
      </EmptyState>
    );
  return (
    <EmptyState
      title={`Couldn't load this ${noun}`}
      action={
        <PillButton variant="primary" onClick={onRetry}>
          Try again
        </PillButton>
      }
    >
      Check your connection and try again. If it keeps happening, the server may be down.
    </EmptyState>
  );
}
