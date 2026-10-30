"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import AuthControls from "./AuthControls";

const NAVS = [
  { href: "/", label: "首页" },
  { href: "/planning", label: "手术规划" },
  { href: "/learning", label: "学习中心" },
];

function subscribeTheme(callback: () => void) {
  window.addEventListener("medplan-theme", callback);
  return () => window.removeEventListener("medplan-theme", callback);
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme,
    () => document.documentElement.dataset.theme ?? "dark", () => "dark");

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event("medplan-theme"));
    try {
      localStorage.setItem("mp-theme", next);
    } catch {}
  };

  return (
    <button
      className="btn !px-2.5 !py-1.5"
      onClick={toggle}
      title={theme === "light" ? "切换到夜间模式" : "切换到日间模式"}
      aria-label="切换主题"
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-2 sm:gap-6 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-base font-bold text-[var(--accent-contrast)]">
            ⚕
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-[15px] font-bold text-[var(--heading)]">MedPlan Atlas</div>
            <div className="text-[10.5px] text-[var(--muted)]">智能手术规划与医学教学平台</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {NAVS.map((n) => {
            const active =
              n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-2 py-1.5 text-[12px] transition-colors sm:px-3.5 sm:text-[13.5px] ${
                  active
                    ? "bg-[var(--chip-bg)] !text-[var(--accent)] font-semibold"
                    : "text-[var(--muted)] hover:text-[var(--heading)]"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <AuthControls />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
