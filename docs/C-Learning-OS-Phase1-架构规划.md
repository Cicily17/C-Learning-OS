# C Learning OS — 第一阶段规划说明书

> 版本：v1.0 ｜ 日期：2026-11-24 ｜ 阶段：Phase 1（架构与排期，不含实现代码）
>
> 本阶段只做检查、设计与确认，不生成业务代码。确认后再进入实现阶段。

---

## 0. 阶段目标

本阶段交付五份设计产物：

1. 项目现状检查报告
2. 产品架构
3. 技术架构
4. 页面结构
5. 数据结构与开发排期

并在文末列出需要你确认的关键决策点。确认前不会一次性生成全部代码。

---

## 1. 项目现状检查

### 1.1 检查结果

| 检查项 | 实际状态 | 说明 |
| --- | --- | --- |
| 工作区内容 | **完全空目录** | `C:/Users/Cicily/WorkBuddy/2026-11-24-17-08-41/` 无任何文件 |
| 现有代码 / 技术栈 | 无 | 未发现 `package.json`、`requirements.txt`、`pyproject.toml` 等 |
| Git 仓库 | 无 | 未发现 `.git` |
| 现有数据库 / 题库 | 无 | 需要从零建立知识点体系与题库 |
| Node.js | v22.22.2 | 可用于前端构建 |
| npm | v10.9.7 | 可用 |
| Python | 3.13.14 / 3.15.0 | 可用于 FastAPI 后端 |
| Git | 2.55.0 | 可用 |
| Docker | **未安装** | 影响 C 代码沙箱的实现方式，见 1.2 |
| PostgreSQL / Redis | **未检测到已安装服务** | 需要安装或明确使用替代方案，见 1.2 |
| 大模型 API Key / 供应商 | 未提供 | AI 功能需配置后方可真实运行 |
| 参考图片（图一 / 图二） | **本次消息未附图片附件** | 目前仅依据文字设计规范，需你补图以做像素级还原 |

**结论：这是一个全新的绿地项目（greenfield），不存在"已有工程被误重建"的风险。** 可以按推荐技术栈从零搭建。

### 1.2 环境约束与应对方案（需你决策）

| 约束 | 影响 | 方案 A（推荐） | 方案 B（降级） |
| --- | --- | --- | --- |
| 无 Docker | 无法满足"独立沙箱执行 C 代码"的生产级隔离要求 | 安装 Docker Desktop，后续用一次性容器运行 `gcc -std=c11`，配 `--network none`、只读文件系统、内存/CPU/进程数限制、非 root 用户、超时 | MVP 阶段使用 Python 子进程 + `resource` 限制（CPU/内存/文件大小）+ 临时目录 + 超时，**仅适合本地单人开发调试，不能作为多用户公开服务的安全边界**；代码中明确标注此限制 |
| 无 PostgreSQL | 数据持久化无法按原设计落地 | 安装 PostgreSQL 16+，按本文第 5 节建表 | 开发期用 SQLite 跑通业务闭环，保留 SQLAlchemy ORM 层以便切换；正式环境必须换回 PostgreSQL |
| 无 Redis | 缓存 / 限流 / 会话缺少组件 | 安装 Redis（可选） | 用数据库 + 进程内缓存替代；Redis 在本系统中不是 MVP 阻塞项 |
| 无 AI API Key | AI 出题 / 提示 / 解析无法真实运行 | 你提供供应商与密钥，服务端配置，前端不可见 | 定义好 AI 接口契约，密钥配置后即可启用；在此之前 AI 相关按钮显示"未配置"的明确空状态，**不伪装成已完成功能** |
| 未附参考图 | 视觉还原缺少像素基准 | 你补充两张图片 | 严格按文字规范：深墨绿/黑绿背景、荧光绿主色、细边框半透明面板、网格光效、工业控制台布局 |

---

## 2. 产品架构

### 2.1 产品定位与用户

- 名称：**C Learning OS**
- 用户：大学生、C 语言初学者、计算机等级考试备考学生
- 核心价值：把抽象知识转成可视化任务，形成「学习 → 训练 → 考试 → 复盘」闭环，用游戏化维持学习动力
- 基本原则：**游戏奖励不能替代真实成绩**，所有经验、等级、徽章必须由真实答题结果计算

