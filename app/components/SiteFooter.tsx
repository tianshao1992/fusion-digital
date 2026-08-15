import Link from 'next/link';
import BrandWordmark from './BrandWordmark';

export default function SiteFooter() {
  return <footer className="siteFooter" id="about">
    <div className="footerBrand">
      <img src="/fusiondigital-mark.png" alt="" />
      <div><BrandWordmark className="footerBrandName" /><p>面向聚变数字孪生的开放技术社区</p></div>
    </div>
    <div><b>建设团队</b><p>新奥聚变人工智能团队</p></div>
    <div><b>联系与合作</b><p><a href="mailto:tianshao1992@gmail.com">tianshao1992@gmail.com</a></p></div>
    <div><b>平台说明</b><p><Link href="/platform">平台架构、接入合同与技术路线</Link><br/>资料更新至 2026-08-15</p></div>
  </footer>;
}
