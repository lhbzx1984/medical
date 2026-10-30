// 生成女性 2D 人体解剖插画（agnes-image-2.5-flash）→ public/cases/anatomy-female.png
// 男性复用 hero-anatomy.png → anatomy-male.png
import fs from "node:fs";

const casesDir = new URL("../public/cases/", import.meta.url);
fs.mkdirSync(casesDir, { recursive: true });

// 男性：复用首页已生成的插画
fs.copyFileSync(new URL("../public/cases/hero-anatomy.png", import.meta.url), new URL("anatomy-male.png", casesDir));
console.log("male: copied");

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const KEY = env.match(/AGNES_API_KEY=(.+)/)?.[1]?.trim();
const BASE = env.match(/AGNES_API_BASE_URL=(.+)/)?.[1]?.trim() ?? "https://apihub.agnes-ai.com";

const out = new URL("anatomy-female.png", casesDir);if (fs.existsSync(out)) { console.log("female exists, skip"); process.exit(0); }

const res = await fetch(`${BASE}/v1/images/generations`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "agnes-image-2.5-flash",
    prompt:
      "完整女性人体正面解剖医学插图，必须包含以下解剖元素：1. 头部颅骨内有粉色大脑；2. 胸部有明显的女性乳房轮廓（左右两个半球形隆起）；3. 胸腔内红色心脏与粉色双肺；4. 腹部棕红色肝脏与橙色小肠大肠；5. 盆腔中央 clearly visible 粉红色梨形子宫，两侧各一个白色椭圆形卵巢，输卵管连接子宫与卵巢。半透明浅蓝皮肤，人体轮廓边缘发出淡蓝色光晕，扁平化现代医学插画风格，纯深藏青色干净背景，居中垂直构图，画面中不出现任何文字",
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
fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));
console.log("OK", fs.statSync(out).size, "bytes");