### 2.2 六大模块与职责

| 模块 | 核心职责 | 关键输出 |
| --- | --- | --- |
| M1 学习工作台 Dashboard | 汇聚个人状态、进度、任务、成绩、趋势 | 登录后首页，所有数据来自真实记录 |
| M2 游戏化闯关 | 章节地图、知识点关卡、解锁与奖励 | 关卡状态机（未解锁/进行中/已完成/已精通）、经验与等级、每日任务、章节挑战 |
| M3 智能练习中心 | 自选知识点/难度/题量/时间/题型，自动出题 | 练习会话、分层 AI 提示、可看答案解析、可重做、自动保存 |
| M4 模拟考试中心 | 配置试卷、自动组卷、计时、判分、报告 | **服务端保密 + 服务端判分**，考后报告 |
| M5 知识学习中心 | 完整 C 知识库、代码高亮/复制/运行 | 学习记录、收藏、掌握度标记、关联跳转 |
| M6 AI 助手与学习档案 | 讲解/代码分析/错题分析/复习建议；历史与趋势 | 模式感知 AI、练习/考试记录、错题本、薄弱项分析 |

### 2.3 五条核心业务闭环

| 闭环 | 流程 | 
| --- | --- |
| C1 知识学习 | 登录 → 选章节 → 学知识点 → 完成配套练习 → 保存学习记录 |
| C2 自主练习 | 练习中心 → 选知识点 → 选难度/题量/时间/题型 → 自动出题 → 答题 → AI 提示 → 提交 → 看答案解析 → 存历史 |
| C3 正式考试 | 选范围 → 配置试卷 → 自动组卷 → 开始计时 → 答题 → 自动保存 → 提交 → 服务端判分 → 看成绩与解析 → 存记录 |
| C4 游戏闯关 | 地图 → 解锁关卡 → 学知识点 → 完成挑战 → 得经验 → 升等级 → 解锁下一关 |
| C5 学习档案 | 查看练习/考试历史 → 错题 → 掌握度 → 获取复习建议 |

### 2.4 最关键业务规则：练习与考试的权限隔离

这是整个系统最不能出错的规则，**不能只靠前端隐藏按钮实现**：

| 能力 | 练习模式 | 考试模式（进行中） |
| --- | --- | --- |
| AI 分层提示 | 允许 | **禁止**（接口层拒绝） |
| 查看参考答案 | 用户主动点击后展示 | **禁止**（接口不返回答案字段） |
| 查看详细解析 | 允许 | **禁止**（接口不返回解析字段） |
| 显示当前正确率 | 允许 | **禁止**（答题接口不回传对错） |
| 显示最终分数 | — | **禁止**（仅提交后返回） |
| 前端获取标准答案 | 受控接口 | **任何接口均不返回答案/分值字段** |
| timer | 软提醒 | 服务端权威计时，超时强制交卷 |

落地机制：

1. 考试会话的接口使用**字段白名单 DTO**（`ExamQuestionDTO`），只序列化题干、代码、选项，不序列化 `correct_answer`、`explanation`、`score`。
2. 标准答案单独存于 `exam_answer_keys` 表，判分服务在提交时读取，业务查询接口无权访问。
3. AI 接口接收 `mode` 上下文；当 `mode=exam` 且会话状态为 `in_progress` 时，后端直接返回 403，**前端无法通过任何参数绕过**。
4. 提交后会话状态变为 `submitted`，才开放 `report` 接口；重复提交被拒绝。
5. 倒计时以服务端 `started_at + duration_minutes` 为准，前端按服务端时间校准显示；提交时服务端二次校验截止时间。

### 2.5 游戏化规则

- 关卡状态：`locked → available → in_progress → completed → mastered`
- 章节挑战通过后解锁下一章（真实答题结果判定）
- 经验值来源：知识点学习、练习正确率、关卡挑战、每日任务完成
- 等级 = 累计经验的阶梯函数；连胜奖励按连续正确/连续学习日计算
- 成就徽章由 `condition_json` 声明，服务端判定后写入 `user_achievements`

---

## 3. 技术架构

### 3.1 技术栈（按推荐方案）

