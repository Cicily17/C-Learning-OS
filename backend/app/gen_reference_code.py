"""把编程题的「参考要点」文字替换为可编译的 C11 参考代码。

用大模型逐题生成，生成后立刻用 gcc -std=c11 做语法/编译校验；
校验失败会自动带错误信息重试一次，仍失败则跳过并记录，方便下次续跑。

用法（在 backend 目录下）：
    .venv/Scripts/python.exe -m app.gen_reference_code --limit 5 --dry-run
    .venv/Scripts/python.exe -m app.gen_reference_code
    .venv/Scripts/python.exe -m app.gen_reference_code --force --limit 20
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
import time

from . import models
from .ai.engine import _call_llm
from .database import SessionLocal

PROMPT = """请为下面这道 C 语言编程题写一份参考答案：一个完整、可编译的 C11 程序。

硬性要求：
1. 只输出一个 ```c 代码块，代码块之外不要写任何解释。
2. 必须是完整程序：包含必要头文件与 int main(void)，能通过 gcc -std=c11 -Wall 编译。
3. 严格按题干的输入/输出格式：从 stdin 读取，向 stdout 输出。LeetCode 题干里的
   「输入：x = 2.00000, n = 10」表示依次读入这些值（空白分隔）。
4. 关键步骤写简短中文注释，用 // 注释，不要出现中文标点以外的特殊符号。
5. 不要使用 system/popen/fork/文件读写等系统调用，只用标准库。
6. 代码控制在 60 行以内，变量名有意义。

题目：
{content}
"""

FENCE = re.compile(r"```(?:c|cpp|C)?\s*\n(.*?)```", re.S)


def extract_code(text: str) -> str:
    m = FENCE.search(text)
    code = m.group(1) if m else text
    if "#include" in code:
        code = code[code.index("#include"):]
    return code.strip()


def looks_complete(code: str) -> bool:
    if "#include" not in code or not re.search(r"\bint\s+main\s*\(", code):
        return False
    if code.count("{") != code.count("}"):
        return False
    return True


def compile_check(code: str) -> tuple[bool, str]:
    gcc = os.environ.get("CC", "gcc")
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "ref.c")
        with open(src, "w", encoding="utf-8") as fh:
            fh.write(code)
        try:
            proc = subprocess.run(
                [gcc, "-std=c11", "-Wall", "-Wextra", "-fsyntax-only", src],
                capture_output=True, text=True, timeout=30,
            )
        except FileNotFoundError:
            return True, "gcc 不可用，跳过编译校验"
        except subprocess.TimeoutExpired:
            return False, "编译超时"
        out = (proc.stderr or "").strip()
        return proc.returncode == 0, out[:800]


def needs_code(q: models.Question) -> bool:
    ans = (q.correct_answer or "").strip()
    return "#include" not in ans or "int main" not in ans


def generate_for(db, q, attempts: int = 2) -> tuple[str | None, str]:
    content = (q.question_content or "").strip()[:1800]
    last_err = ""
    code = None
    for i in range(attempts):
        prompt = PROMPT.format(content=content)
        if last_err:
            prompt += f"\n\n上一次生成的代码编译报错如下，请修正后重新给出完整代码：\n{last_err}"
        raw = _call_llm(db, prompt, max_tokens=2400)
        code = extract_code(raw)
        if not looks_complete(code):
            last_err = "输出不是完整的 C 程序（缺少 #include 或 int main，或花括号不配对）"
            continue
        ok, err = compile_check(code)
        if ok:
            return code, ""
        last_err = err
    return None, last_err


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true", help="已有代码的题目也重新生成")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--types", default="编程题")
    args = ap.parse_args()

    db = SessionLocal()
    types = [t.strip() for t in args.types.split(",") if t.strip()]
    rows = db.query(models.Question).filter(models.Question.question_type.in_(types)).all()
    todo = [q for q in rows if args.force or needs_code(q)]
    if args.limit:
        todo = todo[: args.limit]
    print(f"待生成 {len(todo)} / 共 {len(rows)} 道", flush=True)

    ok_count = fail_count = 0
    for idx, q in enumerate(todo, 1):
        started = time.time()
        try:
            code, err = generate_for(db, q)
        except Exception as exc:  # 网络/额度异常都不应中断整批
            code, err = None, f"调用失败：{exc}"
        if code:
            if args.dry_run:
                print(f"\n[{idx}/{len(todo)}] {q.id[:8]} 代码预览：\n{code}\n", flush=True)
            else:
                q.correct_answer = code
                db.commit()
                print(f"[{idx}/{len(todo)}] {q.id[:8]} 已写入 {len(code.splitlines())} 行 · {time.time()-started:.1f}s", flush=True)
            ok_count += 1
        else:
            fail_count += 1
            print(f"[{idx}/{len(todo)}] {q.id[:8]} 失败：{err[:200]}", flush=True)
        time.sleep(0.3)

    print(f"完成：成功 {ok_count}，失败 {fail_count}", flush=True)
    db.close()
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
