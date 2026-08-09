import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL('https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site'),title:'聚变物理仿真图谱｜从 DINA / MEQ 到整厂数字孪生',description:'聚变电厂、聚变堆与聚变装置的物理模拟、集成模拟框架、验证证据及数字孪生差距与路线图。',openGraph:{title:'聚变物理仿真图谱',description:'从集成模拟与控制服务走向聚变电厂级可信数字孪生',images:['/og.png']},twitter:{card:'summary_large_image',title:'聚变物理仿真图谱',description:'从 DINA / MEQ 与集成模拟到聚变电厂数字孪生',images:['/og.png']}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
