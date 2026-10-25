"use client";

// 2D 解剖插画的结构补充覆盖层（扁平风格 SVG）。
// 男性插画头部为空白轮廓 → 叠加大脑；女性插画盆腔缺子宫 → 叠加子宫附件。
// 坐标按 anatomy-male.png / anatomy-female.png（3:4）人工校准。

export function BrainOverlay() {
  return (
    <svg
      viewBox="0 0 100 84"
      className="absolute"
      style={{ left: "42%", top: "1.8%", width: "15.5%", opacity: 0.96 }}
    >
      <ellipse cx="34" cy="42" rx="27" ry="31" fill="#e598a3" />
      <ellipse cx="66" cy="42" rx="27" ry="31" fill="#e598a3" />
      <path d="M50 12 L50 74" stroke="#c96a78" strokeWidth="3.5" fill="none" />
      <path
        d="M40 24 q10 6 2 14 q-8 7 3 13 M62 20 q-10 7 -2 15 q8 7 -3 13"
        stroke="#cf7c88"
        strokeWidth="2.6"
        fill="none"
      />
    </svg>
  );
}

export function UterusOverlay() {
  return (
    <svg
      viewBox="0 0 100 96"
      className="absolute"
      style={{ left: "40.5%", top: "67%", width: "19%", opacity: 0.97 }}
    >
      <path
        d="M38 26 C24 16, 12 24, 13 40"
        stroke="#e08a9a"
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M62 26 C76 16, 88 24, 87 40"
        stroke="#e08a9a"
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="14" cy="45" rx="8" ry="10" fill="#f0d0c8" />
      <ellipse cx="86" cy="45" rx="8" ry="10" fill="#f0d0c8" />
      <path
        d="M37 25 C37 12, 63 12, 63 25 C63 42, 57 56, 50 61 C43 56, 37 42, 37 25 Z"
        fill="#d4708a"
      />
      <path d="M43 59 L57 59 L54 82 L46 82 Z" fill="#c66a80" />
      <path d="M46 88 L54 88 L53 95 L47 95 Z" fill="#d8a49e" />
    </svg>
  );
}
