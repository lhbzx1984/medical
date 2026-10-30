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
- 病例列表支持按患者姓名、最新诊断或方案名称搜索，并按方案状态和更新日期筛选，可编辑病例资料及归档和恢复病例；可在病例历史中查看最近 100 次修改前的资料
- 内置「急性化脓性阑尾炎」示例病例，一键体验完整流程
- 版本对比：选择两个版本并排查看发生变化的方案字段；每个版本记录来源、引用的知识库条目和修订说明
- 可对最新版本确认定稿；修改病例或重新生成前须先撤销定稿
- 可打开所选版本的打印页面，通过浏览器打印或保存为 PDF

### 功能二：医学学习中心（`/learning`）

- **全身概览**：真实肤色人体外皮（女性模式含乳房轮廓）+ 器官文字标注，
  点击标注/器官 → 外皮淡出并聚焦；女性模式额外呈现程序化子宫附件
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
npm install
npm run dev        # http://localhost:3000
npm test           # 本地数据库权限与事务回归测试
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

# Supabase：使用项目 URL 和 anon/publishable key，勿使用 service_role key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
# 仅管理员账号管理需要；仅在服务器配置，绝不暴露给浏览器
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 手术知识库检索器（预留接口，当前：keyword）
KNOWLEDGE_RETRIEVER=keyword
```

**安全说明**：业务数据访问使用当前登录用户的会话和匿名密钥，行级安全按病例归属限制访问；账号管理接口仅在服务器完成管理员权限检查后使用 service_role 密钥访问 Supabase Auth。服务密钥不可放入客户端变量。

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
| `POST /api/chat` | 流式对话（SSE）。`mode: learning \| guidance`，上下文自动注入 |
| `POST /api/image` | agnes-image-2.5-flash 图像生成 |
| `GET/POST /api/plans` | 规划列表 / 创建病例（病人+初步方案） |
| `GET /api/plans/[id]` | 规划详情（版本历史+反馈+模拟记录） |
| `POST /api/plans/[id]/generate` | AI 生成结构化规划 + 自动编排模拟 |
| `POST /api/plans/[id]/feedback` | 专家反馈 → AI 修订 → 新版本 |
| `GET /api/knowledge` | 知识库查询 |
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
