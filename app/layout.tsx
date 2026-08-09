import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL('https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site'),title:'聚变模拟图谱｜物理模拟、工程仿真与数字孪生',description:'聚变物理模拟、Tokamak 工程仿真、集成框架、实验验证、工具目录及从 DINA / MEQ 到聚变电厂数字孪生的路线。',openGraph:{title:'聚变模拟图谱',description:'物理模拟与工程仿真共同走向聚变电厂级可信数字孪生',images:['/og.png']},twitter:{card:'summary_large_image',title:'聚变模拟图谱',description:'从 DINA / MEQ、物理模拟和工程仿真到聚变电厂数字孪生',images:['/og.png']}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
