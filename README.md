# MedPlan Atlas · 医学手术规划智能体系统

基于两个开源 3D 解剖项目（[lhbzx1984/human-atlas](https://github.com/lhbzx1984/human-atlas) 与
[thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy)）的资产，融合 **Agnes 大模型**构建的
医学手术规划与教学智能体系统。

> ⚠️ 本系统为教学演示用途，所有 AI 生成内容不构成临床决策依据。

2026-10-30 第二轮修复说明见 [`mackdown.md`](mackdown.md)，保留原审查 20 项问题，并补充本轮修复、未修改事项和逐行增删补丁。[全部文件改动清单](../审查结果/第二轮验证-20261030/全部改动清单.md) 分别标记累计和本轮状态。本项目继续使用现有 Next.js 架构。

## 功能总览

### 功能一：术前手术方案规划（`/planning`）

完整的智能体工作流闭环：

```
病历 + 初步方案录入
        │
        ▼
手术知识库检索增强（可插拔接口）──► Agnes(agnes-2.5-flash) 生成结构化手术规划
        │                              （术式/麻醉/体位/入路/器械/分步骤/风险对策/术后处理）
        ▼
自动编排 3D 模拟脚本（人体层面 → 器官层面，含每步器械与动作类型）
        │
        ▼
3D 模拟播放：患部聚焦 + 切口定位环 + 手术器械操作动画（进入→操作→退出）
        │             右侧步骤栏同步展示每步解说、器械清单与操作类型
        ▼
专家提交反馈 ──► AI 修订方案（新版本 + 修订说明）──► 重新编排模拟
        │
        ▼
版本全程可追溯（v1 → v2 → …），手术指导顾问（AI）可随时答疑
```

- **3D 模拟**：人体层面只聚焦患部器官（切口定位环标记术区）；器官层面按动作类型
  驱动程序化手术器械（手术刀/电刀/止血钳/手术剪/持针器/穿刺器/腹腔镜/冲洗吸引器/
  标本袋/纱布）的进入-操作-退出动画，12 种动作（切开、电凝止血、缝合、冲洗…）
- 内置「急性化脓性阑尾炎」示例病例，一键体验完整流程
- 版本对比：每个版本记录来源（AI 生成 / 专家修订）、引用的知识库条目、修订说明

### 功能二：医学学习中心（`/learning`）

- **全身概览**：男女分视角的 2D 人体解剖图与器官标注；点击查看结构简介，已有模型可进入特写。
  胃使用由图谱网格转换的独立特写模型；乳腺保留自身名称和导师上下文，尚无独立特写模型时明确提示
- **器官特写**：脑 / 眼球 / 心脏 / 肺 / 肝 / 胰 / 肾 / 肠 / 皮肤组织 / 子宫附件（女性），360° 观察
- **精细人体图谱**：BodyParts3D 4.0 的 **2,234 个可选择结构**，15 大解剖系统过滤、
  按名称/概念搜索、爆炸视图、点击查看结构详情（GPU 逐结构控制，15 个 draw call）
- **AI 医学导师**（agnes-2.5-flash 流式对话）：问答自动关联当前浏览的 3D 结构
- **教学插图生成**：agnes-image-2.5-flash 一键生成当前器官的教学插图

> 界面支持**日间 / 夜间双主题**（顶栏切换，跟随系统偏好并本地记忆）；
> 3D 视口始终采用深色观感，符合医学影像工作站的使用惯例。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ TypeScript + Tailwind CSS 4 |
| 3D | Three.js + @react-three/fiber + @react-three/drei |
| 解剖数据 | BodyParts3D 4.0（2,234 网格，CC BY 4.0）+ 器官 GLTF（Meshopt） |
| 大模型 | agnes-2.5-flash（对话/规划/模拟编排）、agnes-image-2.5-flash（插图） |
| 身份与数据库 | Supabase Auth + Supabase PostgreSQL；服务端按账号隔离病例，关联写入通过事务 RPC 完成 |

## 快速开始

```bash
npm ci
npm run dev        # http://localhost:3000
```

生产部署：

```bash
npm run build
npm run start
```

### 环境变量（`.env.local`）

```bash
# Agnes API（AI 功能需要；填写自己的服务端密钥）
AGNES_API_KEY=your-agnes-key
AGNES_API_BASE_URL=https://apihub.agnes-ai.com

# Supabase Auth 与持久化（完整业务流程需要）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 手术知识库检索器（预留接口，当前：keyword）
KNOWLEDGE_RETRIEVER=keyword

# 仅生产模式下的本地演示可显式开启；进程重启后数据丢失
# ALLOW_MEMORY_STORE=true
```

**安全说明**：API Key 只在服务端（Next.js API Route）使用，不会打包进浏览器代码；
使用 Supabase 时服务端以 SERVICE_ROLE_KEY 直连，浏览器不直接访问数据库。
不要给服务端密钥加 `NEXT_PUBLIC_` 前缀，也不要提交 `.env.local`。修改配置后重启服务。

没有数据库配置时，开发模式仍可使用原有内存存储；生产模式默认拒绝静默降级。内存模式也不会绕过登录要求，因此没有 Supabase Auth 配置时只能浏览公开解剖页面，不能完成病例与 AI 流程。`/api/health` 只反映配置存在情况，不代表真实服务调用已成功。

### 账号与权限

在自己的 Supabase Auth 中创建并启用邮箱账号，通过网页顶栏「登录」使用。网页没有开放注册或修改角色入口。

- 默认账号为 `user`，可创建和访问自己的病例，使用学习对话、指导顾问及插图。
- 专家账号由管理员通过可信的服务端管理渠道设置 `app_metadata.role = "expert"`；可对自己有访问权的病例提交修订。
- 维护账号设置 `app_metadata.role = "admin"`；额外允许知识库新增，并可执行专家修订。
- 角色只读取 Supabase 服务端验证的 `app_metadata`，客户端传入的专家姓名或 `user_metadata.role` 不授予权限。当前访问范围仍限病例所有者，尚未提供跨账号专家协作授权。

登录令牌保存在 HttpOnly、SameSite=Lax Cookie 中，生产模式附加 Secure，部署应使用 HTTPS。当前会话过期后需要重新登录，尚未实现自动刷新会话。

反向代理需保留浏览器请求的 `Host`，并正确设置 `X-Forwarded-Proto`；写入接口按公开主机与协议核验来源，避免内部主机名造成正常登录失败。

### Supabase 建库

在 Supabase Dashboard → SQL Editor 中执行 [`supabase/schema.sql`](supabase/schema.sql)
（原九张业务表，另有 `rate_limit_windows` 限流表、所有者字段、版本唯一索引、RLS 读取策略及服务端事务 RPC）。SQL 必须与本轮代码配套应用。

已有数据库先备份并检查：脚本不会自动删除重复版本，发现重复的 `(plan_id, version)` 会中止整次事务；旧病例、会话和图像的 `owner_id` 不会被自动认领，必须由管理员核实后回填。尚未归属的旧病例不会出现在任意账号列表中。不要为恢复显示而把全部旧数据分配给任意用户。

完成建库并填写 `.env.local` 后，导入原有八条知识种子：

```bash
npm run seed:knowledge
```

导入使用固定 ID，重复执行不重复插入，也不覆盖已审核的同 ID 内容。脚本输出的处理条数不等于新插入条数，执行后仍应核对知识库内容。若旧库曾用其他 ID 手工导入同名条目，需先人工核对，脚本不自动删除它们。

## 手术知识库接口（预留设计）

上层规划流程只依赖检索器接口（`src/lib/knowledge/index.ts`）：

```ts
export interface KnowledgeRetriever {
  readonly name: string;
  retrieve(query: KnowledgeQuery): Promise<KnowledgeEntry[]>;
}
```

- 当前默认实现 `KeywordRetriever`（中文 2-gram + 词项重叠评分，零依赖）
- 接入向量检索：启用 pgvector（schema 中已预留 `embedding vector(1536)` 列）→
  实现 `retrieve()`（Agnes embedding 或外部 RAG）→ 在 `REGISTRY` 注册 →
  设置 `KNOWLEDGE_RETRIEVER=vector` 即可切换，上层无需改动
- 登录后可通过 `GET /api/knowledge` 查询，`POST /api/knowledge` 仅维护账号可用；内置 8 条种子知识
  （阑尾切除 / CABG 术前评估 / 无菌原则 / ASA 分级 / 肝切除解剖 / 开颅体位 / 肾部分切除 / WHO 核查表）

## API 一览

| 路由 | 说明 |
| --- | --- |
| `GET/POST/DELETE /api/auth` | 登录状态 / 邮箱密码登录 / 退出 |
| `POST /api/chat` | 登录后流式对话（SSE）；`mode: learning \| guidance`。指导模式传 `context.planId`、`context.planVersion`，服务端按权限读取对应版本 |
| `POST /api/image` | 登录后 agnes-image-2.5-flash 图像生成 |
| `GET/POST /api/plans` | 登录账号自己的规划列表 / 创建病例（病人+初步方案） |
| `GET /api/plans/[id]` | 自己的规划详情（版本历史+反馈+模拟记录）；不存在或无权访问返回 404 |
| `POST /api/plans/[id]/generate` | 校验完整 AI 方案后，将新版本与模拟一次提交；并发基础版本过期返回 409 |
| `POST /api/plans/[id]/feedback` | 专家或维护账号提交 `comment`、可选 `baseVersion`，修订成功后原子保存反馈、方案与模拟 |
| `GET/POST /api/knowledge` | 登录查询 / 维护账号新增 |
| `GET /api/health` | 配置状态（存储类型 / 模型 / 检索器） |

JSON 请求体限制 128 KB，并按字段检查类型、长度与枚举。匿名访问受保护接口返回 401，角色不足返回 403，超限返回 429。每账号每 60 秒：病例创建 10 次、生成 5 次、修订 5 次、对话 20 次、插图 5 次、知识新增 10 次；数据库模式使用共享计数器。每次 AI 调用有 240 秒上限，生成/修订的两轮调用从路由入口共用 270 秒预算，并接收客户端取消信号；已开始的对话流通过 SSE 报错。登录服务故障返回 503、登录限流返回 429，不会伪装为账号密码错误。

## 项目结构

```
src/
  app/
    page.tsx                    # 首页
    planning/page.tsx           # 功能一：手术规划工作台
    learning/page.tsx           # 功能二：学习中心
    api/…                       # 上表所有路由（服务端持有 API Key）
  components/
    planning/                   # 工作台 / 病例表单 / 方案文档
    sim/                        # 模拟舞台 / 器官模型 / 人体概览场景
    atlas/                      # 精细人体图谱（自定义 Shader + GPU 逐结构控制）
    learn/                      # 学习中心
    chat/                       # 流式对话面板（SSE + Markdown）
    site/AuthControls.tsx       # 复用 Supabase Auth 的登录入口
  lib/
    agnes.ts                    # Agnes API 服务端集成（chat / image / JSON 模式）
    auth.ts                     # 服务端身份、角色及 Cookie 校验
    validation.ts               # 请求和 AI 方案的共享运行时校验
    http.ts                     # 统一错误返回与限频调用
    plan-generation.ts          # 原有生成与修订流程共用的编排逻辑
    planning-prompt.ts          # 规划生成 / 专家修订 / 模拟编排提示词
    organ-models.ts             # 器官注册表（GLB / 解剖位置 / focusOrgan 容错映射）
    knowledge/                  # 知识库接口 + 关键词检索器 + 种子数据
    store/                      # DataStore 抽象：Supabase / 内置演示存储
supabase/schema.sql             # 建库、升级和事务 RPC 脚本
scripts/seed-knowledge.mjs       # 复用原知识源的幂等导入
tests/                          # 输入、存储、UI、图谱、模拟与供应商回归
mackdown.md                     # 本轮修复与待办技术文档
public/
  atlas/                        # BodyParts3D atlas.json + 15 个网格批次（gzip）
  models/                       # 9 个器官 GLB（Meshopt）+ stomach.glb（由图谱 FJ2564 转换，未压缩）
  anatomy/                      # 器官缩略图
```

## 3D 渲染说明

- **器官模型**：GLB 使用 Meshopt 压缩，`useGLTF(url, false, true)` 加载并归一化尺寸。
  源模型材质 `metalness=1`（金属度），在无环境贴图的场景中会渲染成黑色，
  加载后统一克隆材质并置 `metalness=0` 还原漫反射色彩
- **全身概览**：器官按解剖位置（脚底 y=0，身高 1.78m）摆放；人形参照轮廓为程序化
  "全息"旋转体 + 菲涅尔边缘光（`BodyOutline`，skin.glb 实为皮肤显微组织切片，不作外壳）
- **精细图谱**：每个 chunk（15 个）合并为一个 Mesh，顶点携带全局结构编号；
  `DataTexture(256×16 RGBA float)` 在 GPU 上控制每个结构的可见性 / 高亮 / 调暗 /
  透明度 / 爆炸位移；体表系统采用 4×4 Bayer 抖动点阵半透明呈现，可透视内部结构且无排序伪影；
  点击通过 `face.a → partId` 反查结构，射线拾取同步过滤隐藏结构并应用同一爆炸位移；
  chunk 按需并行下载并渐进上屏，失败缓存会清除，可在页面重试
- **注意**：部分浏览器/嵌入式预览在窗口被遮挡时会节流 requestAnimationFrame，
  3D 画布在窗口不可见时不会重绘——切到可见窗口即可恢复

## 验证与完整流程验收

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

截至第二轮，54 项自动回归全部通过，ESLint 无错误或警告，独立类型检查及生产构建通过；覆盖匿名访问、输入与方案校验、原子提交及并发冲突、数据库错误、会话隔离、跨标签性别状态、器官标注、图谱重试和拾取、模拟进度及末步暂停恢复。实际验证记录与完整链路范围见 [`mackdown.md`](mackdown.md)。测试加载器仍会显示既有 Three.js CommonJS 废弃提示，生产代码使用 ESM。

本地完整链路测试（仅合成数据，不访问真实服务）：

```bash
# 终端一：先构建，再启动本地模拟 Auth/REST/RPC/AI 和生产网站
npm run build
node tests/e2e-server.cjs

# 终端二：运行真实 HTTP 流程与故障场景，完成后在终端一按 Ctrl+C 关闭
npm run test:e2e
```

网站端口为 `4401`，模拟服务端口为 `4402`，均仅监听 `127.0.0.1`；首次测试会清空该模拟服务自己的测试数据。17 组流程检查已通过。可在两个终端分别设置 `$env:MEDPLAN_TEST_OUTPUT='../审查结果/第二轮验证-20261030'`，将结果写入本轮目录，保留此前证据。

数据库另有 32 项独立检查：直接运行 `schema.sql`，用本地 PostgreSQL WASM 引擎验证事务回滚、唯一索引、所有者、RLS、RPC 权限与迁移保护。临时引擎放在项目外，未改应用依赖：

```powershell
npm install --prefix "../审查结果/第二轮验证-20261030/sql-runtime" --save-exact @electric-sql/pglite@0.5.13
node tests/postgres-check.mjs --pglite-dir "../审查结果/第二轮验证-20261030/sql-runtime" --output "../审查结果/第二轮验证-20261030"
```

本地 HTTP 夹具使用 MemoryStore 模拟数据库返回；独立 SQL 检查使用单连接 PostgreSQL。二者通过均不能证明真实 Supabase、JWT 签名或多实例并发已经联通。390/768/1024/1280 像素浏览器检查已执行；1024 下导师/顾问改为按钮打开，1280 起固定显示，避免挤压 3D 视口。手机真机触控与所有 GPU 仍待验收。

真实服务验收需在完成自己的 Auth、SQL 和知识种子配置后执行：登录 → 新建合成病例 → 生成 v1 → 检查对应模拟 → 专家修订 v2 → 切回 v1 检查顾问上下文 → 学习问答及插图 → 用另一个账号确认看不到该病例。再核验错误输入、失败重试和限流。原 README 中的真实 Agnes 耗时记录属于此前开发描述，本轮没有凭证，不能据此认定修复后的真实云端链路已通过。

## 版权与致谢

- [lhbzx1984/human-atlas](https://github.com/lhbzx1984/human-atlas)（MIT）：BodyParts3D 网格管线与 atlas 数据
- [thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy)：器官 GLB 模型与器官图集
- [BodyParts3D 4.0](https://lifesciencedb.jp/bp3d/)：解剖数据，**CC BY 4.0**（redistributing 时请保留署名）
- [DBCLS BodyParts3D](https://lifesciencedb.jp/bp3d/) 提供 Anatomography 数据
- 胃模型：BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International；由 `scripts/extract-stomach-glb.mjs` 转换（格式转换、法线重算），男性参考解剖的简化网格，仅作教学示意

原创应用代码遵循 MIT 许可；解剖数据遵循其自身 CC BY 4.0 许可。
