# 合并清单（逐文件）

生成于提交前，数据来自 git：基线为 ZIP 快照提交 `0f31d72`，远程为 `origin/main`（`8f3ea17`），本地为本地最终版（`97be433`，原分支 `local-medical-main-20261030`，已删除，提交仍在 `main` 历史里），合并版为本次提交的文件树。
状态含义：**未改** 与 ZIP 基线相同；**改动** 与基线不同；**新增** 基线没有；**删除** 基线有而该版本没有；**—** 该版本没有且基线也没有。
“合并结果”列说明合并版的内容来自哪里。未修改的文件也逐一列出。

## 汇总

| 合并结果 | 文件数 | 含义 |
| --- | ---: | --- |
| 未修改 | 78 | 三方一致，没有任何改动 |
| 远程原样 | 38 | 来自远程，合并时没有改动（含远程新增页面、接口、迁移和 SQL 测试） |
| 本地原样 | 26 | 来自本地最终版，合并时没有改动（器官模型、图谱、模拟、学习中心、胃模型等） |
| 采用远程 | 3 | 两边都改过，合并版取远程内容 |
| 手工整合 | 18 | 两边都改过，在远程内容上整合了本地改动 |
| 远程基础上修改 | 11 | 在远程版本上做了改动 |
| 本地基础上修改 | 14 | 在本地版本上做了改动 |
| 合并时新增 | 9 | 合并过程中新增（测试夹具、归档、说明文档等） |
| 取代 | 3 | 本地独有、被远程同类实现取代，未带入（旧文本保存在 docs/archive） |
| **合计（不含 docs/evidence 与本清单）** | **200** | |

另有 `docs/evidence/` 下 172 个证据文件（见文末）和本清单自身。

## 逐文件

