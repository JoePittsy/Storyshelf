import { useState } from 'react';

/** The time when the screen mounted. "Today" is decided once per visit, so a render never reads the clock. */
export const useNow = (): number => useState(() => Date.now())[0];
