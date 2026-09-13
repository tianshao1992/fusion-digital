'use client';

import { useI18n } from '../i18n';
import './vr-tour.css';

// Public tour supplied by the user via QR code; independent of CAD/EFIT data.
export const EXL50U_VR_URL = 'https://www.720yun.com/vr/ac7jzpsavm5';

export default function Exl50uVrTour() {
  const { locale } = useI18n();
  const en = locale === 'en';
  return <section className="deviceVrTour" aria-label={en ? 'EXL-50U VR tour' : 'EXL-50U VR 全景'}>
    <div className="deviceVrToolbar">
      <span>{en ? 'Torus hall & laboratories · ENN / 720yun' : '装置大厅与实验室 · 新奥科技 / 720云'}</span>
      <a href={EXL50U_VR_URL} target="_blank" rel="noopener noreferrer" aria-label={en ? 'Open EXL-50U VR tour in a new window' : '在新窗口打开 EXL-50U VR 实景'}>{en ? 'EXL-50U · VR tour' : 'EXL-50U · VR 实景'} ↗</a>
    </div>
  </section>;
}
