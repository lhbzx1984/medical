"use client";

import { useState } from "react";
import { SURFACE_REGION_GROUPS, POSTERIOR_REGION_GROUPS, type SurfaceRegion, type SurfaceSide } from "@/lib/surface-regions";

export default function SurfaceRegionPanel({ selected, onSelect, side, onSideChange }: { selected: SurfaceRegion | null; onSelect: (region: SurfaceRegion) => void; side: SurfaceSide; onSideChange: (side: SurfaceSide) => void }) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const groups = side === "front" ? SURFACE_REGION_GROUPS : POSTERIOR_REGION_GROUPS;
  const group = groups[groupIndex] ?? groups[0];
  return (
    <section aria-label="女性体表分区" className="pointer-events-auto absolute left-2 top-2 z-10 w-44 max-w-[55%] rounded-xl border border-white/20 bg-[#102031]/95 p-2 text-white shadow-lg sm:w-52">
      <button className="flex w-full items-center justify-between text-left text-xs font-semibold" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        体表分区 <span>{open ? "收起" : "展开"}</span>
      </button>
      {open && <>
        <div role="group" aria-label="体表视角" className="mt-2 grid grid-cols-2 gap-1">
          {(["front", "back"] as const).map((value) => <button key={value} aria-pressed={side === value} onClick={() => { setGroupIndex(0); onSideChange(value); }} className={`rounded-md px-1 py-1 text-xs ${side === value ? "bg-teal-600" : "bg-white/10"}`}>{value === "front" ? "正面" : "背面"}</button>)}
        </div>
        <p className="my-2 text-[10px] leading-4 text-slate-300">区域位置和线条为示意，非精确边界。</p>
        <label className="sr-only" htmlFor="surface-region-group">选择身体部位</label>
        <select id="surface-region-group" value={groupIndex} onChange={(event) => setGroupIndex(Number(event.target.value))} className="mb-2 w-full rounded-md border border-white/20 bg-[#1b3045] px-2 py-1 text-xs text-white">
          {groups.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
        </select>
        <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto sm:max-h-56">
          {group.regions.map((region) => <button key={region.name} onClick={() => { onSelect(region); if (window.matchMedia("(max-width: 639px)").matches) setOpen(false); }} aria-pressed={selected?.name === region.name} className={`rounded-md px-1.5 py-1.5 text-left text-[11px] ${selected?.name === region.name ? "bg-teal-500 text-white" : "bg-white/10 hover:bg-white/20"}`}>{region.name}</button>)}
        </div>
      </>}
    </section>
  );
}
