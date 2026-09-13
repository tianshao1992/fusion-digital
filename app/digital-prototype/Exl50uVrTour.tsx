'use client';

import { useState } from 'react';
import { useI18n } from '../i18n';
import './vr-tour.css';

// Public tour supplied by the user via QR code; independent of CAD/EFIT data.
export const EXL50U_VR_URL = 'https://www.720yun.com/vr/ac7jzpsavm5';

export default function Exl50uVrTour() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const [open, setOpen] = useState(false);
  return <section className="deviceVrTour" aria-label={en ? 'EXL-50U VR tour' : 'EXL-50U VR 全景'}>
    <div className="deviceVrToolbar">
      <strong>{en ? 'EXL-50U · VR tour' : 'EXL-50U · VR 实景'}</strong>
      <button type="button" aria-expanded={open} aria-controls="exl50u-vr-player" onClick={() => setOpen(!open)}>{open ? (en ? 'Close tour' : '关闭全景') : (en ? 'Explore here' : '在此浏览')}</button>
      <a href={EXL50U_VR_URL} target="_blank" rel="noopener noreferrer">{en ? 'Open in new window' : '新窗口打开'} ↗</a>
    </div>
    {open && <div id="exl50u-vr-player" className="deviceVrPlayer">
      <p>{en ? 'ENN Science & Technology · 720yun. If the player cannot load, open it in a new window. Headset support depends on your device and browser.' : '新奥科技 · 720云。若无法加载，请在新窗口打开；头显支持取决于设备与浏览器。'}</p>
      <iframe src={EXL50U_VR_URL} title={en ? 'EXL-50U torus hall panoramic tour (720yun)' : 'EXL-50U 装置大厅全景（720云）'} allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking" allowFullScreen referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-presentation allow-popups" />
    </div>}
  </section>;
}
