"""AI 引擎：大模型调用 + 内置规则回退 + 受限 C 代码执行。"""
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import httpx

from ..config import settings
from .c_interpreter import run_source

COMPILE_ERROR_HINTS = [
    ("expected ';'", "分号缺失：检查上一行语句结尾，尤其是结构体定义、for 头部和 printf 调用之后。"),
    ("undeclared", "标识符未声明：变量在使用前必须先定义；检查拼写、作用域和头文件是否包含。"),
    ("implicit declaration", "函数未声明：C11 要求函数先声明后使用，请包含对应头文件或在调用前写函数原型。"),
    ("format '%d' expects", "格式符与参数类型不匹配：%d 对应 int，%f 对应 double（printf），%zu 对应 size_t。"),
    ("conflicting types", "函数声明与定义类型冲突：检查返回类型和参数列表是否一致。"),
    ("segmentation fault", "段错误：常见原因是空指针解引用、数组越界或访问已释放内存。"),
    ("division by zero", "除零错误：检查除数是否可能为 0，尤其是循环变量参与运算时。"),
    ("too few arguments", "实参数量不足：检查函数调用时是否漏传了参数。"),
    ("lvalue required", "赋值左侧不是可修改的左值：常量或表达式不能作为赋值目标。"),
    ("stray", "存在无法识别的字符：检查是否有中文标点、全角符号或遗漏的引号。"),
    ("redefinition", "重复定义：同名变量或函数在同一作用域定义多次。"),
]

CODE_PATTERNS = [
    (r"void\s+main\s*\(", "标准 C 要求 main 返回 int，请改为 int main(void)。"),
    (r"printf\s*\([^;]*\)\s*(?!;)\n", "检查 printf 后是否遗漏分号。"),
    (r"scanf\s*\(\s*\"%[sd f]|scanf\s*\(\s*\"%[sd f]",
     "scanf 读取普通变量时需要使用取地址符 &，如 scanf(\"%d\", &x)。"),
    (r"\bif\s*\([^)]*[^=!<>]=\s*[^)]*\)", "条件判断中应使用 == 而不是赋值运算符 =。"),
    (r"\bwhile\s*\(\s*1\s*\)", "while(1) 是无限循环，请确认是否有 break 或其他退出条件。"),
    (r"\bfree\s*\(", "调用 free 后应立即将指针置为 NULL，避免悬空指针。"),
    (r"\bgets\s*\(", "gets 已不被 C11 推荐，存在缓冲区溢出风险，请改用 fgets。"),
    (r"a\[\s*n\s*\]", "注意数组下标越界：长度为 n 的数组合法下标是 0 到 n-1。"),
]

DANGEROUS_PATTERNS = [
    (r"\bsystem\s*\(", "system() 调用"),
    (r"\bpopen\s*\(", "popen() 调用"),
    (r"\bexec[lvpe]*\s*\(", "exec 系列调用"),
    (r"\bfork\s*\(", "fork() 调用"),
    (r"\b(remove|unlink|rename)\s*\(", "文件删除/重命名调用"),
    (r"#\s*include\s*[<\"](unistd\.h|sys/|windows\.h|dirent\.h|dlfcn\.h)", "系统级头文件"),
    (r"\b(socket|connect|listen)\s*\(", "网络调用"),
    (r"__asm|asm\s*\(", "内联汇编"),
]


def _find_provider_config(db):
    from ..models import AiConfig
    row = db.query(AiConfig).filter(AiConfig.is_active.is_(True)).order_by(AiConfig.created_at.desc()).first()
    return row


def ai_status(db) -> dict:
    row = _find_provider_config(db)
    if row and row.api_key_encrypted:
        return {"configured": True, "source": "database", "provider": row.provider,
                "model": row.model_name, "base_url": row.base_url}
    if settings.ai_api_key:
        return {"configured": True, "source": "environment", "provider": settings.ai_provider or "openai",
                "model": settings.ai_model, "base_url": settings.ai_base_url}
    return {"configured": False, "source": "none", "provider": "", "model": "", "base_url": ""}


