# C Learning OS

> 面向大学生与 C 语言初学者的**游戏化智能学习工作台**：知识学习、条件出题、限时练习、服务端保密的模拟考试、闯关地图、AI 助手与代码运行，全部围绕真实作答记录运转。

[![License: MIT](https://img.shields.io/badge/License-MIT-58EB04.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-149ECA.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org)

这不是一个静态展示页面，而是一套能真正跑起来的完整系统：12 章 / 75 个知识点、**586 道题（五个题库）**、14 套试卷、级联删除、服务端判分、真实经验值与成就解锁。所有统计数字都来自你的作答记录，没有一条是写死的。

<!-- 截图：工作台 / 闯关地图 / 代码答题区 -->
![学习工作台](docs/screenshots/dashboard.png)
![闯关地图](docs/screenshots/map.png)
![代码答题区](docs/screenshots/code-practice.png)

---

## 在线体验

**https://c-learning-os.app.workbuddy.host/?sharecode=AYKQHKKFE5**

演示环境为随包 SQLite 版本（无需外部数据库），注册即可使用；每次重新发布会把数据重置为种子题库，仅作体验。想长期使用请按下方「快速开始」本地部署。

---

## 功能亮点

| 模块 | 能力 |
| --- | --- |
| 学习工作台 | 今日任务舱：当前章节目标、等级环、正确率 / 掌握率 / 练习数 / 待复习错题四项 HUD，下方是三条主线入口、学习路径、今日任务、最近考试与正确率趋势 |
| 知识课堂 | 12 章 / 75 个知识点，章节目录 + 关键字搜索，教学详情（核心概念、语法、代码示例、逐行解释、常见错误、关联知识点），进度与收藏 |
| 编程练习 | 五题库（LeetCode / 专升本 / 本科 / 考研 / AI）、知识点树形多选、四档难度、自定义题量、六档时限、九种题型；实时可用题量预览，题量不足时自动补题 |
| 代码答题区 | 左题目 / 右代码的双栏布局：题目信息、测试方法提取、AI 思路提示；内联幽灵补全（输入前 2 个字母即联想，可 ↑↓ 挑选、Tab 接受）；底部运行区支持 stdin 与 gcc 语法检查 |
| 模拟考试 | 按章节 / 知识点 / 题型 / 分值组卷，倒计时自动交卷，答题卡与疑难标记，服务端判分，考试报告（分数构成、薄弱项、建议、导出） |
| 答案订正 | 练习与考试报告均支持**逐题对照**：题号导航（对绿错红）、只看错题、你的答案 / 正确答案 / 解析 / 得分，←→ 键翻题 |
| 闯关地图 | 4×3 蛇形 12 节点赛博朋克地图，四种关卡状态，经验值与等级、6 枚成就、3 项每日任务；解锁只看上一章挑战结果 |
| AI 助手 | 概念解释、代码分析、编译错误解读、错题复盘、复习建议；**考试进行中服务端直接拒绝辅助请求** |
| 学习档案 | 练习 / 考试历史、错题本、收藏；**删除单条或清空后，正确率面板、趋势与错题统计立即按剩余记录重算** |

### 几条不打折的业务规则

- **考试保密做在服务端**：答案存于独立表 `exam_answer_keys`；考试进行中的接口走字段白名单，不下发答案、解析、分值或分数；交卷前访问报告返回 403，重复交卷返回 400。
- **奖励不可伪造**：EXP 只由答对数、知识点掌握、挑战通过和考试成绩产生，没有前端加分入口。
- **删除是真删除**：级联清理作答明细与学习记录，并回退错题本计数，统计不会残留幽灵数据。
- **密钥不落前端**：AI Key 只存在服务端配置，配置接口不回传密钥。
- **不虚构数据**：条件不满足时返回 409 并提示放宽条件，没有记录就展示空状态。

---

## 技术栈

- **前端**：React 19 + TypeScript + Vite 6 + Tailwind CSS 3 + [Astryx](https://www.npmjs.com/package/@astryxdesign/core) 组件库（`c-cyber` 主题）+ ECharts + Prism + Lucide
- **后端**：Python 3.10+ / FastAPI + SQLAlchemy 1.4 + PostgreSQL（生产）或 SQLite（单端口发行版）+ PyJWT + bcrypt
- **AI**：兼容 OpenAI Chat Completions 协议（默认对接 DeepSeek）；未配置密钥时自动回退内置规则引擎，功能不中断
- **视觉**：Cyberpunk / Dark Tech，语义化设计 token 分色（荧光绿主操作、电光蓝学习、科技紫 AI、活力橙挑战、警示红错误），配色集中在 `frontend/src/styles/index.css` 与 `frontend/tailwind.config.js`

---

## 快速开始

### 前置条件

Python 3.10+、Node.js 18+、PostgreSQL 13+（也可直接用下方的 SQLite 单端口版本）；gcc 可选，仅用于代码的 C11 语法检查。

### 1. 后端

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env      # 改 DATABASE_URL / SECRET_KEY
createdb clearning

python -m app.seed              # 12 章 / 75 知识点 / 基础题库
python -m app.seed_expansion    # 扩充至 9 题型 × 4 难度
python -m app.migrate_banks     # 打题库标签（幂等）
python -m app.seed_leetcode 160 # 抓 LeetCode 中文真题（需联网）
python -m app.seed_bank_ai 本科 12   # 用大模型按考纲生成（需配置密钥）

uvicorn app.main:app --host 127.0.0.1 --port 8000   # 文档：/docs
```

`.env` 关键项：

```dotenv
DATABASE_URL=postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/clearning
SECRET_KEY=请替换为强随机字符串
CORS_ORIGINS=http://127.0.0.1:5174

# 可选：不填则用内置规则引擎
AI_PROVIDER=deepseek
AI_API_KEY=你的密钥
AI_MODEL=deepseek-chat
AI_BASE_URL=https://api.deepseek.com
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev        # http://127.0.0.1:5174，/api 已代理到 8000
```

打开 `/login` 注册账号即可，无需预置用户。

---

## 单端口发行版（一个进程 + 一个 SQLite 文件）

适合丢到一台小服务器上给别人用，不需要 PostgreSQL，也不需要两个端口：

```bash
npm --prefix frontend run build              # 先构建前端
python tools/build_single_port.py            # 打包到 build/single-port

cd build/single-port
pip install -r requirements.txt
PORT=8000 python main.py                     # API + 前端同端口
```

打包脚本会把后端代码、前端产物、`seed.db`（章节 / 知识点 / 题库 / 试卷，**不含任何用户数据**）和单端口入口组装到一起；首次启动自动把 `seed.db` 复制成 `data/app.db`，之后的数据都写在这个文件里。

---

## 测试

```bash
cd backend
PYTHONPATH=. python tests/test_flow.py      # 注册/学习/练习/判分/历史，21 项
PYTHONPATH=. python tests/test_phase2.py    # 考试保密、游戏化、AI、代码执行，42 项
PYTHONPATH=. python tests/test_phase3.py    # 题库扩充、AI 出题、自编题、删除历史，22 项
PYTHONPATH=. python tests/test_banks.py     # 五题库、按库组卷、AI 题库实时生成，21 项
```

四套端到端业务流共 **106 项断言**，使用随机用户名注册，不会污染正式数据。

---

## 目录结构

```
C-Learning-OS/
├── backend/
│   ├── app/
│   │   ├── routers/          # auth / learning / practice / exams / game / ai / questions
│   │   ├── ai/               # 规则引擎、LLM provider、C 子集解释器
│   │   ├── models.py         # 22 张数据表
│   │   ├── schemas.py        # 接口契约（含考试字段白名单）
│   │   ├── game_service.py   # 经验等级、成就、每日任务、章节解锁
│   │   ├── history_service.py# 删除记录时回退错题计数
│   │   └── seed*.py          # 分阶段种子数据与题库生成
│   └── tests/                # 端到端业务流测试
├── frontend/
│   └── src/
│       ├── pages/            # 工作台 / 知识 / 练习 / 考试 / 地图 / AI / 档案
│       ├── components/       # 布局、代码答题区、逐题订正等
│       ├── lib/              # C 关键字补全、光标测量
│       ├── themes/           # Astryx 主题（c-cyber）
│       └── api/              # HTTP 客户端
├── single_port/              # 单端口入口与依赖清单
├── tools/build_single_port.py
└── docs/                     # 运行说明、测试报告、已知问题、截图
```

主要数据表：`users`、`chapters`、`knowledge_points`、`questions`、`question_options`、`practice_sessions`、`practice_answers`、`exam_papers`、`exam_questions`、`exam_answer_keys`、`exam_sessions`、`exam_answers`、`learning_records`、`wrong_questions`、`favorites`、`achievements`、`user_progress`。

---

## API 概览

| 前缀 | 说明 |
| --- | --- |
| `/api/auth` | 注册、登录、当前用户 |
| `/api/learning` | 章节、知识点、学习进度、收藏、工作台统计 |
| `/api/practice` | 组卷、答题、提交判分、历史删除、错题、分层提示 |
| `/api/exams` | 组卷、考试过程、交卷判分、考试报告 |
| `/api/game` | 关卡地图、等级、成就、每日任务、章节挑战 |
| `/api/ai` | 助手对话、代码提示、C 代码运行、配置状态 |
| `/api/questions` | 可用量预览、AI 出题、自编题、我的题目 |

完整接口文档：启动后端后访问 `http://127.0.0.1:8000/docs`。

> 鉴权同时支持 `Authorization: Bearer <token>` 与 `X-Auth-Token: <token>`。后者用于网关会改写 `Authorization` 头的反向代理场景。

---

## 已知限制

- 代码运行使用**受限 C 子集解释器**（变量、数组、指针、递归、循环、`printf`、`strlen`、`sizeof`），不支持结构体与文件 IO；线上运行请放在容器里做资源隔离。
- 考试题目只来自固定题库，AI 实时出题不进入正式考试，以保证公平与可复核。
- `streak_days` 目前按练习提交累加，尚未按自然日零点刷新。
- AI 题库实时组卷依赖外部大模型，未配置密钥时会回退到本地题库。

---

## 参与贡献

Issue 与 PR 都欢迎。提交前请至少跑一遍 `backend/tests/` 与 `npm --prefix frontend run build`。

## License

[MIT](LICENSE) © 2026 Cicily
