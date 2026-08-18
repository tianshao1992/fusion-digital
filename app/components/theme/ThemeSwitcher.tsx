'use client';

import { type KeyboardEvent, useRef } from 'react';
import { useI18n } from '@/app/i18n';
import { THEME_PREFERENCES, type ThemePreference } from './theme-config';
import { useTheme } from './ThemeProvider';

export type ThemeSwitcherLabels = Record<ThemePreference | 'group', string>;

const defaultLabels: ThemeSwitcherLabels = {
  group: '外观主题',
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

const defaultEnglishLabels: ThemeSwitcherLabels = {
  group: 'Appearance theme',
  system: 'Use system setting',
  light: 'Light',
  dark: 'Dark',
};

const icons: Record<ThemePreference, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

export function ThemeSwitcher({
  labels,
  compact = false,
  className = '',
}: {
  labels?: ThemeSwitcherLabels;
  compact?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const activeLabels = labels ?? (locale === 'en' ? defaultEnglishLabels : defaultLabels);
  const { preference, setPreference } = useTheme();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const choose = (nextPreference: ThemePreference, index: number) => {
    setPreference(nextPreference);
    refs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = THEME_PREFERENCES.indexOf(preference);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % THEME_PREFERENCES.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + THEME_PREFERENCES.length) % THEME_PREFERENCES.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = THEME_PREFERENCES.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    choose(THEME_PREFERENCES[nextIndex], nextIndex);
  };

  return (
    <div
      className={`themeSwitcher${compact ? ' themeSwitcher--compact' : ''}${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={activeLabels.group}
      onKeyDown={handleKeyDown}
    >
      {THEME_PREFERENCES.map((item, index) => (
        <button
          key={item}
          ref={(node) => { refs.current[index] = node; }}
          type="button"
          role="radio"
          aria-checked={preference === item}
          aria-label={activeLabels[item]}
          title={activeLabels[item]}
          tabIndex={preference === item ? 0 : -1}
          onClick={() => choose(item, index)}
        >
          <span className="themeSwitcherIcon" aria-hidden="true">{icons[item]}</span>
          <span className="themeSwitcherLabel">{activeLabels[item]}</span>
        </button>
      ))}
    </div>
  );
}
