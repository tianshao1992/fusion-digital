'use client';

import { useEffect } from 'react';

/** Old bookmarks remain valid without mounting the research application on the landing page. */
export default function HomeLegacyRedirect() {
  useEffect(() => {
    const followLegacyAnchor = () => {
      const hash = window.location.hash;
      const routes: Record<string, string> = {
        '#prototype-workspace': '/digital-prototype#prototype-workspace',
        '#domains': '/explore#domains',
        '#resources': '/explore#resources',
        '#community': '/#about',
      };
      const domain = /^#domain-(physics|engineering|control|diagnostics|energy|auxiliary|hmi|data|integration|ai)$/.test(hash);
      const destination = domain ? '/explore' + hash : routes[hash];
      if (destination) window.location.replace(destination);
    };
    followLegacyAnchor();
    window.addEventListener('hashchange', followLegacyAnchor);
    return () => window.removeEventListener('hashchange', followLegacyAnchor);
  }, []);
  return null;
}
