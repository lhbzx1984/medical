# 交接说明（合并最终版）

更新日期：2026-10-31。当前状态、验证数字和已知限制以 [`mackdown.md`](mackdown.md) 为准；本文只写接手时需要的做法和边界。合并前的交接说明（模型与 Skill 接入任务的暂停交接）保存在 [`docs/archive/local-line-20261030/CLAUDE_HANDOFF.local-line.md`](docs/archive/local-line-20261030/CLAUDE_HANDOFF.local-line.md)，其中的待办大多已完成或被取代。本文不含密钥或真实病例。

## 1. 现在的状态

- 代码是 GitHub `main`（`8f3ea17`）与本地最终版（`97be433`）的合并结果：后端、登录、行级安全、原子保存、AI 配额采用远程；器官模型与图谱对齐、胃模型、模拟、学习中心、输入与 AI 方案校验、聊天流加固是本地成果。逐文件清单见 [`docs/merge-ledger-20261030.md`](docs/merge-ledger-20261030.md)。
- 合并之后（2026-10-31）追加了“剩余器官 3D 修正”：肺、脑、眼球在人体概览里的摆放（`src/lib/organ-models.ts` 的取值与可选字段 `bodyRotation`、`BodyOverviewScene.tsx` 一行传参、`atlas-regression` 新增 3 项）。详见 `mackdown.md` 第 6.1 节。合并清单文件 `docs/merge-ledger-20261030.md` 只记录合并本身，没有重新生成。
- 技术栈：Next.js 16.4.3（Turbopack、Cache Components）、React 19、three 0.186.1、@react-three/fiber 9.8.2、@react-three/drei 10.7.9、`@supabase/ssr` 0.12.7、supabase-js 2.118.0；测试用 PGlite 0.5.13（devDependency）。
- 合并提交上的检查：类型检查退出码 0；ESLint 0 错误、0 警告；`npm test` 95/95；`npm run build` 退出码 0；合成完整链路 19/19。证据在 `docs/evidence/20261031/合并最终版定稿验证-20261031/`。
- 追加剩余器官修正之后的检查：同样的五项都重新运行，`npm test` 变为 98/98，其余结果不变；另有应用内浏览器逐器官查看。证据在 `docs/evidence/20261031/剩余器官3D修正-20261031/`（`mackdown.md` 第 7.6 节）。
- 没有验证：真实 Supabase、真实 Agnes、窄屏/真机/GPU、医学内容审核。完整链路用的是合成替身，不能当作真实服务的验收。

## 2. 怎么验证

```bash
npm ci
npm test            # 98 项，含 12 个在 PGlite 里执行 supabase/schema.sql 的 SQL 测试
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

完整链路（合成数据，不访问真实服务）：先 `npm run build`；终端一运行 `node tests/e2e-server.cjs`，终端二运行 `npm run test:e2e`。两边都把环境变量 `MEDPLAN_TEST_OUTPUT` 设为一个**新**目录（绝对路径，或相对项目根目录），每次运行换新目录，不覆盖旧证据。网站端口 4401、合成服务端口 4402，只监听 `127.0.0.1`；运行会清空合成数据库。

## 3. 工程规范与边界（沿用）

- 检查现有实现和改动 → 定位根因 → 最小增量修改 → 检查差异 → 实际验证 → 如实记录。不重建网站，不做平行实现，不无理由改框架或删除旧记录。
- 不删测试来制造通过。与被取代实现绑定的测试改写成对新实现的等价检查，并在 `mackdown.md` 第 7.2 节记录去向。
- 修改 Next.js 相关代码前，先读 `node_modules/next/dist/docs/` 里对应的指南（见 `AGENTS.md`）。
- 真实密钥暂缓：不要创建或覆盖 `.env.local`，不做远程 SQL、云端迁移或部署，不要向聊天索取密钥。
- 不声明医学准确性；AI 输出是教学演示，不构成临床决策依据。
- 项目目录是 ZIP 解压目录，没有 `.git`。需要 Git 时在临时目录克隆工作；不要在项目目录里 reset 或 clean，也不要因为没有 Git 而覆盖文件。

## 4. 记录规则

- `mackdown.md` 逐项标明【修改】【新增】【取代】【未修改】【未验证】；改动文件后同步更新；合并之后追加的修改记在 `mackdown.md` 的对应小节，不改写 `docs/merge-ledger-20261030.md`（它只记录合并本身，来自 git 的四方比较：基线、远程、本地、合并版）。
- 验证证据放在新文件夹（项目上一级的 `审查结果/<名称>-<日期>`），日志、截图和汇总 JSON 放在一起；被取代的结果在原文件夹里加说明文件，不改写原文件。
- 仓库里的证据副本是脱敏的（会话链接与本机绝对路径换成占位符）；新增证据入库前同样处理。

## 5. 接手后建议的顺序

1. 真实 Supabase 验收（`mackdown.md` 第 8、9 节）：备份 → 建库或迁移 → 授权第一个管理员 → 两个账号走完整流程。
2. 真实 Agnes 联调：正常与坏输出、连接故障、流中错误、取消、超时。
3. 窄屏、真机与 GPU：390/768/1024 像素与桌面。
4. 顶栏账号菜单按角色显示（需要“当前账号是否管理员”的来源）。
5. 新建病例改为单个 RPC，消除没有方案的患者行（旧的 `create_case` 可参考提交 `97be433`，它是合并提交的第二个父提交；原分支 `local-medical-main-20261030` 已删除）。
6. 器官待办（`mackdown.md` 第 6.1、8 节）：肺、脑、眼球的摆放已修正；乳腺没有模型；肾两侧等高需要拆成左右两个模型；肺模型没有心切迹（与心脏约 18% 顶点重叠）、眼球与脑约 5% 重叠，需要换模型或裁剪；没有同时显示全部器官的 3D 入口，整体布局不能目检。
7. 确认无人依赖后，删除未使用的 `src/lib/store/memory.ts`。
