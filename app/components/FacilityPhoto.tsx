type DevicePhoto = { file: string; width: number; height: number; zh: string; en: string; credit: string };

const photos: Record<string, DevicePhoto> = {
  'EXL-50U': { file: 'exl50u-device.jpg', width: 1300, height: 678, zh: 'EXL-50U · 装置实景', en: 'EXL-50U · Experimental device', credit: '© ENN Research' },
  'ITER': { file: 'iter-assembly.jpg', width: 1800, height: 1350, zh: 'ITER · 装配现场，2026年4月', en: 'ITER · Assembly, April 2026', credit: '© ITER Organization' },
  'JET': { file: 'jet-interior.jpg', width: 1200, height: 800, zh: 'JET · 真空室内部，2011年', en: 'JET · Vessel interior, 2011', credit: 'EUROfusion · CC BY 4.0' },
  'KSTAR': { file: 'kstar-device.jpg', width: 1200, height: 900, zh: 'KSTAR · 装置实景，2007年', en: 'KSTAR · Experimental device, 2007', credit: 'Michel Maccagnan · CC BY-SA 3.0' },
  'Wendelstein 7-X': { file: 'w7x-interior.jpg', width: 1800, height: 1201, zh: 'Wendelstein 7-X · 内部实景', en: 'Wendelstein 7-X · Interior', credit: 'Gwurden · CC BY-SA 3.0' },
};

export default function FacilityPhoto({ device, en, className, priority = false }: { device: string; en: boolean; className?: string; priority?: boolean }) {
  const photo = photos[device];
  if (!photo) return null;
  return <figure className={className}>
    <img src={`/photos/${photo.file}`} alt={en ? photo.en : photo.zh} width={photo.width} height={photo.height} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding="async" />
    <figcaption><span>{en ? photo.en : photo.zh}</span><a href="/photos/credits.json" target="_blank" rel="noopener noreferrer">{photo.credit} ↗</a></figcaption>
  </figure>;
}
