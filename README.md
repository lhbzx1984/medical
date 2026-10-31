# MedPlan Atlas · 医学手术规划智能体系统

基于两个开源 3D 解剖项目（[lhbzx1984/human-atlas](https://github.com/lhbzx1984/human-atlas) 与
[thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy)）的资产，融合 **Agnes 大模型**构建的
医学手术规划与教学智能体系统。

> ⚠️ 本系统为教学演示用途，所有 AI 生成内容不构成临床决策依据。

2026-10-30 的合并说明见 [`mackdown.md`](mackdown.md)：把远程 `main`（登录、行级安全、原子版本、AI 配额、病例管理、知识库管理、学习问答）与本地最终版（器官模型与图谱位置、模拟进度、学习中心、胃 3D 模型、输入与 AI 方案校验）合并为一个版本，逐项标明修改与未修改、验证结果和已知限制；逐文件清单见 [`docs/merge-ledger-20261030.md`](docs/merge-ledger-20261030.md)，各轮验证证据的脱敏副本收录在 [`docs/evidence/`](docs/evidence/)。本项目继续使用现有 Next.js 架构。

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
- 病例列表支持按患者姓名、最新诊断或方案名称搜索，并按方案状态和更新日期筛选，可编辑病例资料及归档和恢复病例；可在病例历史中查看最近 100 次修改前的资料
- 内置「急性化脓性阑尾炎」示例病例，一键体验完整流程
- 版本对比：选择两个版本并排查看发生变化的方案字段；每个版本记录来源、引用的知识库条目和修订说明
- 可对最新版本确认定稿；修改病例或重新生成前须先撤销定稿
- 可打开所选版本的打印页面，通过浏览器打印或保存为 PDF

### 功能二：医学学习中心（`/learning`）

- **全身概览**：在男女 2D 解剖图与 3D 器官同屏间切换；3D 支持旋转、缩放、显示标注和选择器官，已有模型可进入特写。器官位置为教学示意，可能互相遮挡或重叠。
  胃使用由图谱网格转换的独立特写模型；乳腺保留自身名称和导师上下文，尚无独立特写模型时明确提示
- **器官特写**：脑 / 眼球 / 心脏 / 肺 / 肝 / 胰 / 肾 / 肠 / 皮肤组织 / 子宫附件（女性），360° 观察
- **精细人体图谱**：BodyParts3D 4.0 的 **2,234 个可选择结构**，15 大解剖系统过滤、
  按名称/概念搜索、爆炸视图、点击查看结构详情（GPU 逐结构控制，15 个 draw call）
- **学习自测**：对当前选中的器官练习系统归属和英文名称，按账号保存最近答题及错题记录
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
| 数据库 | Supabase（用户认证及持久化存储） |

## 快速开始

```bash
npm ci
npm run dev        # http://localhost:3000
npm test           # 单元与回归测试，含在内存数据库（PGlite）中执行 supabase/schema.sql 的 SQL 测试
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

# Supabase：使用项目 URL 和 anon/publishable key，勿使用 service_role key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
# 仅管理员账号管理需要；仅在服务器配置，绝不暴露给浏览器
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 手术知识库检索器（预留接口，当前：keyword）
KNOWLEDGE_RETRIEVER=keyword
```

**安全说明**：业务数据访问使用当前登录用户的会话和匿名密钥，行级安全按病例归属限制访问；账号管理接口仅在服务器完成管理员权限检查后使用 service_role 密钥访问 Supabase Auth。服务密钥不可放入客户端变量。

反向代理需保留浏览器请求的 `Host`，并正确设置 `X-Forwarded-Proto`；写入接口按公开主机与协议核验来源，避免内部主机名造成正常登录失败。不要给服务端密钥加 `NEXT_PUBLIC_` 前缀，也不要提交 `.env.local`；修改配置后重启服务。

### Supabase 建库与登录

新数据库执行 [`supabase/schema.sql`](supabase/schema.sql)。已有数据库按顺序执行
[`202610300001_enable_rls.sql`](supabase/migrations/202610300001_enable_rls.sql) 和
[`202610300002_user_isolation.sql`](supabase/migrations/202610300002_user_isolation.sql) 和
[`202610300003_atomic_revisions.sql`](supabase/migrations/202610300003_atomic_revisions.sql) 和
[`202610300004_ai_quotas.sql`](supabase/migrations/202610300004_ai_quotas.sql) 和
[`202610300005_edit_case.sql`](supabase/migrations/202610300005_edit_case.sql) 和
[`202610300006_archive_cases.sql`](supabase/migrations/202610300006_archive_cases.sql) 和
[`202610300007_finalize_plan.sql`](supabase/migrations/202610300007_finalize_plan.sql) 和
[`202610300008_knowledge_sources.sql`](supabase/migrations/202610300008_knowledge_sources.sql) 和
[`202610300009_learning_quiz.sql`](supabase/migrations/202610300009_learning_quiz.sql) 和
[`202610300010_admin_knowledge.sql`](supabase/migrations/202610300010_admin_knowledge.sql) 和
[`202610300011_admin_audit.sql`](supabase/migrations/202610300011_admin_audit.sql) 和
[`202610300012_assign_legacy_cases.sql`](supabase/migrations/202610300012_assign_legacy_cases.sql) 和
[`202610300013_case_diagnosis.sql`](supabase/migrations/202610300013_case_diagnosis.sql)。

在 Supabase Auth 中关闭公开注册，由管理员创建用户，用户通过 `/login` 登录，并可在 `/account` 使用当前密码修改密码。数据库管理员完成初始管理员授权后，管理员可在 `/admin/users` 创建账号、重置密码、禁止或允许新登录。禁止新登录不会撤销已存在的会话，不可视为立即移除现有访问权限。账号管理操作记录在 `medplan_admin_audit`，不记录密码。旧病历的 `owner_id` 默认为空，
任何普通用户都无法访问；管理员核实用户 ID 后，可通过 `/admin/unassigned` 逐条分配，系统会记录操作。知识库供登录用户读取，管理员可在 `/admin/knowledge` 维护内容。首次授权需要数据库管理员将指定的 `auth.users.id` 插入 `public.medplan_admins`；不要向不可信账号授予该权限。应用不再提供无登录的内存演示存储。
执行迁移前应备份数据库并核查现有授权；上线前应使用两个测试账号验证跨账号访问被拒绝。
第三个迁移会为方案版本和模拟建立唯一索引。如果历史数据含重复的 `(plan_id, version)`，
迁移会失败；请先核实并处理重复数据，不要直接删除未经确认的记录。版本、模拟和专家反馈
现在一起保存，遇到并发修改时请求返回 409，刷新方案后可重试。
AI 请求按用户使用数据库共享的固定 10 分钟窗口限额：对话 20 次、图像 5 次、
方案生成或反馈修订合计 5 次；超过时返回 429。限额在调用上游模型之前扣除，失败也计入。
编辑病例不会改变已有方案版本；编辑期间正在生成的方案会因病例状态变化而要求重新生成。

完成建库并填写 `.env.local` 后，可导入内置的八条知识种子：

```bash
npm run seed:knowledge
```

导入使用固定 ID，重复执行不重复插入，也不覆盖同 ID 的已有内容。种子条目导入后均为“未审核”，检索器只使用“已审核”条目：管理员需在 `/admin/knowledge` 核实来源并逐条审核后，才会进入方案生成。该脚本使用你自己的 `SUPABASE_SERVICE_ROLE_KEY`，只在本机终端运行，不要放进网站环境变量或提交到仓库。旧库若曾用其他 ID 手工导入同名条目，需先人工核对，脚本不自动删除。

## 手术知识库接口（预留设计）

上层规划流程只依赖检索器接口（`src/lib/knowledge/index.ts`）：

```ts
export interface KnowledgeRetriever {
  readonly name: string;
  retrieve(query: KnowledgeQuery): Promise<KnowledgeEntry[]>;
}
```

- 当前默认实现 `KeywordRetriever`（中文 2-gram + 词项重叠评分，零依赖），仅检索已审核条目
- 管理员在知识库管理页面维护 `source_name`、`source_url`、`source_version`、`reviewed_by` 和 `reviewed_at`；核实后将 `review_status` 设为 `approved`。审核通过要求来源名称、审核人和审核时间。旧条目默认为未审核，不参与检索。
- 新方案保存所引用知识内容及来源信息的快照；旧方案只有条目标题，不会虚构出处。
- 接入向量检索：启用 pgvector（schema 中已预留 `embedding vector(1536)` 列）→
  实现 `retrieve()`（Agnes embedding 或外部 RAG）→ 在 `REGISTRY` 注册 →
  设置 `KNOWLEDGE_RETRIEVER=vector` 即可切换，上层无需改动
- 知识条目可通过 `GET /api/knowledge` 查询，管理员可在管理页面维护；内置 8 条种子知识
  （阑尾切除 / CABG 术前评估 / 无菌原则 / ASA 分级 / 肝切除解剖 / 开颅体位 / 肾部分切除 / WHO 核查表）

## API 一览

| 路由 | 说明 |
| --- | --- |
| `POST /api/auth/login`、`/api/auth/logout`、`/api/auth/password` | 邮箱密码登录 / 退出 / 修改自己的密码（Supabase Auth Cookie 会话） |
| `GET/POST /api/admin/users` | 管理员列出、创建、重置、禁止或允许账号（服务端检查管理员后才使用服务密钥，操作写审计） |
| `GET/POST /api/admin/unassigned` | 管理员查看并逐条分配无归属的旧病例 |
| `POST /api/chat` | 登录后流式对话（SSE）。`mode: learning \| guidance`；指导模式传 `context.planId`、`context.planVersion`，服务端按当前账号权限读取对应版本 |
| `POST /api/image` | 登录后 agnes-image-2.5-flash 图像生成 |
| `GET/POST /api/plans` | 当前账号的规划列表 / 创建病例（病人+初步方案） |
| `GET/PATCH /api/plans/[id]` | 规划详情（版本历史+反馈+模拟记录）/ 编辑病例（需 `expectedUpdatedAt`）；不存在或无权访问返回 404 |
| `POST /api/plans/[id]/generate` | AI 生成并校验完整结构化规划 + 编排模拟，版本、模拟一次提交；基础版本过期返回 409 |
| `POST /api/plans/[id]/feedback` | 提交 `comment` 与最新版本号 `version`；署名取自登录账号；修订成功后反馈、方案与模拟一次保存 |
| `POST /api/plans/[id]/archive`、`/finalize` | 归档 / 恢复，定稿 / 撤销定稿（均带 `expectedUpdatedAt`，过期返回 409） |
| `GET /api/plans/[id]/history` | 病例编辑历史 |
| `GET/POST /api/learning/quiz` | 学习自测出题 / 提交答案并记录 |
| `GET/POST /api/knowledge` | 登录查询；`POST` 仅管理员新增或更新（含来源与审核状态） |
| `GET /api/health` | 配置状态（存储类型 / 模型 / 检索器） |

JSON 请求体限制 128 KB（知识库写入 256 KB），并按字段检查类型、长度与枚举。匿名访问受保护接口返回 401，角色不足返回 403，AI 配额用尽返回 429（配额见上文“Supabase 建库与登录”，由数据库按账号共享计数）。所有会修改数据的接口还会核对请求来源与公开主机，跨站提交返回 403。每次 AI 调用有 240 秒上限，生成/修订的两轮调用从路由入口共用 270 秒预算，并接收客户端取消信号；已开始的对话流通过 SSE 报错，并只在回答完整（收到 `[DONE]`）后保存。认证服务故障返回 503、限流返回 429，不会伪装为“未登录”或账号密码错误。会话 Cookie 对页面脚本不可见（HttpOnly）。

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
    site/Header.tsx             # 导航与账号菜单（账号、管理入口、退出）
  lib/
    agnes.ts                    # Agnes API 服务端集成（chat / image / JSON 模式）
    auth.ts                     # Supabase SSR Cookie 客户端（拒绝高权限密钥、会话 Cookie 为 HttpOnly）、认证故障状态映射
    admin.ts                    # 管理员校验（数据库 medplan_is_admin）
    validation.ts               # 请求和 AI 方案的共享运行时校验
    http.ts                     # 统一错误返回、登录门槛 requireStore、同源校验 assertSameOrigin
    plan-generation.ts          # 生成与修订流程共用的编排逻辑（配额 → 检索 → AI → 校验 → 原子保存）
    planning-prompt.ts          # 规划生成 / 专家修订 / 模拟编排提示词
    organ-models.ts             # 器官注册表（GLB / 解剖位置 / focusOrgan 容错映射）
    knowledge/                  # 知识库接口 + 关键词检索器 + 种子数据
    store/                      # DataStore 抽象：每个请求一个带用户会话的 SupabaseStore（memory.ts 为沿用的远程遗留实现，应用与测试均未使用）
supabase/schema.sql             # 建库、升级和事务 RPC 脚本（migrations/ 为分步迁移）
scripts/seed-knowledge.mjs      # 复用原知识源的幂等导入
tests/                          # 输入、存储、认证、UI、图谱、模拟、供应商回归，SQL 测试及合成完整链路（e2e-*.cjs）
docs/archive/local-line-20261030/  # 合并前本地线的旧文档与已被取代的测试脚本（仅作记录，不可直接运行）
mackdown.md                     # 合并后的最终版技术文档（逐项标明修改与未修改）
CLAUDE_HANDOFF.md               # 交接说明：当前状态、验证方式、待办与边界
docs/merge-ledger-20261030.md   # 逐文件合并清单（基线、远程、本地、合并版）
docs/evidence/                  # 验证证据的脱敏副本（日志、截图、JSON 结果），按日期分目录
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

合并后的最终版（2026-10-31）实际结果：`npm test` **98/98 通过**（合并提交上是 95/95；之后追加的肺、脑、眼球摆放修正新增了 3 项回归），其中 12 个 SQL 测试在内存数据库 PGlite 中直接执行 `supabase/schema.sql`（事务回滚、唯一索引、所有者隔离、RLS、RPC 权限、迁移保护、AI 配额窗口、对话与插图的所有者隔离）；ESLint 0 错误、0 警告；独立类型检查和生产构建退出码均为 0。其余 86 项覆盖匿名与跨站请求、输入与 AI 方案校验、版本冲突与原子保存、AI 配额、认证故障状态、会话 Cookie、聊天流取消与截断、器官与图谱位置、模拟进度和界面状态。逐文件数字、验证范围和已知限制见 [`mackdown.md`](mackdown.md)。测试加载器仍会显示既有 Three.js CommonJS 废弃提示，生产代码使用 ESM。

本地完整链路测试（仅合成数据，不访问真实服务）：

```bash
# 终端一：先构建，再启动本地合成 Auth / 数据 API / AI 和生产网站
npm run build
node tests/e2e-server.cjs

# 终端二：运行 19 组 HTTP 流程与故障场景，完成后在终端一按 Ctrl+C 关闭
npm run test:e2e
```

网站端口为 `4401`，合成服务端口为 `4402`，均仅监听 `127.0.0.1`。合成服务里的数据 API 把 supabase-js 发出的 PostgREST 请求翻译为 SQL，在 PGlite 中以 `authenticated` 角色执行真实的 `supabase/schema.sql`，所以 RLS、授权和 RPC 是真实的；登录服务只发放本地合成令牌；AI 接口是桩。运行测试会清空这个合成数据库。结果默认写入项目上一级目录的 `审查结果/修复验证`；两个终端都设置环境变量 `MEDPLAN_TEST_OUTPUT`（绝对路径，或相对项目根目录的路径）可改写到新目录，避免覆盖此前的证据：

```powershell
$env:MEDPLAN_TEST_OUTPUT='D:/某个新目录'
```

这些检查都不能证明真实 Supabase（GoTrue、PostgREST、多连接并发、多实例）或真实 Agnes 已经联通：登录服务和 PostgREST 层是合成的翻译实现，AI 是桩。手机真机触控与所有 GPU 仍待验收。

真实服务验收需在完成自己的 Auth、SQL 和知识种子配置后执行：登录 → 新建合成病例 → 生成 v1 → 检查对应模拟 → 专家修订 v2 → 切回 v1 检查顾问上下文 → 学习问答及插图 → 用另一个账号确认看不到该病例。再核验错误输入、失败重试和限流。没有真实凭证时，不能据此认定真实云端链路已通过。

## HuBMAP 器官模型来源

脑、左眼、心脏、肺、肝、胰的器官特写使用 HuBMAP Human Reference Atlas 的男性参考器官模型；子宫特写使用女性参考模型（不含附件）。全身及模拟视图使用原有已配准模型，左右肾除外：人体概览使用 HuBMAP 男性左右独立肾模型并分别按图谱定位。参考器官数据采用 CC BY 4.0：

- Browne, K., Schlehlein, H. 等，HuBMAP Human Reference Atlas 3D Reference Object Library，https://humanatlas.io/3d-reference-library 。
- 肾、肠及胃特写采用 Innerscene 基于 MakeHuman 制作的 CC0 简化示意模型： https://www.innerscene.com/tools/library/3d-parts/kidneys-pair-c78928dd ， https://www.innerscene.com/tools/library/3d-parts/intestines-26224e6a ， https://www.innerscene.com/tools/library/3d-parts/stomach-e1e1d2ab 。皮肤组织沿用原有切面模型。
- [男性脑 v1.4](https://purl.humanatlas.io/ref-organ/brain-male/v1.4)、[男性左眼 v1.3](https://purl.humanatlas.io/ref-organ/eye-male-left/v1.3)、[男性胰腺 v1.3](https://purl.humanatlas.io/ref-organ/pancreas-male/v1.3)、[女性子宫 v1.2](https://purl.humanatlas.io/ref-organ/uterus-female/v1.2)。
- [男性左肾 v1.3](https://purl.humanatlas.io/ref-organ/kidney-male-left/v1.3)、[男性右肾 v1.3](https://purl.humanatlas.io/ref-organ/kidney-male-right/v1.3)。
- [男性心脏 v1.3](https://purl.humanatlas.io/ref-organ/heart-male/v1.3)、[男性肝脏 v1.2](https://purl.humanatlas.io/ref-organ/liver-male/v1.2)、[男性肺 v1.4](https://purl.humanatlas.io/ref-organ/lung-male/v1.4)。
- 除子宫外，上述 HuBMAP 模型为男性参考器官；女性显示模式下仍会显示同一男性模型，不代表患者的个体解剖。展示时模型会居中缩放，肝脏材质在深色画布中经过提亮。

## 版权与致谢

- [lhbzx1984/human-atlas](https://github.com/lhbzx1984/human-atlas)（MIT）：BodyParts3D 网格管线与 atlas 数据
- [thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy)：器官 GLB 模型与器官图集
- [BodyParts3D 4.0](https://lifesciencedb.jp/bp3d/)：解剖数据，**CC BY 4.0**（redistributing 时请保留署名）
- [DBCLS BodyParts3D](https://lifesciencedb.jp/bp3d/) 提供 Anatomography 数据
- 胃模型：BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International；由 `scripts/extract-stomach-glb.mjs` 转换（格式转换、法线重算），男性参考解剖的简化网格，仅作教学示意

原创应用代码遵循 MIT 许可；解剖数据遵循其自身 CC BY 4.0 许可。
