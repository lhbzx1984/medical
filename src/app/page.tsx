"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const HeroAnatomy = dynamic(() => import("@/components/site/HeroAnatomy"), {
  ssr: false,
  loading: () => (
    <div className="vp grid h-[420px] w-full place-items-center rounded-2xl border border-[var(--line)] bg-[#0a1322] md:h-[520px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#22406b] border-t-[#2dd4bf]" />
        <div className="text-xs text-[#8296b5]">正在载入 3D 人体系统图…</div>
      </div>
    </div>
  ),
});

const STATS = [
  { num: "2,234", label: "可选解剖结构" },
  { num: "15", label: "生理系统" },
  { num: "9", label: "高精度器官模型" },
  { num: "≈60s", label: "AI 方案生成" },
];

const WORKFLOW = [
  { icon: "📋", title: "病历录入", desc: "病历与初步方案" },
  { icon: "✨", title: "AI 方案生成", desc: "结构化手术规划" },
  { icon: "🫀", title: "3D 模拟验证", desc: "人体 → 器官推演" },
  { icon: "👨‍⚕️", title: "专家反馈", desc: "逐条修订意见" },
  { icon: "🔁", title: "方案迭代", desc: "新版本全程留痕" },
];

const CASES = [
  {
    img: "/cases/case-appendicitis.png",
    name: "王建国",
    meta: "男 · 45 岁 · 虚拟病人",
    disease: "急性化脓性阑尾炎",
    procedure: "腹腔镜阑尾切除术",
    points: ["知识库检索增强生成 7 步骤规划", "专家 4 条反馈 → v2 修订迭代", "8 步「人体→器官」3D 模拟"],
  },
  {
    img: "/cases/case-cabg.png",
    name: "李慧兰",
    meta: "女 · 58 岁 · 虚拟病人",
    disease: "冠心病 · 三支病变",
    procedure: "冠脉搭桥术（CABG）",
    points: ["术前评估清单自动核对", "体外循环 / OPCAB 路径对比", "乳内动脉桥决策要点提示"],
  },
  {
    img: "/cases/case-liver.png",
    name: "张启帆",
    meta: "男 · 52 岁 · 虚拟病人",
    disease: "右肝占位（HCC 可能）",
    procedure: "腹腔镜肝部分切除",
    points: ["Couinaud 分段定位演示", "残余肝体积评估提醒", "热缺血时间控制要点"],
  },
];