**前端**
- React 18 + TypeScript + Vite
- Tailwind CSS（设计令牌统一由配置文件管理：深墨绿/黑绿底、荧光绿主色、低饱和蓝灰辅色、细边框半透明面板）
- Framer Motion（受控微交互，见 3.5）
- ECharts（趋势曲线、柱状图、环形掌握度）
- Monaco Editor（只读代码展示 / 代码补全题作答）
- React Router（路由与页面守卫）

**后端**
- Python FastAPI（REST + Pydantic DTO 做字段白名单）
- SQLAlchemy + Alembic（ORM 与迁移）
- PostgreSQL（主库）
- Redis（可选：会话缓存、限流）
- JWT / bcrypt（认证与口令存储）
- pytest（接口与业务流程测试）

**AI**
- 供应商可配置（OpenAI 兼容协议优先），模型名 / 密钥 / 提示词模板**全部在服务端配置**
- 密钥只存服务端环境变量或配置表（加密），前端永不接触
- 提示词版本化，记录每次生成使用的 `prompt_version`

**C 代码执行**
- 独立 runner 服务，默认 `gcc -std=c11`
- 生产：Docker 一次性容器，无网络、只读根文件系统、内存/CPU/进程数限制、非 root、超时销毁
- 过渡方案见 1.2，必须在 UI 与文档中标注其非生产安全等级

### 3.2 分层结构

```
浏览器 (React SPA)
   │  HTTPS / JSON，字段白名单 DTO
   ▼
API 网关层 (FastAPI)
   ├─ 认证与权限 / 模式守卫（exam 模式拦截 AI 与答案接口）
   ├─ 业务服务层
   │    ├─ 知识服务    ├─ 组卷服务    ├─ 判分服务
   │    ├─ 练习服务    ├─ 考试服务    ├─ 游戏化服务
   │    ├─ 档案服务    └─ AI 服务（服务端密钥）
   ├─ 校验服务（题目格式/语法/答案/解析校验）
   └─ 数据访问层 (SQLAlchemy)
          ▼
     PostgreSQL  ←→  Redis(可选)
          ▼
     C runner 沙箱（独立进程/容器，仅接收源码与测试输入）
```

### 3.3 自动出题与校验流程

```
读取用户选择（知识点 + 难度 + 题量 + 时间 + 题型）
  → 从 preset 题库筛选可选题
  → 不足时调用 AI 生成 question_drafts（记录模型与提示词版本）
  → 校验器逐题检查：结构完整性 / 选项数量 / 答案格式 / 解析非空 / 知识点与难度匹配 / 去重
  → 程序输出题：送 C 沙箱编译运行，比对预期输出
  → 校验失败：丢弃并记录原因；通过后写入题库（source_type=ai_generated）
  → 仍不足：返回明确的 insufficient_count 提示，绝不虚构题目
  → 写入本次会话
```

**AI 生成题进入正式考试的条件**：必须 `validation_status=validated` 且带 `human_reviewed=true` 标记；练习可直接用已通过校验的题。

### 3.4 建议的目录结构（实现阶段使用）

```
C-Learning-OS/
├─ frontend/
│  ├─ src/
│  │  ├─ app/            # 路由、布局、全局状态
│  │  ├─ features/       # dashboard / learning / practice / exam / game / archive / ai
│  │  ├─ components/     # 通用组件
│  │  ├─ styles/         # Tailwind 配置与设计令牌
│  │  └─ types/          # API 类型
│  └─ package.json
├─ backend/
│  ├─ app/
│  │  ├─ api/            # 路由与 DTO
│  │  ├─ services/       # 业务逻辑
│  │  ├─ models/         # ORM 模型
│  │  ├─ ai/             # 模型适配器、提示词模板
│  │  ├─ validation/     # 题目校验器
│  │  └─ runner/         # C 代码沙箱客户端
│  ├─ migrations/        # Alembic
│  └─ tests/
├─ docs/                 # 本规划文档、接口文档、测试报告
└─ docker-compose.yml    # PostgreSQL/Redis/Runner（安装 Docker 后）
```

### 3.5 微交互选择（服务反馈优先，不为动画牺牲性能）

