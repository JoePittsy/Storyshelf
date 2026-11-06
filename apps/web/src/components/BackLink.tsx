import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import styles from './BackLink.module.css';

/** Back to the library as the user left it (query string and all) when there is history, else to /. */
export function BackLink() {
  const navigate = useNavigate();
  const hasHistory = useLocation().key !== 'default';
  const onClick = (e: MouseEvent) => {
    if (!hasHistory) return;
    e.preventDefault();
    void navigate(-1);
  };
  return (
    <Link to="/" className={styles.back} onClick={onClick}>
      <span aria-hidden="true">← </span>Library
    </Link>
  );
}
