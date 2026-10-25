"use client";

// 首页英雄区：2D 人体解剖图（Agnes 生成插画 + 扫描线 / 器官标注动画）
// 点击器官标注 → 进入学习中心
import Link from "next/link";
import { BrainOverlay } from "@/components/site/AnatomyOverlays";

// 标注坐标为插画画面百分比（依据生成的解剖图人工校准）
const LABELS: { name: string; x: number; y: number; side: "left" | "right" }[] = [
  { name: "大脑", x: 52, y: 5.5, side: "right" },
  { name: "肺", x: 37, y: 31.5, side: "left" },
  { name: "心脏", x: 53.5, y: 36, side: "right" },
  { name: "肝", x: 40.5, y: 47.5, side: "left" },
  { name: "胃", x: 59, y: 49.5, side: "right" },
  { name: "肠", x: 52.5, y: 64, side: "right" },
];

export default function HeroAnatomy() {
  return (
    <div className="vp relative h-[440px] w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-b from-[#0a1322] to-[#070d18] md:h-[540px]">
      {/* 2D 解剖插画（保持 3:4 比例居中） */}
      <div className="relative mx-auto flex h-full justify-center">
        <div className="relative h-full aspect-[3/4]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cases/hero-anatomy.png"
            alt="人体解剖图"
            className="h-full w-full object-cover"
          />

          <BrainOverlay />

          {/* 扫描线 */}
          <div className="scan-line absolute left-[6%] right-[6%] h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#2dd4bf] to-transparent shadow-[0_0_14px_rgba(45,212,191,0.8)]" />

          {/* 器官标注（脉冲定位点 + 名称，点击进入学习中心） */}
          {LABELS.map((l, i) => (
            <Link
              key={l.name}
              href="/learning"
              className="group absolute -translate-y-1/2"
              style={{
                left: `${l.x}%`,
                top: `${l.y}%`,
                transform: `translate(${l.side === "left" ? "-100%" : "0"}, -50%)`,
                animation: `floatSoft ${4.2 + i * 0.4}s ease-in-out ${i * 0.35}s infinite`,
              }}
            >
              <span className="flex items-center gap-1.5">
                {l.side === "left" && (
                  <span className="rounded-md border border-[#2a4a6e] bg-[rgba(7,13,24,0.74)] px-1.5 py-0.5 text-[11px] font-semibold text-[#dceafe] shadow-sm transition-colors group-hover:border-[#2dd4bf] group-hover:text-[#2dd4bf]">
                    {l.name}
                  </span>
                )}
                <span className="organ-dot h-2.5 w-2.5 rounded-full bg-[#2dd4bf]" />
                {l.side === "right" && (
                  <span className="rounded-md border border-[#2a4a6e] bg-[rgba(7,13,24,0.74)] px-1.5 py-0.5 text-[11px] font-semibold text-[#dceafe] shadow-sm transition-colors group-hover:border-[#2dd4bf] group-hover:text-[#2dd4bf]">
                    {l.name}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* 系统图例 */}
      <div className="pointer-events-none absolute left-4 top-4 space-y-1.5">
        {[
          ["#e2d9ba", "骨骼系统"],
          ["#a85b50", "肌肉系统"],
          ["#c05245", "循环系统"],
          ["#d8b565", "神经系统"],
          ["#b47961", "泌尿系统"],
        ].map(([c, n]) => (
          <div key={n} className="flex items-center gap-2 text-[11.5px] text-[var(--text)]">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            {n}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 rounded-lg border border-[var(--line)] bg-[rgba(7,13,24,0.72)] px-3 py-1.5 text-[11px] text-[var(--muted)]">
        2,234 解剖结构 · 2D 动态解剖图 · 点击标注进入学习
      </div>
    </div>
  );
}
