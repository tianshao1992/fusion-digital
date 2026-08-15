'use client';

import { type KeyboardEvent, useRef } from 'react';
import { THEME_PREFERENCES, type ThemePreference } from './theme-config';
import { useTheme } from './ThemeProvider';

export type ThemeSwitcherLabels = Record<ThemePreference | 'group', string>;

const defaultLabels: ThemeSwitcherLabels = {
  group: '外观主题',
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

const icons: Record<ThemePreference, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

export function ThemeSwitcher({
  labels = defaultLabels,
  compact = false,
  className = '',
}: {
  labels?: ThemeSwitcherLabels;
  compact?: boolean;
  className?: string;
}) {
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
      aria-label={labels.group}
      onKeyDown={handleKeyDown}
    >
      {THEME_PREFERENCES.map((item, index) => (
        <button
          key={item}
          ref={(node) => { refs.current[index] = node; }}
          type="button"
          role="radio"
          aria-checked={preference === item}
          aria-label={labels[item]}
          title={labels[item]}
          tabIndex={preference === item ? 0 : -1}
          onClick={() => choose(item, index)}
        >
          <span className="themeSwitcherIcon" aria-hidden="true">{icons[item]}</span>
          <span className="themeSwitcherLabel">{labels[item]}</span>
        </button>
      ))}
    </div>
  );
}
