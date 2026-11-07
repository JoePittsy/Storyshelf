import { configure } from '@testing-library/react';

// findBy* and waitFor default to 1s. Under a full parallel run (both packages, jsdom, on a busy machine) a screen can
// take longer than that to settle, and a test that would pass flakes. 5s only slows a run that was going to fail.
configure({ asyncUtilTimeout: 5_000 });
