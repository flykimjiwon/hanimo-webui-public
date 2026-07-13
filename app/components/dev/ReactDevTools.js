'use client';

import { useEffect } from 'react';

let startupPromise = null;

export default function ReactDevTools() {
  useEffect(() => {
    const enabled =
      process.env.NODE_ENV === 'development' &&
      process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== '1';

    if (!enabled) return undefined;

    startupPromise ??= (async () => {
      await import('react-grab');
      const { scan } = await import('react-scan');
      scan({ enabled: true });
    })();

    void startupPromise.catch((error) => {
      console.warn('[react-dev-tools] startup failed:', error);
    });

    return undefined;
  }, []);

  return null;
}
