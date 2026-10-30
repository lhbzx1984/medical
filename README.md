# MedPlan Atlas · 医学手术规划智能体系统

基于两个开源 3D 解剖项目（[lhbzx1984/human-atlas](https://github.com/lhbzx1984/human-atlas) 与
[thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy)）的资产，融合 **Agnes 大模型**构建的
医学手术规划与教学智能体系统。

> ⚠️ 本系统为教学演示用途，所有 AI 生成内容不构成临床决策依据。

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

- **全身概览**：真实肤色人体外皮（女性模式含乳房轮廓）+ 器官文字标注，
  点击标注/器官 → 外皮淡出并聚焦；女性模式额外呈现程序化子宫附件
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
| 数据库 | Supabase（可选，未配置时自动降级为内置演示存储） |

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

生产部署：

```bash
npm run build
npm run start
```

### 环境变量（`.env.local`）

```bash
# Agnes API（必填）
AGNES_API_KEY=sk-xxxx
AGNES_API_BASE_URL=https://apihub.agnes-ai.com

# Supabase（可选，留空则使用内置演示存储）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 手术知识库检索器（预留接口，当前：keyword）
KNOWLEDGE_RETRIEVER=keyword
```

**安全说明**：API Key 只在服务端（Next.js API Route）使用，不会打包进浏览器代码；
使用 Supabase 时服务端以 SERVICE_ROLE_KEY 直连，浏览器不直接访问数据库。

### Supabase 建库

在 Supabase Dashboard → SQL Editor 中执行 [`supabase/schema.sql`](supabase/schema.sql)
（包含 patients / surgical_plans / plan_versions / plan_feedback / simulations /
knowledge_entries / chat_sessions / chat_messages / generated_images 九张表与索引）。
填入环境变量后自动启用持久化；两项均不配置时使用进程内存演示存储（重启清空）；配置不完整时会报错，避免误以为数据已持久化。

建库脚本默认开启行级安全（RLS），禁止没有策略的客户端直接读写业务表。启用后服务端必须配置
`SUPABASE_SERVICE_ROLE_KEY`；仅使用匿名密钥的现有部署需要先调整配置。已有数据库需在
核查现有策略后执行 [`supabase/migrations/202610300001_enable_rls.sql`](supabase/migrations/202610300001_enable_rls.sql)。
服务端使用的 service_role 会绕过 RLS；当前应用 API 尚未实现用户身份认证和病例归属隔离，
因此开启 RLS 后仍不能安全地向公网开放或保存真实患者资料。

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
- 知识条目可通过 `GET/POST /api/knowledge` 管理；内置 8 条种子知识
  （阑尾切除 / CABG 术前评估 / 无菌原则 / ASA 分级 / 肝切除解剖 / 开颅体位 / 肾部分切除 / WHO 核查表）

## API 一览

| 路由 | 说明 |
| --- | --- |
| `POST /api/chat` | 流式对话（SSE）。`mode: learning \| guidance`，上下文自动注入 |
| `POST /api/image` | agnes-image-2.5-flash 图像生成 |
| `GET/POST /api/plans` | 规划列表 / 创建病例（病人+初步方案） |
| `GET /api/plans/[id]` | 规划详情（版本历史+反馈+模拟记录） |
| `POST /api/plans/[id]/generate` | AI 生成结构化规划 + 自动编排模拟 |
| `POST /api/plans/[id]/feedback` | 专家反馈 → AI 修订 → 新版本 |
| `GET/POST /api/knowledge` | 知识库查询 / 新增 |
| `GET /api/health` | 配置状态（存储类型 / 模型 / 检索器） |

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
  lib/
    agnes.ts                    # Agnes API 服务端集成（chat / image / JSON 模式）
    planning-prompt.ts          # 规划生成 / 专家修订 / 模拟编排提示词
    organ-models.ts             # 器官注册表（GLB / 解剖位置 / focusOrgan 容错映射）
    knowledge/                  # 知识库接口 + 关键词检索器 + 种子数据
    store/                      # DataStore 抽象：Supabase / 内置演示存储
  supabase/schema.sql           # 建库脚本
public/
  atlas/                        # BodyParts3D atlas.json + 15 个网格批次（gzip）
  models/                       # 9 个器官 GLB（Meshopt）
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
  点击通过 `face.a → partId` 反查结构；chunk 按需并行下载并渐进上屏
- **注意**：部分浏览器/嵌入式预览在窗口被遮挡时会节流 requestAnimationFrame，
  3D 画布在窗口不可见时不会重绘——切到可见窗口即可恢复

## 已验证的端到端流程

使用真实 Agnes API 完成过全链路测试：

1. 创建病例（急性化脓性阑尾炎示例）→ AI 生成规划（67s：7 步骤 / 5 风险 / 11 器械，
   知识库命中「腹腔镜阑尾切除术操作要点」等 4 条，focusOrgan 正确映射到肠）
2. 提交 4 条专家反馈 → 36s 生成 v2 修订版，changelog 逐条回应反馈，模拟重新编排
3. 学习模式流式对话（286 个 SSE 增量事件，结构化 Markdown）
4. 教学插图生成（agnes-image-2.5-flash，9s 返回图像 URL）

## 版权与致谢

- [lhbzx1984/human-atlas](https://github.com/lhbzx1984/human-atlas)（MIT）：BodyParts3D 网格管线与 atlas 数据
- [thebuggeddev/anatomy](https://github.com/thebuggeddev/anatomy)：器官 GLB 模型与器官图集
- [BodyParts3D 4.0](https://lifesciencedb.jp/bp3d/)：解剖数据，**CC BY 4.0**（redistributing 时请保留署名）
- [DBCLS BodyParts3D](https://lifesciencedb.jp/bp3d/) 提供 Anatomography 数据

原创应用代码遵循 MIT 许可；解剖数据遵循其自身 CC BY 4.0 许可。
