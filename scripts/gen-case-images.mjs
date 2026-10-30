// 生成虚拟病人案例插图（agnes-image-2.5-flash）→ public/cases/*.png
// 用法: node scripts/gen-case-images.mjs
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const KEY = env.match(/AGNES_API_KEY=(.+)/)?.[1]?.trim();
const BASE = env.match(/AGNES_API_BASE_URL=(.+)/)?.[1]?.trim() ?? "https://apihub.agnes-ai.com";
if (!KEY) { console.error("AGNES_API_KEY missing"); process.exit(1); }

const CASES = [
  {
    file: "case-appendicitis.png",
    prompt:
      "现代医学教学插图：腹腔镜阑尾切除术，腹腔内发炎肿胀的阑尾特写与两支腹腔镜手术器械，扁平化矢量插画风格，蓝绿色调为主，深色干净背景，专业医学教育用途，构图简洁，画面中不出现任何文字",
  },
  {
    file: "case-cabg.png",
    prompt:
      "现代医学教学插图：心脏冠状动脉搭桥手术示意，心脏正面与三支病变冠脉及血管桥，扁平化矢量插画风格，深红与蓝色搭配，深色干净背景，专业医学教育用途，构图简洁，画面中不出现任何文字",
  },
  {
    file: "case-liver.png",
    prompt:
      "现代医学教学插图：人体肝脏解剖与右叶占位病灶，腹腔腹腔镜探查视角，扁平化矢量插画风格，暖橙与青色搭配，深色干净背景，专业医学教育用途，构图简洁，画面中不出现任何文字",
  },
];

fs.mkdirSync(new URL("../public/cases", import.meta.url), { recursive: true });

for (const c of CASES) {
  const out = new URL("../public/cases/" + c.file, import.meta.url);
  if (fs.existsSync(out)) { console.log("skip", c.file); continue; }
  try {
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "agnes-image-2.5-flash",
        prompt: c.prompt,
        size: "2K",
        ratio: "16:9",
        extra_body: { response_format: "url" },
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const url = data?.data?.[0]?.url;
    if (!url) throw new Error("no url in response");
    const img = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!img.ok) throw new Error(`image download HTTP ${img.status}`);
    fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));
    console.log("OK", c.file, fs.statSync(out).size, "bytes");
  } catch (e) {
    console.error("FAIL", c.file, e.message);
  }
}
console.log("DONE");