| 交互 | 使用位置 | 目的 |
| --- | --- | --- |
| Bars Fade | 页面/状态切换 | 数据加载反馈 |
| Snap Grid / Magnet Grid | 练习与考试知识点选择 | 勾选的即时确认 |
| Detent Dial | 难度四档选择 | 档位手感 |
| Stretch Toggle | 选项开关 | 单/多选反馈 |
| Card Fan | 题卡展开 | 题目导航 |
| Checklist | 每日任务 | 完成反馈 |
| Domino Row | 关卡解锁 | 章节推进 |
| Ripple Pad | 主操作按钮 | 点击反馈 |
| Paper Plane + Swipe Confirm | 交卷确认 | 防误触 |
| Download Ring | 成绩报告导出 | 导出进度 |
| Leaf Tabs | 章节切换 | 内容切换 |
| Worm Dots / Dot Revolve | 加载态 | 等待反馈 |

**考试模式中禁用一切可能泄露对错的动画**（例如答对爆发特效、正确率变化动画）。

---

## 4. 页面结构

### 4.1 路由清单

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/login` | 登录 / 注册 | 入口 |
| `/` | 学习工作台 Dashboard | 首页 |
| `/learning` | 知识学习中心 | 章节目录 + 搜索 |
| `/learning/:chapterId/:kpId` | 知识点详情 | 内容、示例、代码运行、关联跳转 |
| `/practice/setup` | 练习配置 | 四步向导：知识点 → 难度/题量/时间 → 题型 → 确认 |
| `/practice/session/:id` | 答题界面 | 导航 / 题干 / AI 助手 / 计时 |
| `/practice/result/:id` | 练习结果 | 答案、解析、错题入库 |
| `/exams` | 考试中心 | 试卷列表与入口 |
| `/exams/setup` | 考试配置 | 范围、题量、时长、难度、题型、分值 |
| `/exams/session/:id` | 考试答题 | **独立无干扰布局，无侧栏、无 AI、无答案** |
| `/exams/report/:id` | 考试报告 | 仅提交后可访问 |
| `/game/map` | 游戏地图 | 11 章关卡全景 |
| `/game/level/:kpId` | 关卡详情 | 学习 → 练习 → 挑战 → 结算 |
| `/archive` | 学习档案 | 练习史 / 考试史 / 错题 / 收藏 / 趋势 / 掌握度 |
| `/profile` | 个人设置 | 资料、AI 配置状态 |
| `/admin` | 管理端（P2） | 题库管理、AI 配置、审核 AI 生成题 |

### 4.2 布局骨架

**AppShell（常规页面）**

```
┌────────────┬───────────────────────────────┬──────────────┐
│            │  顶部：用户信息 / 全局状态条    │              │
│  左侧导航   ├───────────────────────────────┤  右侧数据概览  │
│  图标+文字  │                               │  （首页专用）  │
│            │       主学习工作区              │              │
│            │                               │              │
│            ├───────────────────────────────┤              │
│            │  底部：趋势 / 任务 / 掌握度      │              │
└────────────┴───────────────────────────────┴──────────────┘
```

**ExamShell（考试专用）**：全屏干净布局，只保留题干、答题卡、倒计时、交卷按钮；不渲染侧栏、AI 面板、任何解析入口。

### 4.3 核心组件库

`SidebarNav`、`TopStatusBar`、`StatCard`、`ProgressRing`、`TrendChart`、`MasteryRadar`、`KnowledgeTree`、`QuestionCard`、`CodePanel`（Monaco）、`OptionGroup`、`CountdownTimer`、`AnswerSheet`、`HintPanel`（三级）、`ExamNotice`、`LevelNode`、`AchievementBadge`、`EmptyState`、`Toast`。

### 4.4 关键页面要点

- **Dashboard**：12 项统计（等级、时长、题量、连续天数、掌握率、进度、最近章节、今日任务、最近成绩、待复习错题、趋势图等）。数据为空时展示设计好的空状态，不编造数字。
- **练习配置**：树形复选框，支持单/多选、整章全选/取消、全局全选/取消、已选计数、组合生成。
- **练习答题**：左侧导航进度、中间题干代码块与选项、右侧知识点/难度/计时/AI 提示、底部上一题/下一题/收藏/提交；支持跳过、重做、提前交卷、实时正确率、自动保存。
- **考试答题**：进入前须知与确认；倒计时；跳转、标记疑难、答题卡、自动保存；结束自动交卷；交卷后锁定。
- **知识详情**：13 项内容字段完整呈现，代码高亮/复制/运行，知识点关联跳转，进度与收藏。
- **档案**：按时间/章节/知识点筛选历史，错题重练，复习建议。

---

## 5. 数据结构

### 5.1 表清单

**需求明确要求的表（16 张）**

`users`、`chapters`、`knowledge_points`、`questions`、`question_options`、`practice_sessions`、`practice_answers`、`exam_papers`、`exam_questions`、`exam_sessions`、`exam_answers`、`learning_records`、`wrong_questions`、`favorites`、`achievements`、`user_progress`

**为关键规则补充的表（6 张）**

| 表 | 用途 |
| --- | --- |
| `exam_answer_keys` | 答案与解析单独存放，考试接口绝不暴露；判分服务专用 |
| `question_drafts` | AI 生成题的暂存、校验状态、模型与提示词版本、审核标记 |
| `knowledge_dependencies` | 知识点前置依赖，支撑学习路径与关卡解锁 |
| `user_achievements` | 用户与成就的多对多关系及解锁时间 |
| `daily_tasks` / `user_daily_tasks` | 每日任务定义与用户每日完成情况、经验领取 |
| `ai_configs` | 模型配置、密钥密文、提示词模板、版本、启停 |

### 5.2 核心表字段设计

**users**：`id`(UUID,PK)、`username`(UK)、`email`(UK,nullable)、`password_hash`、`role`(student/admin)、`level`、`exp`、`total_study_seconds`、`streak_days`、`last_active_date`、`avatar_url`、`status`、`created_at`、`updated_at`

**chapters**：`id`、`code`(CH01…CH11)、`name`、`description`、`order_index`、`unlock_condition`、`is_active`

**knowledge_points**：`id`、`chapter_id`(FK)、`code`、`name`、`difficulty`、`summary`、`core_concept_md`、`explanation_md`、`syntax_md`、`examples_json`、`line_explain_json`、`common_errors_json`、`confused_with_json`、`applications_json`、`related_kp_ids`、`estimated_minutes`、`order_index`、`is_active`

**questions**：`id`(UUID,PK)、`question_id`(业务编号,UK)、`chapter_id`、`knowledge_point_id`、`question_type`、`difficulty`、`question_content`、`code_content`、`code_language`、`options_json`、`correct_answer`、`explanation`、`score`、`tags_json`、`source_type`(preset/ai_generated)、`created_by`、`version`、`status`(active/deprecated)、`created_at`

**question_options**：`id`、`question_id`(FK)、`option_key`(A/B/C/D)、`option_content`、`is_correct`、`sort_order`

**question_drafts**：`id`、`provider`、`model_name`、`prompt_version`、`raw_payload_json`、`validation_status`(pending/validated/rejected)、`validation_report_json`、`human_reviewed`、`promoted_question_id`、`created_at`

**practice_sessions**：`id`、`user_id`、`config_json`、`status`(in_progress/submitted)、`started_at`、`submitted_at`、`time_limit_seconds`、`total_count`、`correct_count`、`accuracy`

**practice_answers**：`id`、`session_id`、`question_id`、`user_answer`、`is_correct`、`time_spent_seconds`、`hint_level_used`、`viewed_answer`、`attempted_at`

**exam_papers**：`id`、`name`、`config_json`、`type_score_json`、`total_score`、`question_count`、`created_by`、`status`(draft/published)

**exam_questions**：`id`、`paper_id`、`question_id`、`score`、`sort_order`

**exam_answer_keys**：`paper_id`、`question_id`、`correct_answer`、`explanation`

**exam_sessions**：`id`、`user_id`、`paper_id`、`status`(not_started/in_progress/submitted/expired)、`started_at`、`deadline_at`、`submitted_at`、`total_score`、`obtained_score`、`correct_count`、`accuracy`、`time_used_seconds`

**exam_answers**：`id`、`session_id`、`question_id`、`user_answer`、`marked`、`answered_at`、`is_correct`、`score_obtained`（后两个字段提交时由服务端写入）

**learning_records**：`id`、`user_id`、`record_type`(kp_study/practice/exam/game_level)、`ref_id`、`chapter_id`、`kp_id`、`duration_seconds`、`detail_json`、`created_at`

**wrong_questions**：`id`、`user_id`、`question_id`、`source`、`wrong_count`、`last_wrong_at`、`mastered`、`mastered_at`、`note`

**favorites**：`id`、`user_id`、`target_type`(question/knowledge_point)、`target_id`、`created_at`

**achievements / user_progress / daily_tasks / user_daily_tasks / ai_configs**：字段见 5.1 用途说明，实现阶段给出完整 DDL 与 Alembic 迁移。

### 5.3 索引与约束

- 所有外键建立索引；`questions(knowledge_point_id, difficulty, question_type, status)` 复合索引支撑筛选
- `wrong_questions(user_id, question_id)` 唯一约束，`favorites(user_id, target_type, target_id)` 唯一约束
- `exam_sessions.status` 状态机约束，禁止已提交会话被再次作答
- 所有时间字段统一 UTC，API 层转换为本地显示

### 5.4 关键 API 契约（草案）

```
认证   POST /api/auth/register | /login | GET /api/auth/me
知识   GET  /api/chapters | /api/chapters/{id}/knowledge-points | /api/knowledge-points/{id}
练习   POST /api/practice/sessions | POST /api/practice/sessions/{id}/answers
       POST /api/practice/sessions/{id}/submit | POST /api/practice/sessions/{id}/hint
