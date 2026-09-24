import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KIT · Personal Knowledge Workspace",
  description: "本地优先的知识、灵感与行动工作台",
  icons: { icon: "/kit-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
