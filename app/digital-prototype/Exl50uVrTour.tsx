import FacilityPhoto from '../components/FacilityPhoto';
import './vr-tour.css';

// Public tour supplied by the user via QR code; independent of CAD/EFIT data.
export const EXL50U_VR_URL = 'https://www.720yun.com/vr/ac7jzpsavm5';

export default function Exl50uVrTour({ en }: { en: boolean }) {
  return <FacilityPhoto device="EXL-50U" en={en} className="heroPhotography heroVrTour" priority
    imageLink={{ href: EXL50U_VR_URL, label: en ? 'Enter the VR tour' : '进入 VR 实景',
      accessibleLabel: en ? 'Open EXL-50U VR tour in a new window' : '在新窗口打开 EXL-50U VR 实景',
      note: en ? '360° · Opens in a new window' : '360° 全景 · 新窗口打开' }} />;
}
