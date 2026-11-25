# C Learning OS

> 面向大学生与 C 语言初学者的游戏化智能学习工作台 —— 学习、练习、考试、复盘一体化。

C Learning OS 不是一个静态展示页面，而是一个具备真实数据读写的完整学习系统：知识点学习、条件化自动出题、限时练习、服务端保密的模拟考试、闯关升级、AI 助手与代码实验室，全部围绕真实作答记录运转。

---

## 功能特性

| 模块 | 已实现能力 |
| --- | --- |
| 学习工作台 | 真实统计数据（学习时长、答题数、连续天数、掌握率）、正确率趋势图、最近考试成绩、今日任务、最近学习记录 |
| 知识学习中心 | 12 章 / 75 个知识点体系，章节目录与搜索，教学详情（核心概念、语法、代码示例、逐行解释、常见错误、关联知识点），代码高亮与复制，学习进度与收藏 |
| 智能练习中心 | **四个题库可选（LeetCode / 专升本 / 本科 / 考研）**、知识点树形多选、四档难度、5/10/20/30/50 及自定义题量、六档时限、九种题型、按库自动组卷；三层 AI 提示、参考答案与解析、收藏、跳过、自动保存；**实时可用题量预览 + 题量不足自动补题，不再出现"没有题目"** |
| 题库与自编题 | 165+ 道题覆盖全部 9 题型 × 4 难度，按题型与难度归入四个题库（一道题可属多库）；**AI 按条件+题库出题**（配置密钥走大模型，否则本地模板生成）、**用户自编题**，均经服务端校验后入题库；支持查看和删除自己创建的题目 |
| 模拟考试中心 | 按章节/知识点/题型/分值配置试卷，倒计时与自动交卷，答题卡与疑难标记，服务端判分，考试报告（分数、知识点与题型得分、错题、薄弱项、建议、导出） |
| 游戏化闯关 | 12 章关卡地图、四种关卡状态、经验值与等级、6 枚成就、3 项每日任务、章节挑战解锁下一章；奖励全部来自真实作答 |
| AI 学习助手 | 概念解释、代码分析、编译错误解读、错题分析、复习建议；**考试模式下服务端直接拒绝辅助请求** |
| 代码实验室 | gcc C11 语法校验 + 受限 C 子集解释器执行（变量、数组、指针、递归、循环、`printf`、`strlen`、`sizeof`），危险调用静态拦截 |
| 学习档案 | 练习历史、考试历史、错题本、收藏、基于历史表现的复习建议；**支持删除单条记录与一键清空**，级联清理关联数据 |

### 核心业务规则

- **考试保密落实在服务端**：答案写入独立表 `exam_answer_keys`；考试进行中的接口使用字段白名单，不下发答案、解析、分值、正确率或分数；交卷前访问报告返回 403；重复交卷返回 400；判分只在提交时由服务端执行。
- **奖励不可伪造**：EXP 只由答对数、知识点掌握、挑战通过和考试成绩产生。
- **不虚构数据**：题量或分值不满足条件时返回 409 并提示放宽条件；无学习记录时展示空状态。
- **密钥不落前端**：AI 密钥只保存在服务端配置中，配置接口不回传密钥。

---

## 技术栈

**前端**：React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + ECharts + Prism + Lucide Icons

**后端**：Python 3 / FastAPI + SQLAlchemy 1.4 + PostgreSQL + PyJWT + bcrypt

**工程**：端到端业务流测试（httpx）、自动种子数据、REST API（OpenAPI 文档）、Vite 开发代理

---

## 快速开始

### 前置条件

- Python 3.10+ 与 Node.js 18+
- PostgreSQL 13+（本地或远程均可）
- gcc（仅代码实验室的 C11 语法校验需要，可选）

### 1. 配置数据库

```bash
createdb clearning
```

复制环境变量模板并按需修改：

```bash
cd backend
cp .env.example .env
```

关键配置：

```dotenv
DATABASE_URL=postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/clearning
SECRET_KEY=请替换为强随机字符串
CORS_ORIGINS=http://127.0.0.1:5174

# AI 大模型（可选，兼容 OpenAI Chat Completions 协议）
# 已验证可用的示例：DeepSeek
AI_PROVIDER=deepseek
AI_API_KEY=你的密钥
AI_MODEL=deepseek-chat
AI_BASE_URL=https://api.deepseek.com
```

> 配置大模型密钥后，AI 助手对话与「AI 出题」会自动改走真实大模型；未配置时仍以本地规则引擎回退，功能不中断。密钥只保存在后端 `.env`（已被 `.gitignore` 排除），不会下发前端。也可由管理员通过 `PUT /api/ai/config` 写入服务端配置（优先于环境变量）。

### 2. 初始化知识点与题库

```bash
cd backend
python -m venv .venv
# Windows: ./.venv/Scripts/activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed
python -m app.seed_expansion      # 扩充题库至 165 道（覆盖 9 题型 × 4 难度）
python -m app.migrate_banks       # 为题目打题库标签（LeetCode/专升本/本科/考研），幂等
```

