# C Learning OS — 运行说明（全模块 M0–M6）

## 一、环境依赖的实际落地情况

| 依赖 | 原计划 | 实际方案 | 原因 |
| --- | --- | --- | --- |
| PostgreSQL | 系统安装 | **便携版 16.4**，位于 `.runtime/pg/` | 当前用户无管理员权限，无法系统级安装 |
| SQLAlchemy | 2.x | **1.4.54（纯 Python 模式）** | 系统应用控制策略拦截了 2.x 的 C 扩展 DLL；已在 `database.py` 设置 `SQLALCHEMY_NO_CEXTENSIONS=1` |
| 数据库驱动 | psycopg 3 | **psycopg2-binary** | SQLAlchemy 1.4 不支持 `postgresql+psycopg` 方言 |
| Docker / C 沙箱 | 容器隔离 | **gcc C11 编译校验 + 受限 C 子集解释器** | 本机策略禁止执行任何新生成的 exe/DLL（WinError 4551）；解释器纯 Python 执行，带 20 万步上限 |
| AI 大模型 | 必接 | **可选配置**，未配置时用内置规则引擎 | 密钥只存服务端；配置后自动切换为大模型生成 |

## 二、启动步骤

### 1. 启动数据库（每次开机后执行一次）

```bash
"C:/Users/Cicily/WorkBuddy/2026-11-24-17-08-41/.runtime/pg/pgsql/pgsql/bin/postgres.exe" \
  -D "C:/Users/Cicily/WorkBuddy/2026-11-24-17-08-41/.runtime/pg/data"
```

数据库 `clearning`、用户 `postgres`（trust 认证）已初始化完成。

### 2. 启动后端

```bash
cd C-Learning-OS/backend
./.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- 健康检查：`http://127.0.0.1:8000/api/health`
- 接口文档：`http://127.0.0.1:8000/docs`

### 3. 启动前端

```bash
cd C-Learning-OS/frontend
npm run dev
```

- 访问地址：**http://127.0.0.1:5174/**（5173 被本机其他项目占用，已固定为 5174）
- Vite 已配置 `/api` 代理到后端 8000

### 4. 初始化/重建数据

```bash
cd C-Learning-OS/backend && ./.venv/Scripts/python -m app.seed
```

已存在数据时跳过。成就与每日任务在首次访问游戏化接口时幂等初始化。

## 三、当前可用功能

| 模块 | 功能 |
| --- | --- |
| 学习工作台 | 8 项真实统计、正确率趋势（ECharts）、最近考试成绩、今日任务、最近记录 |
| 知识学习中心 | 12 章 / 75 知识点、搜索筛选、教学详情、代码高亮复制、进度与收藏 |
| 智能练习中心 | 知识点树形多选、难度/题量/时间/题型配置、自动组卷、三层提示、参考答案、自动保存 |
| 模拟考试中心 | 考试须知、按范围与题型组卷、倒计时、答题卡与疑难标记、自动保存、交卷锁定、服务端判分、考试报告与导出 |
| 游戏化闯关 | 12 章地图、关卡状态机、经验等级、成就徽章、每日任务、章节挑战与解锁 |
| AI 助手 | 概念解释、代码分析、编译错误解读、复习建议；**考试模式服务端禁用** |
| 代码实验室 | C11 语法校验 + 受限解释器执行（变量/数组/指针/函数/分支/循环/printf/strlen/sizeof） |
| 学习档案 | 练习历史、考试历史、错题本、收藏、AI 复习建议 |

## 四、核心业务规则

- **考试保密**：答案写入独立表 `exam_answer_keys`；考试中接口使用白名单字段，不下发答案/解析/分值/正确率/分数；交卷前访问报告返回 403；判分只在服务端提交时执行；重复交卷返回 400。
- **奖励真实性**：EXP 只由真实答对数、知识点掌握、挑战通过和考试成绩产生，不随页面点击发放。
- **题量不足**：明确返回 409 并提示放宽条件，不虚构题目。
- **代码安全**：危险系统调用静态拦截；gcc 只做 `-fsyntax-only` 校验，不生成可执行文件；解释器有步数上限，死循环会被终止。

## 五、常用账号与测试

测试时直接注册新账号。端到端脚本使用随机用户名。

```bash
cd C-Learning-OS/backend
PYTHONPATH=. ./.venv/Scripts/python tests/test_flow.py      # M0–M2，21 项断言
PYTHONPATH=. ./.venv/Scripts/python tests/test_phase2.py    # M3–M6，42 项断言
```

两项测试均通过。详细结果见 `TEST_REPORT.md`。
