import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { backLabel, usePreviousPlace } from '../frame/routeTrail';
import styles from './BackLink.module.css';

/**
 * Back to where the listener came from, named for it ("Authors", "The Tale of Peter Rabbit"), as they left it (query string and all)
 * when there is history, else the library.
 */
export function BackLink() {
  const navigate = useNavigate();
  const hasHistory = useLocation().key !== 'default';
  const from = usePreviousPlace();
  const label = backLabel(hasHistory ? from?.path : null, from?.title);
  const onClick = (e: MouseEvent) => {
    if (!hasHistory) return;
    e.preventDefault();
    void navigate(-1);
  };
  return (
    <Link to="/" className={styles.back} aria-label={`Back to ${label}`} onClick={onClick}>
      <span aria-hidden="true">← </span>
      {label}
    </Link>
  );
}
