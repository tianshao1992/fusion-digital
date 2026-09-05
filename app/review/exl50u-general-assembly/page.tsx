import MultiDeviceWorkspace from '@/app/digital-prototype/MultiDeviceWorkspace';
import { parseDeviceCatalog } from '@/app/digital-prototype/deviceCatalog';
import reviewCatalogJson from '../../../public/models/exl50u-general-assembly-review-candidate.json';
import '@/app/digital-prototype/prototype.css';
import '@/app/digital-prototype/workspace-layout.css';

const reviewCatalog = parseDeviceCatalog(reviewCatalogJson);

export default function Exl50uGeneralAssemblyReviewPage() {
  return <main className="prototypePage">
    <section className="prototypeHero prototypeHero--compact">
      <div>
        <p className="sectionIndex">VISUAL REVIEW CANDIDATE</p>
        <h1>EXL‑50U 总装<span>视觉验收中</span></h1>
        <p>非正式生产候选 · productionEligible=false · canonical visual QA 尚未通过</p>
      </div>
    </section>
    <MultiDeviceWorkspace catalog={reviewCatalog} />
  </main>;
}