function WorkflowSection() {
  return (
    <section className="mx-auto mt-20 max-w-[1200px] px-5">
      <div className="mb-9 text-center">
        <div className="mb-2 text-[13px] font-semibold tracking-wide text-[var(--accent)]">
          一体化工作流
        </div>
        <h2 className="text-[26px] font-extrabold text-[var(--heading)] md:text-[30px]">
          从病历到手术方案，全程智能相伴
        </h2>
      </div>

      {/* 动态流程条 */}
      <div className="panel relative overflow-hidden p-7">
        <div className="absolute left-7 right-7 top-[74px] hidden h-[2px] bg-[var(--line)] md:block" />
        <div className="absolute left-7 right-7 top-[73px] hidden h-[3px] md:block">
          <span className="flow-dot absolute top-0 h-[3px] w-[10px] rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
        </div>
        <div className="grid gap-7 md:grid-cols-5">
          {WORKFLOW.map((w, i) => (
            <div key={w.title} className="relative text-center md:text-left">
              <div className="relative z-10 mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-[var(--line)] bg-[var(--panel-2)] text-xl md:mx-0">
                {w.icon}
              </div>
              <div className="mb-0.5 flex items-center gap-2 justify-center md:justify-start">
                <span className="text-[11px] font-bold text-[var(--accent)]">
                  0{i + 1}
                </span>
                <span className="text-[14.5px] font-bold text-[var(--heading)]">
                  {w.title}
                </span>
              </div>
              <div className="text-center text-[12.5px] text-[var(--muted)] md:text-left">
                {w.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section className="mx-auto mt-16 max-w-[1200px] px-5">
      <div className="grid gap-5 md:grid-cols-3">
        {/* 演示一：结构化方案 */}
        <div className="panel flex flex-col p-6">
          <div className="vp mb-4 h-[190px] overflow-hidden rounded-xl border border-[#1d2a47] bg-[#0a1322] p-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f87171]" />
              <span className="h-2 w-2 rounded-full bg-[#fbbf24]" />
              <span className="h-2 w-2 rounded-full bg-[#34d399]" />
              <span className="ml-2 text-[10.5px] text-[#8296b5]">手术方案 · AI 生成</span>
            </div>
            <div className="space-y-2">
              {[
                ["1", "建立气腹与穿刺置管"],
                ["2", "探查腹腔，定位阑尾"],
                ["3", "离断阑尾动脉与系膜"],
                ["4", "根部圈套器结扎切除"],
              ].map(([n, t], i) => (
                <div
                  key={n}
                  className="demo-step demo-step-1 flex items-center gap-2 rounded-md border border-[#1d2a47] bg-[#111b30] px-2.5 py-1.5"
                  style={{ animationDelay: `${i * 1.7}s` }}
                >
                  <span className="grid h-4.5 w-4.5 place-items-center rounded-full bg-[#153a52] text-[9px] font-bold text-[#2dd4bf]">
                    {n}
                  </span>
                  <span className="text-[11.5px] text-[#c6d3e8]">{t}</span>
                </div>
              ))}
            </div>
          </div>
          <h3 className="mb-1.5 text-[16px] font-bold text-[var(--heading)]">
            结构化手术方案
          </h3>
          <p className="text-[13px] leading-6 text-[var(--muted)]">
            AI 结合病历与手术知识库，输出含步骤、器械、风险对策与术后处理的完整规划，分钟级生成。
          </p>
        </div>

        {/* 演示二：3D 模拟 */}
        <div className="panel flex flex-col p-6">
          <div className="vp mb-4 grid h-[190px] place-items-center overflow-hidden rounded-xl border border-[#1d2a47] bg-gradient-to-b from-[#0a1322] to-[#070d18]">
            <div className="relative grid place-items-center">
              {/* CSS 心形（扁平） */}
              <div className="relative h-16 w-[72px]">
                <span className="absolute left-[18px] top-0 h-9 w-9 rounded-full bg-[#e05a6d]" />
                <span className="absolute right-[18px] top-0 h-9 w-9 rounded-full bg-[#e05a6d]" />
                <span className="absolute bottom-0 left-[6px] h-12 w-[60px] rotate-45 rounded-[10px] bg-[#e05a6d]" />
                <span className="absolute left-3 top-3 h-4 w-4 rounded-full bg-[#f0899a]" />
              </div>
              <span className="focus-ring absolute h-28 w-28 rounded-full border-2 border-[#2dd4bf]" />
              <span
                className="focus-ring absolute h-28 w-28 rounded-full border border-[#2dd4bf]"
                style={{ animationDelay: "1.8s" }}
              />
            </div>
            <div className="mt-1 text-[11px] text-[#8296b5]">
              人体层面 → 器官层面 · 自动运镜
            </div>
          </div>
          <h3 className="mb-1.5 text-[16px] font-bold text-[var(--heading)]">
            从人体到器官的 3D 模拟
          </h3>
          <p className="text-[13px] leading-6 text-[var(--muted)]">
            依据方案自动编排模拟脚本，体区定位后镜头飞向目标器官，分步演示操作要点与风险。
          </p>
        </div>

        {/* 演示三：AI 问答 */}
        <div className="panel flex flex-col p-6">
          <div className="vp mb-4 h-[190px] overflow-hidden rounded-xl border border-[#1d2a47] bg-[#0a1322] p-4">
            <div className="demo-bubble mb-2.5 flex justify-end">
              <span className="max-w-[80%] rounded-xl bg-gradient-to-br from-[#14508f] to-[#1a6a9e] px-3 py-1.5 text-[11.5px] text-white">
                这个器官的血液供应来自哪里？
              </span>
            </div>
            <div
              className="demo-bubble flex justify-start"
              style={{ animationDelay: "4.5s" }}
            >
              <span className="max-w-[88%] rounded-xl border border-[#1d2a47] bg-[#111b30] px-3 py-1.5 text-[11.5px] leading-5 text-[#c6d3e8]">
                心脏由左、右冠状动脉供血，前降支供应左室前壁……
                <span className="text-[#2dd4bf]">▌</span>
              </span>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[10.5px] text-[#8296b5]">
              <span className="rec-dot text-[#2dd4bf]">●</span> AI 医学导师 · 流式响应
            </div>
          </div>
          <h3 className="mb-1.5 text-[16px] font-bold text-[var(--heading)]">
            沉浸式学习问答
          </h3>
          <p className="text-[13px] leading-6 text-[var(--muted)]">
            问答自动关联当前浏览的 3D 结构，医学生在真实解剖场景中获得导师式讲解与引导。
          </p>
        </div>
      </div>
    </section>
  );
}

function CasesSection() {
  return (
    <section className="mx-auto mt-20 max-w-[1200px] px-5">
      <div className="mb-9 text-center">
        <div className="mb-2 text-[13px] font-semibold tracking-wide text-[var(--accent)]">
          虚拟病人案例
        </div>
        <h2 className="text-[26px] font-extrabold text-[var(--heading)] md:text-[30px]">
          看虚拟病人如何走完整个规划流程
        </h2>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {CASES.map((c) => (
          <div key={c.name} className="panel group overflow-hidden">
            <div className="vp relative h-[170px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.img}
                alt={`${c.disease} 插图`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                loading="lazy"
              />
              <span className="absolute left-3 top-3 rounded-md bg-[rgba(7,13,24,0.72)] px-2 py-1 text-[10.5px] font-semibold text-[#2dd4bf]">
                虚拟病例
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[15.5px] font-bold text-[var(--heading)]">
                  {c.name}
                </div>
                <div className="text-[11px] text-[var(--muted)]">{c.meta}</div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="chip !text-[var(--accent)]">{c.disease}</span>
                <span className="chip">{c.procedure}</span>
              </div>
              <ul className="mt-3.5 space-y-1.5">
                {c.points.map((p) => (
                  <li
                    key={p}
                    className="flex gap-2 text-[12.5px] leading-5 text-[var(--text)]"
                  >
                    <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 text-center">
        <Link href="/planning" className="btn btn-primary px-6 py-2.5 text-[13.5px]">
          在工作台中体验完整流程 →
        </Link>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      {/* 英雄区 */}
      <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-6 pt-12 md:grid-cols-[1.05fr_1fr] md:pt-16">
        <div>
          <div className="fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-1.5 text-xs text-[var(--muted)]">
            <span className="rec-dot text-[var(--accent)]">●</span>
            AI 驱动的虚拟手术规划平台
          </div>
          <h1 className="fade-up fade-up-1 mb-5 text-[34px] font-extrabold leading-[1.2] text-[var(--heading)] md:text-[44px]">
            让每一台手术
            <br />
            <span className="text-[var(--accent)]">规划于执行之前</span>
          </h1>
          <p className="fade-up fade-up-2 mb-8 max-w-[520px] text-[15px] leading-7 text-[var(--text)]">
            MedPlan Atlas 面向医院与医学院：输入病历与初步方案，AI 生成结构化手术规划，
            在 3D 人体上完成从体区到器官的模拟验证，经专家反馈持续迭代——并为医学生提供沉浸式解剖学习。
          </p>
          <div className="fade-up fade-up-3 mb-9 flex flex-wrap gap-3">
            <Link href="/planning" className="btn btn-primary px-6 py-3 text-[14px]">
              开始手术规划
            </Link>
            <Link href="/learning" className="btn px-6 py-3 text-[14px]">
              进入学习中心
            </Link>
          </div>
          <div className="fade-up fade-up-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="text-[22px] font-extrabold text-[var(--heading)]">
                  {s.num}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="float-soft">
          <HeroAnatomy />
        </div>
      </section>

      <WorkflowSection />
      <DemoSection />
      <CasesSection />

      {/* 底部 CTA */}
      <section className="mx-auto mt-20 max-w-[1200px] px-5 pb-16">
        <div className="panel flex flex-col items-center gap-5 px-8 py-11 text-center">
          <h2 className="text-[24px] font-extrabold text-[var(--heading)] md:text-[28px]">
            现在就为下一台手术，准备一份 AI 规划
          </h2>
          <p className="max-w-[560px] text-[13.5px] leading-6 text-[var(--muted)]">
            内置虚拟病人示例，两分钟即可体验「规划 → 模拟 → 反馈 → 迭代」的完整闭环。
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/planning" className="btn btn-primary px-7 py-3 text-[14px]">
              免费开始
            </Link>
            <Link href="/learning" className="btn px-7 py-3 text-[14px]">
              探索 3D 解剖
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
