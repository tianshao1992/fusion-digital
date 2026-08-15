'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  isThemePreference,
  resolveTheme,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from './theme-config';

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(preference: ThemePreference) {
  const resolvedTheme = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

function readCookiePreference(): ThemePreference | null {
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${THEME_COOKIE_NAME}=`));
  if (!entry) return null;
  const value = decodeURIComponent(entry.slice(THEME_COOKIE_NAME.length + 1));
  return isThemePreference(value) ? value : null;
}

function readBootPreference(): ThemePreference {
  const bootPreference = document.documentElement.dataset.themePreference;
  if (isThemePreference(bootPreference)) return bootPreference;

  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(storedPreference)) return storedPreference;
  } catch {
    // Storage may be unavailable in privacy-restricted browsing contexts.
  }

  return readCookiePreference() ?? 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    setResolvedTheme(applyTheme(nextPreference));

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // The cookie still provides persistence when localStorage is blocked.
    }

    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(nextPreference)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }, []);

  useEffect(() => {
    const hydrateState = window.requestAnimationFrame(() => {
      const initialPreference = readBootPreference();
      setPreferenceState(initialPreference);
      setResolvedTheme(applyTheme(initialPreference));
    });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      if (document.documentElement.dataset.themePreference === 'system') {
        setResolvedTheme(applyTheme('system'));
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isThemePreference(event.newValue)) return;
      setPreferenceState(event.newValue);
      setResolvedTheme(applyTheme(event.newValue));
    };

    media.addEventListener('change', handleMediaChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.cancelAnimationFrame(hydrateState);
      media.removeEventListener('change', handleMediaChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
