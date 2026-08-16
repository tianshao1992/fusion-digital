'use client';

import Link from 'next/link';
import { useI18n } from '../i18n';

export default function KnowledgeBackLink() {
  const { t } = useI18n();
  return <Link className="knowledgeBackLink" href="/knowledge-graph" aria-label={t('nav.backToKnowledge')}>
    <span aria-hidden="true">←</span>{t('nav.backToKnowledge')}
  </Link>;
}
