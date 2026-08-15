import type { Metadata } from 'next';
import DigitalPrototypeContent from './DigitalPrototypeContent';
import { parseDeviceCatalog } from './deviceCatalog';
import deviceCatalogJson from '../../public/models/device-catalog.json';
import './prototype.css';
import './turntable.css';

export const metadata: Metadata = {
  title: '数字样机与 EFIT 工作台',
  description: 'FusionDigital 多装置数字样机工作台：装置切换、三维结构、部件交互、EFIT 位形与放电时序。',
};

export default function DigitalPrototypePage() {
  const deviceCatalog = parseDeviceCatalog(deviceCatalogJson);
  return <DigitalPrototypeContent catalog={deviceCatalog} />;
}
