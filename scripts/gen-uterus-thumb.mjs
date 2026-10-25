// 生成子宫/附件教学插图缩略图（agnes-image-2.5-flash）→ public/cases/uterus-thumb.png
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const KEY = env.match(/AGNES_API_KEY=(.+)/)?.[1]?.trim();
const BASE = env.match(/AGNES_API_BASE_URL=(.+)/)?.[1]?.trim() ?? "https://apihub.agnes-ai.com";

const out = new URL("../public/cases/uterus-thumb.png", import.meta.url);
if (fs.existsSync(out)) { console.log("exists, skip"); process.exit(0); }

const res = await fetch(`${BASE}/v1/images/generations`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "agnes-image-2.5-flash",
    prompt:
      "女性内生殖器官医学教学插图：子宫（正面视角，梨形肌性器官）与双侧卵巢、输卵管，输卵管自然弯曲连接子宫与卵巢，扁平化现代医学插画风格，器官为粉红色调、色彩饱满，浅米白色干净背景，居中构图，专业医学教育用途，画面中不出现任何文字",
    size: "1K",
    ratio: "1:1",
    extra_body: { response_format: "url" },
  }),
  signal: AbortSignal.timeout(300_000),
});
if (!res.ok) { console.error("HTTP", res.status, (await res.text()).slice(0, 200)); process.exit(1); }
const data = await res.json();
const url = data?.data?.[0]?.url;
if (!url) { console.error("no url"); process.exit(1); }
const img = await fetch(url, { signal: AbortSignal.timeout(120_000) });
fs.mkdirSync(new URL("../public/cases", import.meta.url), { recursive: true });
fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));
console.log("OK", fs.statSync(out).size, "bytes");
