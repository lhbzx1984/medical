// 生成首页 2D 人体解剖插画（agnes-image-2.5-flash）→ public/cases/hero-anatomy.png
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const KEY = env.match(/AGNES_API_KEY=(.+)/)?.[1]?.trim();
const BASE = env.match(/AGNES_API_BASE_URL=(.+)/)?.[1]?.trim() ?? "https://apihub.agnes-ai.com";

const out = new URL("../public/cases/hero-anatomy.png", import.meta.url);
if (fs.existsSync(out)) { console.log("exists, skip"); process.exit(0); }

const res = await fetch(`${BASE}/v1/images/generations`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "agnes-image-2.5-flash",
    prompt:
      "完整人体正面解剖医学插图：站立男性人体，半透明皮肤透视显示内部器官——大脑、心脏、双肺、肝脏、胃、肾脏、小肠大肠，器官色彩鲜明饱满（心红色、肺粉色、肝棕红、肠道橙黄），人体轮廓边缘发出淡蓝色光晕，扁平化现代医学插画风格，纯深藏青色干净背景，居中垂直构图，器官位置符合真实解剖学，画面中不出现任何文字与标注线",
    size: "2K",
    ratio: "3:4",
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
