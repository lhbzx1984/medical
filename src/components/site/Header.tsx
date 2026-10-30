"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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

function AccountMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const menu = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState("");

  // 站内跳转不会卸载顶栏，路由变化后收起菜单。
  useEffect(() => { menu.current?.removeAttribute("open"); }, [pathname]);

  const logout = async () => {
    setError("");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("退出失败，请重试");
      router.push("/login");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "退出失败，请重试"); }
  };

  return (
    <details ref={menu} className="relative">
      <summary className="btn cursor-pointer list-none !px-2.5 !py-1.5 text-[12px] sm:text-[13px]">账号 ▾</summary>
      <div className="panel absolute right-0 top-full z-50 mt-1 grid min-w-36 gap-1 p-2">
        <Link href="/account" className="btn !px-2.5 !py-1.5">账号设置</Link>
        <Link href="/admin/users" className="btn !px-2.5 !py-1.5">用户管理</Link>
        <Link href="/admin/knowledge" className="btn !px-2.5 !py-1.5">知识库</Link>
        <Link href="/login" className="btn !px-2.5 !py-1.5">登录</Link>
        <button className="btn !px-2.5 !py-1.5" onClick={() => void logout()}>退出</button>
        {error && <p role="alert" className="px-1 text-xs text-[var(--danger)]">{error}</p>}
      </div>
    </details>
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
          <AccountMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
