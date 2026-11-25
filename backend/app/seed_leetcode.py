# -*- coding: utf-8 -*-
"""从 LeetCode 中国站官方 API 真实抓取编程题，转成 C 语言编程题入库。

数据源（官方）：
  - https://leetcode.cn/api/problems/all/         题目元数据（题号/标题/slug/难度）
  - https://leetcode.cn/graphql  question(titleSlug:)  中文题干 translatedContent / translatedTitle

题目经 clean_html 转纯文本、按 C 语言编程题规范包装，校验通过后入库，
打 leetcode 题库标签。幂等：按题干内容指纹去重。
"""
import html as html_mod
import json
import re
import sys
import time

import httpx

from .database import SessionLocal
from . import models, question_banks, question_generator

LIST_URL = "https://leetcode.cn/api/problems/all/"
GQL_URL = "https://leetcode.cn/graphql"
DIFF_MAP = {"Easy": "简单", "Medium": "中等", "Hard": "困难"}
# topicTags → 优先绑定的知识点 code 关键字
TAG_KP_HINT = {
    "Array": "数组", "String": "字符串", "Hash Table": "数组", "Two Pointers": "数组",
    "Sorting": "排序", "Binary Search": "查找", "Recursion": "递归", "Dynamic Programming": "综合编程",
    "Greedy": "综合编程", "Backtracking": "递归", "Tree": "综合编程", "Stack": "数组",
    "Queue": "数组", "Linked List": "指针", "Math": "运算符", "Bit Manipulation": "位运算",
}


def clean_html(raw: str) -> str:
    if not raw:
        return ""
    s = re.sub(r"<sup>(.*?)</sup>", r"^\1", raw, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_mod.unescape(s)
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def build_c_question(title: str, content: str, difficulty: str, tags: list[str],
                     frontend_id: str) -> dict:
    body = clean_html(content)
    tag_text = "、".join(tags[:4]) if tags else "基础算法"
    qcontent = (
        f"【LeetCode 官方编程题 #{frontend_id}·{title}】\n{body}\n\n"
        f"要求：用 C11 编写完整程序（含 int main(void)），通过标准输入输出完成上述功能。"
        f"核心考点：{tag_text}。"
    )
    code_frame = (
        "#include <stdio.h>\n\nint main(void){\n"
        "    /* 在此编写你的代码，读取输入并输出结果 */\n"
        "    return 0;\n}\n"
    )
    return {
        "question_type": "编程题",
        "difficulty": difficulty,
        "question_content": qcontent,
        "code_content": code_frame,
        "options": [],
        "correct_answer": (
            f"参考要点：按题干示例实现算法，正确处理边界条件；使用 C11 语法，"
            f"包含 int main(void)，通过 stdin 读取输入、printf 输出结果。考点：{tag_text}。"
        ),
        "explanation": (
            f"本题源自 LeetCode 官方题库第 {frontend_id} 题「{title}」，难度 {difficulty}。"
            f"核心考点为{tag_text}。解题时先理解示例的输入输出关系，再设计算法；"
            f"注意数组越界、边界值与时间复杂度。"
        ),
        "score": 3,
        "tags_json": json.dumps(["LeetCode", "官方真题", frontend_id] + tags[:4], ensure_ascii=False),
    }


def pick_kp(db, tags: list[str]):
    """按 topicTags 绑定到最贴近的知识点；优先 CH11 综合编程/排序查找。"""
    hints = [TAG_KP_HINT.get(t) for t in tags if t in TAG_KP_HINT]
    for kw in hints:
        kp = db.query(models.KnowledgePoint).filter(
            models.KnowledgePoint.name.like(f"%{kw}%")).first()
        if kp:
            return kp
    for fallback in ("综合编程任务", "排序与查找", "综合代码阅读"):
        kp = db.query(models.KnowledgePoint).filter(
            models.KnowledgePoint.name.like(f"%{fallback}%")).first()
        if kp:
            return kp
    return db.query(models.KnowledgePoint).first()


def content_fingerprint(text: str) -> str:
    return re.sub(r"\s+", "", text)[:200]


def fetch_questions(client: httpx.Client, limit: int) -> list[dict]:
    """取官方列表中的免费题，按编号从小到大取，批量拉中文题干。"""
    resp = client.get(LIST_URL)
    resp.raise_for_status()
    data = resp.json()
    pairs = [
        p for p in data["stat_status_pairs"]
        if not p.get("paid_only") and not p["stat"].get("question__hide")
    ]
    # 只取经典编号题（1~1500），按编号升序，题干质量稳定
    def fid(p):
        v = str(p["stat"].get("frontend_question_id", ""))
        return int(v) if v.isdigit() else 10**9
    pairs = sorted([p for p in pairs if fid(p) <= 1500], key=fid)[:limit]
    print(f"官方列表筛出 {len(pairs)} 道免费经典题")

    results = []
    batch = 15
    for i in range(0, len(pairs), batch):
        chunk = pairs[i:i + batch]
        fields = (
            "translatedTitle translatedContent difficulty topicTags { name } "
            "exampleTestcases"
        )
        alias_parts = []
        for j, p in enumerate(chunk):
            slug = p["stat"]["question__title_slug"]
            alias_parts.append(f'q{j}: question(titleSlug: "{slug}") {{ {fields} }}')
        query = "query { " + " ".join(alias_parts) + " }"
        try:
            r = client.post(GQL_URL, json={"query": query})
            r.raise_for_status()
            obj = r.json()
        except Exception as exc:
            print(f"  批次 {i//batch+1} 拉取失败：{exc}")
            continue
        gql_data = obj.get("data") or {}
        for j, p in enumerate(chunk):
            q = gql_data.get(f"q{j}")
            if not q or not q.get("translatedContent"):
                continue
            tags = [t["name"] for t in (q.get("topicTags") or [])]
            title = q.get("translatedTitle") or p["stat"]["question__title"]
            level = DIFF_MAP.get(q.get("difficulty"), "中等")
            fid_val = str(p["stat"].get("frontend_question_id", ""))
            results.append(build_c_question(title, q["translatedContent"], level, tags, fid_val))
        print(f"  批次 {i//batch+1}/{ (len(pairs)+batch-1)//batch } 完成，已取 {len(results)} 道")
        time.sleep(0.4)
    return results


def run(limit: int = 120):
    db = SessionLocal()
    existing = {content_fingerprint(q.question_content or "")
                for q in db.query(models.Question).all()}
    db.close()

    with httpx.Client(timeout=60.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
        questions = fetch_questions(client, limit)

    db = SessionLocal()
    added, skipped = 0, 0
    for q in questions:
        fp = content_fingerprint(q["question_content"])
        if fp in existing:
            skipped += 1
            continue
        existing.add(fp)
        # 校验
        ok, reason = question_generator.validate_question(q)
        if not ok:
            skipped += 1
            continue
        kp = pick_kp(db, json.loads(q["tags_json"]))
        q.update({
            "chapter_id": kp.chapter_id,
            "knowledge_point_id": kp.id,
            "tags_json": q["tags_json"],
        })
        q["banks_json"] = json.dumps(["leetcode"], ensure_ascii=False)
        question_generator.persist_questions(db, [q], None, "preset")
        added += 1
    db.close()
    print(f"\n完成：新增 {added} 道，跳过 {skipped} 道（重复或校验失败）")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    run(n)