def _call_llm(db, prompt: str, max_tokens: int = 1200, temperature: float = 0.3) -> str:
    row = _find_provider_config(db)
    if row and row.api_key_encrypted:
        api_key, model, base_url = row.api_key_encrypted, row.model_name, row.base_url
    else:
        api_key, model, base_url = settings.ai_api_key, settings.ai_model, settings.ai_base_url
    if not api_key:
        raise RuntimeError("未配置大模型密钥")
    url = (base_url or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
    payload = {
        "model": model or "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "你是 C 语言教学助手，回答简洁、准确、有教学价值。使用中文。"},
            {"role": "user", "content": prompt[:6000]},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        response.raise_for_status()
        data = response.json()
    return data["choices"][0]["message"]["content"].strip()


def _local_answer(db, question: str | None, code: str | None,
                  error: str | None, topic: str | None) -> str:
    from ..models import KnowledgePoint

    blocks = []
    if error:
        matched = [hint for key, hint in COMPILE_ERROR_HINTS if key.lower() in error.lower()]
        blocks.append("【编译/运行错误解读】\n" + ("\n".join(f"· {h}" for h in matched[:4])
                     if matched else "未识别到常见错误模式。请把完整报错贴出，并优先检查报错首行的行号。"))

    if code:
        found = [hint for pattern, hint in CODE_PATTERNS if re.search(pattern, code, re.I)]
        blocks.append("【代码静态分析】\n" + ("\n".join(f"· {h}" for h in list(dict.fromkeys(found))[:5])
                      if found else "未发现常见模式问题。建议检查：变量初始化、数组边界、指针有效性、循环终止条件。"))

    if topic:
        kp = db.query(KnowledgePoint).filter(KnowledgePoint.name.like(f"%{topic}%")).first()
        if kp:
            errors = json.loads(kp.common_errors_json or "[]")
            blocks.append(
                f"【知识点：{kp.name}】\n{kp.summary}\n核心概念：{kp.core_concept_md[:400]}\n"
                + ("常见错误：" + "；".join(str(e) for e in errors[:3]) if errors else "")
            )

    if question:
        kp_names = []
        for kp in db.query(KnowledgePoint).all():
            if kp.name and (kp.name in question or kp.name[:4] in question):
                kp_names.append(kp.name)
        target = kp_names[0] if kp_names else "题目涉及的核心概念"
        blocks.append(
            "【解题思路】\n"
            f"1. 本题围绕「{target}」，先回到该知识点的定义与语法规则。\n"
            "2. 若是代码题，逐行跟踪变量取值，特别关注循环边界和运算符优先级。\n"
            "3. 排除与概念定义冲突的选项，再验证剩余选项是否能被题干条件支持。"
        )

    if not blocks:
        return ("我可以帮你解释 C 语言概念、分析代码、解读编译错误、梳理解题思路。\n"
                "请在右侧输入具体问题、代码片段或报错信息；考试模式下该助手会被系统禁用。")
    return "\n\n".join(blocks)


def answer(db, payload) -> dict:
    prompt_parts = []
    if payload.topic:
        prompt_parts.append(f"知识点：{payload.topic}")
    if payload.question:
        prompt_parts.append(f"问题：{payload.question}")
    if payload.code:
        prompt_parts.append(f"代码：\n{payload.code[:3000]}")
    if payload.error:
        prompt_parts.append(f"报错：{payload.error[:1500]}")
    prompt = "\n\n".join(prompt_parts) or "请介绍 C 语言学习要点。"
    try:
        return {"answer": _call_llm(db, prompt), "source": "llm"}
    except Exception:
        return {
            "answer": _local_answer(db, payload.question, payload.code, payload.error, payload.topic),
            "source": "local",
        }


def code_hint(db, payload) -> dict:
    """代码题三级思路提示：只讲方向与关键步骤，绝不输出完整答案代码。"""
    level = int(payload.level)
    qtype = payload.question_type or "编程题"
    difficulty = payload.difficulty or "中等"
    question = (payload.question or "").strip()
    code = (payload.code or "").strip()
    level_name = {1: "方向", 2: "关键步骤", 3: "易错与调试"}[level]

    prompt = (
        f"你是 C 语言编程题的提示助手。题目类型：{qtype}，难度：{difficulty}。\n"
        f"题干：\n{question[:2500]}\n\n"
        f"学生当前代码（可为空）：\n{code[:2500]}\n\n"
        f"请给出第 {level} 级提示（{level_name}）。要求：\n"
        "1. 用中文，不超过 160 字；\n"
        "2. 只讲思路、算法步骤、需要使用的语法或调试方向；\n"
        "3. 严禁给出完整代码、可粘贴的答案片段或直接写出最终输出；\n"
        "4. 不要评价分数，不要给出正确答案文本。"
    )
    try:
        return {"level": level, "title": level_name, "content": _call_llm(db, prompt), "source": "llm"}
    except Exception:
        pass

    # 规则回退：按层级给可执行的思路，不涉及具体答案
    base = {
        1: f"这是一道{qtype}（{difficulty}）。先读清输入与输出：确定需要读入哪些变量、最终要输出什么，再决定用顺序、分支还是循环结构。",
        2: "把任务拆成三步：读入数据 → 核心计算（可用 if/for/while 与数组） → 输出结果。先写出变量定义与 scanf/printf，再补中间逻辑。",
        3: "调试优先排查：变量是否初始化、数组是否越界、循环终止条件、scanf 是否加取地址符 &、printf 格式符是否匹配、main 是否返回 int。",
    }[level]
    hints = [base]
    if code:
        static = []
        for pattern, hint in COMPILE_ERROR_HINTS:
            if pattern.lower().split("'")[0].strip() in code.lower():
                static.append(hint)
        if re.search(r"\bwhile\s*\(\s*1\s*\)", code, re.I):
            static.append("代码中出现无限循环，请确认有 break 或明确的退出条件。")
        if static:
            hints.append("静态检查：" + "；".join(dict.fromkeys(static))[:3])
    return {
        "level": level,
        "title": level_name,
        "content": "\n".join(hints),
        "source": "local",
    }


def validate_c_code(code: str) -> str | None:
    if len(code) > 8000:
        return "代码长度不能超过 8000 字符"
    if not re.search(r"\bint\s+main\s*\(", code):
        return "必须包含 int main(...) 入口函数"
    for pattern, label in DANGEROUS_PATTERNS:
        if re.search(pattern, code, re.I):
            return f"出于安全限制，不允许使用{label}"
    return None


def run_c(code: str, stdin: str = "") -> dict:
    """安全执行：静态拦截 → gcc C11 编译校验 → 受限 C 子集解释器执行。
    本机应用控制策略禁止执行新生成的二进制，因此不生成可执行文件；
    解释器有步数上限，等价于超时保护。生产环境应使用容器隔离。"""
    problem = validate_c_code(code)
    if problem:
        return {"ok": False, "stage": "validation", "message": problem}
    compiler = shutil.which("gcc")
    compile_check = ""
    if compiler:
        tmp = tempfile.mkdtemp(prefix="clo_c_")
        try:
            src = Path(tmp) / "main.c"
            src.write_text(code, encoding="utf-8")
            try:
                checked = subprocess.run(
                    [compiler, "-std=c11", "-fsyntax-only", "-Wall", "main.c"],
                    cwd=tmp, capture_output=True, text=True, timeout=10,
                    errors="replace",
                    creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
                )
                compile_check = (checked.stderr or "")[:2000]
                if checked.returncode != 0:
                    return {"ok": False, "stage": "compile", "message": compile_check or "编译失败"}
            except subprocess.TimeoutExpired:
                return {"ok": False, "stage": "compile", "message": "编译检查超时（10 秒）"}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    result = run_source(code)
    payload = {
        "ok": result["ok"],
        "stage": "runtime",
        "stdout": result.get("stdout", ""),
        "exit_code": result.get("exit_code", -1),
        "compile_check": compile_check or (
            "通过 gcc -std=c11 语法检查" if compiler
            else "当前环境未安装 gcc，已跳过硬编译检查，由受限解释器直接执行"
        ),
        "engine": "restricted-interpreter",
        "limitation": "支持变量、数组、指针、函数、分支与循环及 printf/strlen/sizeof；不支持结构体、文件 IO、多线程等完整 C11 特性",
    }
    if not result["ok"]:
        payload["message"] = result.get("error", "执行失败")
    return payload