| 文件 | 基线 | 远程 | 本地 | 合并版 | 合并结果 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `.gitignore` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `AGENTS.md` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `CLAUDE_HANDOFF.md` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `README.md` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `docs/archive/local-line-20261030/CLAUDE_HANDOFF.local-line.md` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `docs/archive/local-line-20261030/e2e-flow.local-line.cjs` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `docs/archive/local-line-20261030/e2e-server.local-line.cjs` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `docs/archive/local-line-20261030/mackdown.local-line.md` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `docs/archive/local-line-20261030/postgres-check.local-line.mjs` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `docs/superpowers/plans/2026-10-28-audit-fixes.md` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `docs/superpowers/plans/2026-10-30-model-skills.md` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `eslint.config.mjs` | 有 | 未改 | 改动 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `mackdown.md` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `next.config.ts` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `package-lock.json` | 有 | 改动 | 未改 | 有 | **远程原样** | 仅远程改动，原样保留 |
| `package.json` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `public/anatomy/brain/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/brain/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/brain/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/eyeball/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/eyeball/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/eyeball/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/heart/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/heart/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/heart/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/intestine/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/intestine/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/intestine/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/kidneys/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/kidneys/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/kidneys/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/liver/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/liver/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/liver/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/lungs/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/lungs/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/lungs/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/pancreas/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/pancreas/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/pancreas/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/skin/location.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/skin/organ.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/skin/thumb.webp` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/anatomy/stomach/organ.webp` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `public/anatomy/stomach/thumb.webp` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `public/atlas/atlas.json` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-0.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-1.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-10.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-11.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-12.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-13.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-14.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-2.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-3.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-4.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-5.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-6.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-7.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-8.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/atlas/body-9.bin.gz` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/cases/anatomy-female.png` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/cases/anatomy-male.png` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/cases/case-appendicitis.png` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/cases/case-cabg.png` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/cases/case-liver.png` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/cases/hero-anatomy.png` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/cases/uterus-thumb.png` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/file.svg` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/globe.svg` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/brain.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/eyeball.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/heart.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/intestine.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/kidneys.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/liver.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/lungs.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/pancreas.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/skin.glb` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/models/stomach.glb` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `public/next.svg` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/vercel.svg` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `public/window.svg` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `scripts/extract-stomach-glb.mjs` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `scripts/gen-case-images.mjs` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `scripts/gen-female-anatomy.mjs` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `scripts/gen-hero-anatomy.mjs` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `scripts/gen-uterus-thumb.mjs` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `scripts/seed-knowledge.mjs` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `scripts/wire-female.mjs` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/app/account/page.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/app/admin/knowledge/page.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/app/admin/unassigned/page.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/app/admin/users/page.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/app/api/admin/unassigned/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/admin/users/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/auth/login/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/auth/logout/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/auth/password/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/auth/route.ts` | — | — | 新增 | — | **取代** | 本地独有的实现被远程同类实现取代，未带入；旧文本在 docs/archive |
| `src/app/api/chat/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/api/health/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/api/image/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/api/knowledge/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/api/learning/quiz/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/plans/[id]/archive/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/plans/[id]/feedback/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/api/plans/[id]/finalize/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/plans/[id]/generate/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/api/plans/[id]/history/route.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/app/api/plans/[id]/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/api/plans/route.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/app/favicon.ico` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/app/globals.css` | 有 | 改动 | 未改 | 有 | **远程原样** | 仅远程改动，原样保留 |
| `src/app/layout.tsx` | 有 | 改动 | 未改 | 有 | **远程原样** | 仅远程改动，原样保留 |
| `src/app/learning/page.tsx` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/app/login/page.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/app/page.tsx` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/app/planning/[id]/print/[version]/page.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/app/planning/page.tsx` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/components/atlas/AtlasViewer.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/atlas/atlasData.ts` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/chat/ChatPanel.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/learn/Anatomy2D.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/learn/LearnCanvas.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/learn/LearningCenter.tsx` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/components/learn/OrganQuiz.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/components/planning/CaseHistory.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/components/planning/PatientForm.tsx` | 有 | 改动 | 未改 | 有 | **远程原样** | 仅远程改动，原样保留 |
| `src/components/planning/PlanComparison.tsx` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/components/planning/PlanDocument.tsx` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/components/planning/PlanningWorkspace.tsx` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/components/sim/BodyOutline.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/sim/BodyOverviewScene.tsx` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/components/sim/FemaleReproductive.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/sim/OrganModel.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/sim/SimulationStage.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/sim/instruments.tsx` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/components/sim/material-utils.ts` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `src/components/site/AnatomyOverlays.tsx` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/components/site/AuthControls.tsx` | — | — | 新增 | — | **取代** | 本地独有的实现被远程同类实现取代，未带入；旧文本在 docs/archive |
| `src/components/site/Header.tsx` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/components/site/HeroAnatomy.tsx` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/lib/admin.ts` | — | 新增 | — | 有 | **远程基础上修改** | 在远程版本上做了改动 |
| `src/lib/agnes.ts` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/lib/auth.ts` | — | 新增 | 新增 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/lib/http.ts` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `src/lib/knowledge/index.ts` | 有 | 改动 | 未改 | 有 | **远程原样** | 仅远程改动，原样保留 |
| `src/lib/knowledge/seed.ts` | 有 | 未改 | 未改 | 有 | **未修改** | 三方一致，未改动 |
| `src/lib/organ-models.ts` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/lib/plan-generation.ts` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `src/lib/planning-prompt.ts` | 有 | 未改 | 改动 | 有 | **本地原样** | 仅本地改动，原样带入 |
| `src/lib/quiz.ts` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `src/lib/store/base.ts` | 有 | 改动 | 改动 | 有 | **采用远程** | 两边都改过，合并版取远程内容 |
| `src/lib/store/index.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/lib/store/memory.ts` | 有 | 改动 | 改动 | 有 | **采用远程** | 两边都改过，合并版取远程内容 |
| `src/lib/store/supabase.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/lib/types.ts` | 有 | 改动 | 改动 | 有 | **手工整合** | 两边都改过，在远程内容上整合本地改动 |
| `src/lib/validation.ts` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `supabase/migrations/202610300001_enable_rls.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300002_user_isolation.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300003_atomic_revisions.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300004_ai_quotas.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300005_edit_case.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300006_archive_cases.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300007_finalize_plan.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300008_knowledge_sources.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300009_learning_quiz.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300010_admin_knowledge.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300011_admin_audit.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300012_assign_legacy_cases.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/migrations/202610300013_case_diagnosis.sql` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `supabase/schema.sql` | 有 | 改动 | 改动 | 有 | **采用远程** | 两边都改过，合并版取远程内容 |
| `tests/admin.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/api-regressions.test.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tests/archive.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/assign.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/atlas-regression.test.cjs` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `tests/audit.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/auth-regressions.test.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tests/chat-isolation.test.cjs` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `tests/chat-route.test.cjs` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `tests/diagnosis.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/e2e-flow.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tests/e2e-server.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tests/edit.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/fake-store.cjs` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `tests/finalize.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/knowledge.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/load-ts.cjs` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `tests/plan-generation-regressions.test.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tests/postgres-check.mjs` | — | — | 新增 | — | **取代** | 本地独有的实现被远程同类实现取代，未带入；旧文本在 docs/archive |
| `tests/provider.test.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tests/quiz.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/quota-window.test.cjs` | — | — | — | 有 | **合并时新增** | 合并过程中新增 |
| `tests/quota.test.cjs` | — | 新增 | — | 有 | **远程原样** | 远程新增，原样保留 |
| `tests/simulation-regression.test.cjs` | — | — | 新增 | 有 | **本地原样** | 本地新增，原样带入 |
| `tests/store.test.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tests/ui-regressions.test.cjs` | — | — | 新增 | 有 | **本地基础上修改** | 在本地版本上做了改动 |
| `tsconfig.json` | 有 | 未改 | 未改 | 有 | **远程基础上修改** | 在远程版本上做了改动 |

## 证据文件（docs/evidence）

| 目录 | 文件数 |
| --- | ---: |
| `20261030/合并最终版复核-20261030` | 11 |
| `20261030/合并最终版终验-20261030` | 12 |
| `20261030/合并最终版验证-20261030` | 11 |
| `20261030/器官图谱对比-20261030` | 6 |
| `20261030/模型与Skill接入-20261030` | 3 |
| `20261030/第二轮验证-20261030` | 21 |
| `20261030/肝心位置修正-20261030` | 19 |
| `20261030/肝高度大小修正-20261030` | 21 |
| `20261030/肾胰图谱对齐-20261030` | 34 |
| `20261030/胃接入验证-20261030` | 22 |
| `20261031/合并最终版定稿验证-20261031` | 12 |
