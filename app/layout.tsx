import './globals.css';
export const metadata = {
  title: 'RS 3 · 五缸机械实验室',
  description: 'Audi RS3 8Y 2.5 TFSI 五缸发动机交互模型与四冲程观察',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
