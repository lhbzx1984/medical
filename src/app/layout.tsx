import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/site/Header";

export const metadata: Metadata = {
  title: "MedPlan Atlas · 智能手术规划与医学教学平台",
  description:
    "面向医院与医学院的虚拟手术规划系统：AI 结构化规划、从人体到器官的 3D 模拟、专家反馈迭代与沉浸式解剖学习。",
};

// 首帧前恢复主题，避免闪烁
const themeInit = `(function(){try{var t=localStorage.getItem("mp-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}else if(window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches){document.documentElement.dataset.theme="light";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }}
      >
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-[var(--line)] px-6 py-4 text-center text-xs text-[var(--muted)]">
          © 2026 MedPlan Atlas · 本平台为教学演示用途，AI 生成内容不构成临床决策依据 ·
          解剖数据 © DBCLS BodyParts3D（CC BY 4.0）
        </footer>
      </body>
    </html>
  );
}
