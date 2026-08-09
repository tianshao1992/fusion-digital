import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'聚变物理仿真图谱｜从 DINA / MEQ 到整厂数字孪生',description:'聚变电厂、聚变堆与聚变装置的物理模拟技术地图、代码工具目录、验证证据和数字孪生路线图。',openGraph:{title:'聚变物理仿真图谱',description:'从控制服务走向聚变电厂级可信预测',images:['/og.png']}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
