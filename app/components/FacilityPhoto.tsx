type DevicePhoto = { file: string; width: number; height: number; zh: string; en: string; credit: string; concept?: boolean; position?: string };

const photos: Record<string, DevicePhoto> = {
  'EXL-50U': { file: 'exl50u-device.jpg', width: 1300, height: 678, zh: 'EXL-50U · 装置实景', en: 'EXL-50U · Experimental device', credit: '© ENN Research' },
  'EHL-2': { file: 'ehl2-concept.jpg', width: 1047, height: 575, zh: 'EHL-2 · 设计概念图，非实拍', en: 'EHL-2 · Design concept, not a photograph', credit: '© ENN Research', concept: true },
  'SPARC': { file: 'sparc-assembly.jpg', width: 1200, height: 800, zh: 'SPARC · 总装大厅实景', en: 'SPARC · Assembly hall', credit: '© Commonwealth Fusion Systems', position: '50% 70%' },
  'BEST': { file: 'best-assembly.jpg', width: 1200, height: 675, zh: 'BEST · 杜瓦底座吊装，2025年', en: 'BEST · Cryostat base installation, 2025', credit: '© HFIPS / ASIPP' },
  'DTT': { file: 'dtt-concept.jpg', width: 1200, height: 877, zh: 'DTT · 设计概念图，非实拍', en: 'DTT · Design concept, not a photograph', credit: '© ENEA / EAI', concept: true },
  'JT-60SA': { file: 'jt60sa-device.jpg', width: 600, height: 450, zh: 'JT-60SA · 装配期资料图', en: 'JT-60SA · Assembly-era photograph', credit: 'European Commission' },
  'STEP': { file: 'step-concept.jpg', width: 960, height: 640, zh: 'STEP · 早期概念图，2021年，非实拍', en: 'STEP · Early concept, 2021; not a photograph', credit: 'UKAEA · OGL v3.0', concept: true },
  'EAST': { file: 'east-device.jpg', width: 1200, height: 729, zh: 'EAST · 装置实景', en: 'EAST · Experimental device', credit: '© HFIPS / ASIPP' },
  'MAST Upgrade': { file: 'mast-upgrade-device.jpg', width: 960, height: 640, zh: 'MAST Upgrade · 装置实景', en: 'MAST Upgrade · Experimental device', credit: 'UKAEA · OGL v3.0' },
  'DIII-D': { file: 'diiid-interior.jpg', width: 1200, height: 800, zh: 'DIII-D · 真空室内部，2017年', en: 'DIII-D · Vessel interior, 2017', credit: 'Rswilcox · CC BY-SA 4.0' },
  'ITER': { file: 'iter-assembly.jpg', width: 1800, height: 1350, zh: 'ITER · 装配现场，2026年4月', en: 'ITER · Assembly, April 2026', credit: '© ITER Organization' },
  'JET': { file: 'jet-interior.jpg', width: 1200, height: 800, zh: 'JET · 真空室内部，2011年', en: 'JET · Vessel interior, 2011', credit: 'EUROfusion · CC BY 4.0' },
  'KSTAR': { file: 'kstar-device.jpg', width: 1200, height: 900, zh: 'KSTAR · 装置实景，2007年', en: 'KSTAR · Experimental device, 2007', credit: 'Michel Maccagnan · CC BY-SA 3.0' },
  'Wendelstein 7-X': { file: 'w7x-interior.jpg', width: 1800, height: 1201, zh: 'Wendelstein 7-X · 内部实景', en: 'Wendelstein 7-X · Interior', credit: 'Gwurden · CC BY-SA 3.0' },
};

export default function FacilityPhoto({ device, en, className, priority = false, imageLink }: { device: string; en: boolean; className?: string; priority?: boolean; imageLink?: { href: string; label: string; accessibleLabel: string; note: string } }) {
  const photo = photos[device];
  if (!photo) return null;
  const picture = <img src={`/photos/${photo.file}`} alt={en ? photo.en : photo.zh} width={photo.width} height={photo.height} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding="async" style={photo.position ? {objectPosition: photo.position} : undefined} />;
  return <figure className={className} data-image-kind={photo.concept ? 'concept' : 'photograph'}>
    {imageLink ? <a className="facilityPhotoLink" href={imageLink.href} target="_blank" rel="noopener noreferrer" aria-label={imageLink.accessibleLabel}>
      {picture}
      <span className="photoVrBadge" aria-hidden="true">360° VR</span>
      <span className="photoVrAction"><span className="photoVrPlay" aria-hidden="true">▶</span><span><strong>{imageLink.label} ↗</strong><small>{imageLink.note}</small></span></span>
    </a> : picture}
    <figcaption><span>{en ? photo.en : photo.zh}</span><a href="/photos/credits.json" target="_blank" rel="noopener noreferrer">{photo.credit} ↗</a></figcaption>
  </figure>;
}
