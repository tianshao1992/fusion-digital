'use client';

import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

export default function StaticLocaleContent({ zh, en }: { zh: ReactNode; en: ReactNode }) {
  const { locale } = useI18n();
  return locale === 'en' ? en : zh;
}