种子数据：**12 章、75 个知识点、165 道题目**（幂等，已存在则跳过）。题库分类脚本可按题型与难度为题目打标签，一道题可属于多个题库。

### 3. 启动服务

```bash
# 后端 → http://127.0.0.1:8000  (文档 /docs)
cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# 前端 → http://127.0.0.1:5174
cd frontend
npm install
npm run dev
```

前端 Vite 已将 `/api` 代理到后端 `8000` 端口；若需换端口，同步修改 `vite.config.ts` 的 `server.port` 与后端 `CORS_ORIGINS`。

> 提示：5173 若被其他项目占用，本项目固定使用 5174。

首次使用请在 `/login` 页面注册账号，无需预置账号。

---

## 运行测试

```bash
cd backend
PYTHONPATH=. python tests/test_flow.py      # M0–M2：注册/学习/练习/判分/历史，21 项断言
PYTHONPATH=. python tests/test_phase2.py    # M3–M6：考试保密与判分/游戏化/AI/代码执行，42 项断言
PYTHONPATH=. python tests/test_phase3.py    # 题库扩充/AI出题/自编题/自动补足/删除历史，22 项断言
PYTHONPATH=. python tests/test_banks.py     # 四题库分类/按库组卷/按库可用量/AI出题归库，16 项断言
```

三套测试共 **85 项断言**，均通过。测试使用随机用户名注册，不会污染正式账号数据。

题库初始化后如需单独补充扩充题（幂等，可重复执行）：
```bash
cd backend && python -m app.seed_expansion
```

---

## 目录结构

```
C-Learning-OS/
├── backend/
│   ├── app/
│   │   ├── routers/          # auth / learning / practice / exams / game / ai
│   │   ├── ai/               # 规则引擎、AI provider、C 子集解释器
│   │   ├── models.py         # 22 张数据表
│   │   ├── schemas.py        # 接口契约（含考试字段白名单）
│   │   ├── game_service.py   # 经验等级、成就、每日任务、关卡解锁
│   │   ├── seed_data.py      # 章节/知识点/题库种子
│   │   └── seed.py           # 初始化入口
│   ├── tests/                # 端到端业务流测试
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/            # 工作台/学习/练习/考试/地图/AI/档案
│       ├── components/       # 布局、通用面板
│       └── api/              # HTTP 客户端
└── docs/
    ├── RUNBOOK.md            # 运行说明（含本机环境适配）
    ├── TEST_REPORT.md        # 功能测试报告
    ├── KNOWN_ISSUES.md       # 已知问题与限制
    └── C-Learning-OS-Phase1-架构规划.md
```

主要数据表：`users`、`chapters`、`knowledge_points`、`questions`、`question_options`、`practice_sessions`、`practice_answers`、`exam_papers`、`exam_questions`、`exam_answer_keys`、`exam_sessions`、`exam_answers`、`learning_records`、`wrong_questions`、`favorites`、`achievements`、`user_progress` 等。

---

## API 概览

| 前缀 | 说明 |
| --- | --- |
| `/api/auth` | 注册、登录、当前用户 |
| `/api/learning` | 章节、知识点、学习进度、收藏、工作台统计 |
| `/api/practice` | 组卷、答题、提交判分、历史、错题、分层提示 |
| `/api/exams` | 试卷配置与组卷、考试过程、交卷判分、考试报告 |
| `/api/game` | 关卡地图、等级、成就、每日任务、章节挑战 |
| `/api/ai` | 助手对话、模式隔离、C 代码运行、服务端配置状态 |
| `/api/questions` | 可用量预览、AI 出题、自编题、我的题目、题目删除 |

完整接口文档见 `http://127.0.0.1:8000/docs`。

---

## 已知限制

- 代码实验室使用**受限 C 子集解释器**而非完整 C11 沙箱：不支持结构体、文件 IO 等特性；生产部署仍应使用 Docker/容器隔离。
- AI 已接入 DeepSeek 大模型（服务端 `.env` 配置，兼容 OpenAI 协议）；也可切换为其他兼容 Chat Completions 的服务商。未配置密钥时自动回退内置规则引擎。AI 动态出题尚未接入正式考试（考试题目来自固定题库以保证公平与保密）。
- 开发环境因系统策略做过适配（便携版 PostgreSQL、SQLAlchemy 1.4、固定端口 5174），详情见 `docs/RUNBOOK.md` 与 `docs/KNOWN_ISSUES.md`。
- `streak_days` 目前按练习提交累加，尚未实现按自然日刷新。

---

## 文档

- [运行说明](docs/RUNBOOK.md)
- [功能测试报告](docs/TEST_REPORT.md)
- [已知问题清单](docs/KNOWN_ISSUES.md)
- [架构与排期规划](docs/C-Learning-OS-Phase1-架构规划.md)