考试   POST /api/exams/papers | POST /api/exams/sessions | GET /api/exams/sessions/{id}
       PUT  /api/exams/sessions/{id}/answers/{questionId}
       POST /api/exams/sessions/{id}/submit | GET /api/exams/sessions/{id}/report
题库   POST /api/questions/generate-draft | POST /api/question-drafts/{id}/validate | /promote
AI     POST /api/ai/explain | /analyze-code | /hint | /recommend   （exam 模式拒绝）
沙箱   POST /api/runner/execute
档案   GET  /api/archive/practice | /exams | /wrong-questions | /trends
游戏   GET  /api/game/map | POST /api/game/levels/{kpId}/attempt
```

---

## 6. 开发排期

### 6.1 里程碑（按你给定的优先级排序）

| 阶段 | 内容 | 优先级 | 相对工作量 | 完成标准 |
| --- | --- | --- | --- | --- |
| M0 技术底座 | 环境安装（PostgreSQL/可选 Docker）、项目脚手架、数据库与迁移、认证、设计令牌 | 前置 | S | 可注册登录，接口连通，样式令牌生效 |
| M1 知识体系与题库 | 11 章知识点录入、知识点学习中心、题库 CRUD、种子题 | P0 | L | 闭环 C1 跑通：学习→练习→存记录 |
| M2 练习中心 | 知识点选择、自动出题、答题、分层提示、答案解析、历史 | P0 | L | 闭环 C2 跑通，条件筛选真实生效 |
| M3 考试中心 | 组卷、服务端保密、计时、判分、报告 | P0 | L | 闭环 C3 跑通，权限隔离测试通过 |
| M4 学习档案 | 历史、错题、收藏、掌握度、趋势图 | P0/P1 | M | 闭环 C5 跑通，刷新后数据可恢复 |
| M5 游戏化 | 地图、关卡状态机、经验等级、成就、每日任务、章节挑战 | P1 | M | 闭环 C4 跑通，奖励来自真实答题 |
| M6 AI 与沙箱 | AI 助手、AI 动态出题与校验、C 代码在线运行 | P1 | L | 配置密钥后可真实运行；校验流程可验证 |
| M7 打磨与交付 | 微交互、响应式、测试报告、部署文档、已知问题清单 | P2 | M | 验收标准全部通过 |

工作量符号：S 小 / M 中 / L 大。日历天数取决于环境安装是否顺利与确认速度，确认后我会给出细化到每个里程碑的计划。

### 6.2 验收对照

| 验收项 | 对应里程碑 |
| --- | --- |
| 页面非静态，核心按钮可操作 | M0–M5 |
| 自动出题按所选条件真实执行 | M2、M3 |
| 练习/考试权限隔离有效 | M3 |
| 计时准确、判分准确 | M3 |
| 历史数据可恢复、刷新不丢 | M1–M4 |
| 无明显布局错乱、无未处理关键错误 | M7 |

---

## 7. 风险与待确认事项

### 7.1 风险

1. **环境依赖**：Docker / PostgreSQL 未安装，是 M0 与 M6 的前置阻塞项。
2. **题库冷启动**：11 章知识点 + 足够题量的种子题库是最大内容工作量；没有足量真实题目，自动出题和考试都会频繁出现"数量不足"。建议先为核心章节建足量题，其余章节逐步补充，并对不足情况给出明确提示。
3. **AI 不可验证性**：AI 生成题必须经过校验才可用；编程题无法稳定自动判定时，采用测试用例判题，否则不进入正式考试。
4. **沙箱安全**：未安装 Docker 时的子进程方案不具备多用户隔离能力，不能用于公开部署。
5. **参考图缺失**：视觉细节需补图后校准。

### 7.2 需要你确认的五个决策点

1. **技术栈**：确认采用 React+TS+Vite+Tailwind / FastAPI+PostgreSQL 方案？
2. **环境依赖**：是否安装 Docker 与 PostgreSQL？还是先按「SQLite + 子进程沙箱」的过渡方案跑通 MVP，后续再切换？
3. **首个开发里程碑范围**：确认先做 M0+M1+M2（学习+练习闭环），还是按 M0→M1→…逐阶段确认？
4. **登录方式**：MVP 先用「用户名+密码（本地账号）」是否满足？是否需要接入邮箱/第三方登录？
5. **AI 与参考图**：AI 供应商与密钥何时提供？两张参考图是否补发？

---

## 8. 确认后的下一阶段交付物

- 可运行的项目脚手架（前后端 + 数据库迁移）
- 设计令牌与基础组件库
- 知识点体系与种子题库（首批章节）
- M1（知识学习中心）+ M2（练习中心）的可运行代码与自测报告

> 在你确认上述决策点之前，不会生成业务代码。

---

## 9. 实施状态更新（2026-11-24）

决策已确认：M0+M1+M2 先行、便携 PostgreSQL、推荐技术栈、本地账号密码。随后继续完成全部核心模块。

| 里程碑 | 状态 | 交付内容 |
| --- | --- | --- |
| M0 技术底座 | 已完成 | 便携 PostgreSQL、FastAPI、JWT 认证、React+Vite+Tailwind、设计令牌 |
| M1 知识学习 | 已完成 | 12 章 / 75 知识点 / 488 题（含 LeetCode 官方真题）、知识学习中心 |
| M2 智能练习 | 已完成 | 五题库分类（LeetCode/专升本/本科/考研/AI）、条件组卷、三层提示、答案解析、判分与历史 |
| M3 模拟考试 | 已完成 | 服务端答案隔离、倒计时、交卷锁定、服务端判分、考试报告 |
| M5 游戏化 | 已完成 | 关卡状态机、经验等级、成就、每日任务、章节挑战与解锁 |
| M6 AI 与代码运行 | 已完成（受限） | AI 助手（考试模式禁用，已接入 DeepSeek 大模型）、gcc C11 校验 + 受限 C 子集解释器 |

**与原规划的差异**：
- Docker 未安装且无管理员权限，代码沙箱改为受限解释器（本机策略同时禁止执行新生成的 exe 与 DLL），生产部署仍需容器隔离。
- 已接入 DeepSeek 大模型（`deepseek-chat`，OpenAI 兼容协议），密钥存于服务端 `.env`，AI 助手与 AI 出题真实走大模型；未配置密钥时自动回退内置规则引擎。
- 题库已扩充至 488 道：LeetCode 题库从 leetcode.cn 官方 API/GraphQL 真实抓取中文编程题（非虚构）；专升本/本科/考研由 DeepSeek 按各自考纲批量生成并经严格校验入库。一道题可归入多个题库。
- 新增第五个「AI 题库」：练习组卷时用大模型按用户勾选的知识点/难度/题型实时生成题目直接组卷，不预先存库。
- 未做像素级视觉还原（参考图未附上）；考试题目仍来自固定题库以保证公平与保密，AI 动态出题不进入正式考试。

详细运行、测试与限制说明见 `C-Learning-OS/docs/RUNBOOK.md`、`TEST_REPORT.md`、`KNOWN_ISSUES.md`。
