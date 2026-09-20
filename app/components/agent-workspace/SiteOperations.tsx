'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/app/i18n';
import { SiteActionRuntime, type SiteActionAdapter } from '@/app/agent/site-action-runtime';
import { BrowserPageSurface } from './page-surface';

const OperationsContext = createContext<SiteActionRuntime | null>(null);

export function SiteOperationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname() || '/';
  const query = useSearchParams().toString();
  const { locale } = useI18n();
  const [runtime] = useState(() => new SiteActionRuntime(href => router.push(href)));
  useEffect(() => { runtime.setLocale(locale); }, [runtime, locale]);
  useEffect(() => { runtime.setLocation(`${path}${query ? `?${query}` : ''}`); }, [runtime, path, query]);
  useEffect(() => runtime.setPageSurface(new BrowserPageSurface(document, window)), [runtime]);
  useEffect(() => () => runtime.cancel(), [runtime]);
  return <OperationsContext.Provider value={runtime}>{children}</OperationsContext.Provider>;
}

export function useSiteOperations(): SiteActionRuntime | null { return useContext(OperationsContext); }

/** Register only mounted page surfaces; callbacks always read the latest committed React state. */
export function useSiteActionAdapter(adapter: SiteActionAdapter | null): void {
  const runtime = useSiteOperations();
  const latest = useRef(adapter);
  useEffect(() => { latest.current = adapter; });
  const id = adapter?.id;
  const path = adapter?.path;
  const capabilitiesKey = adapter?.capabilities.join('|');
  useEffect(() => {
    if (!runtime || !id || !path) return;
    return runtime.register({
      id, path, capabilities: (capabilitiesKey?.split('|') ?? []) as SiteActionAdapter['capabilities'],
      getContext: () => latest.current?.getContext() ?? {},
      execute: (action, options) => {
        if (!latest.current) return Promise.reject(new Error('Page is no longer active'));
        return latest.current.execute(action, options);
      },
    });
  }, [runtime, id, path, capabilitiesKey]);
}
