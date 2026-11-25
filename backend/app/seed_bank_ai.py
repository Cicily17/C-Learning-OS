# -*- coding: utf-8 -*-
"""用 DeepSeek 按考试大纲批量生成题目，扩充专升本/本科/考研题库。

- 每个题库有独立的难度/题型定位与教学要求
- 一次让大模型生成一批（JSON 数组），严格校验后入库
- 幂等：按题干内容指纹去重
"""
import json
import random
import sys
import time

import httpx

from .ai.engine import ai_status
from .config import settings
from .database import SessionLocal
from . import models, question_generator


def call_llm_batch(db, prompt: str) -> str:
    """批量生成专用调用：max_tokens 更大，避免一次多题被截断。"""
    row = None
    from .models import AiConfig
    row = db.query(AiConfig).filter(AiConfig.is_active.is_(True)).order_by(AiConfig.created_at.desc()).first()
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
            {"role": "system", "content": "你是 C 语言教学题库编写专家，严格按 JSON 数组格式输出，不要 Markdown。"},
            {"role": "user", "content": prompt[:12000]},
        ],
        "temperature": 0.5,
        "max_tokens": 4000,
    }
    with httpx.Client(timeout=90.0) as client:
        response = client.post(url, json=payload,
                               headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()

BANK_PROFILES = {
    "专升本": {
        "label": "专升本 C 语言考试",
        "difficulty_pool": ["入门", "简单"],
        "type_pool": ["单项选择题", "判断题", "填空题", "多项选择题"],
        "focus": "侧重基础概念、语法规则、简单程序阅读，覆盖常量变量、表达式、顺序/分支/循环结构、数组、函数、指针基础。题目应贴合专升本公共课 C 语言考纲，难度偏低、答案唯一明确。",
    },
    "本科": {
        "label": "本科 C 语言课程",
        "difficulty_pool": ["简单", "中等"],
        "type_pool": ["单项选择题", "判断题", "填空题", "多项选择题", "程序阅读题", "程序结果分析题", "代码补全题"],
        "focus": "覆盖本科《C 语言程序设计》课程全部重点：数据类型、运算符、控制结构、数组、函数、指针、字符串、结构体、文件。含一定比例的程序阅读与结果分析题，难度中等。",
    },
    "考研": {
        "label": "考研 C 语言/C 程序设计",
        "difficulty_pool": ["中等", "困难"],
        "type_pool": ["单项选择题", "多项选择题", "程序阅读题", "程序结果分析题", "找错题", "代码补全题", "编程题"],
        "focus": "侧重综合与拔高：指针与地址运算、动态内存管理、结构体与链表、递归、复杂程序结果分析、算法复杂度。题目应有区分度，贴合考研专业课中 C 语言部分的要求。",
    },
}


def build_prompt(bank: str, kps: list[dict], n: int) -> str:
    p = BANK_PROFILES[bank]
    kp_lines = "\n".join(
        f"- {k['name']}：{k['summary'][:80]}" for k in kps
    )
    types = "、".join(p["type_pool"])
    diffs = "、".join(p["difficulty_pool"])
    return f"""你是资深 C 语言教师，正在为「{p['label']}」编写题库。

【命题范围】{p['focus']}

【本次要覆盖的知识点】
{kp_lines}

【要求】
- 生成 {n} 道互不相同的题目，题型从[{types}]中选择，难度从[{diffs}]中选择。
- 题型分布要多样，不要全是单选题；每道题都要给出难度和题型字段。
- 选择题必须有 4 个选项（key 为 A/B/C/D），正确答案填选项 key（多选填 A,B 形式）。
- 判断题选项固定为 A正确、B错误。
- 填空题/编程题 options 为空数组。
- 代码必须符合 C11 标准，答案唯一、无歧义；解析要说明为什么对、其余为什么错。
- 只返回纯 JSON 数组，不要 Markdown 代码块，不要任何额外文字。

【JSON 数组格式】
[
  {{"question_type":"单项选择题","difficulty":"简单","question_content":"题干",
    "code_content":"相关C代码或空","options":[{{"key":"A","text":"..."}},...],
    "correct_answer":"A","explanation":"详细解析","score":1}}
]"""


def parse_array(text: str) -> list[dict]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    start, end = cleaned.find("["), cleaned.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        data = json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def fingerprint(text: str) -> str:
    return __import__("re").sub(r"\s+", "", text or "")[:200]


def run(bank: str, batches: int = 8, per_batch: int = 6):
    if bank not in BANK_PROFILES:
        raise SystemExit(f"未知题库：{bank}")
    db = SessionLocal()
    existing = {fingerprint(q.question_content) for q in db.query(models.Question).all()}
    all_kps = db.query(models.KnowledgePoint).all()
    db.close()

    added, skipped, rejected = 0, 0, 0
    for b in range(batches):
        sample = random.sample(all_kps, min(10, len(all_kps)))
        ctx = [{"name": k.name, "summary": k.summary or "", "code": k.code} for k in sample]
        gen_db = SessionLocal()
        try:
            raw = call_llm_batch(gen_db, build_prompt(bank, ctx, per_batch))
        except Exception as exc:
            print(f"  批次 {b+1} 生成失败：{str(exc)[:150]}")
            gen_db.close()
            continue
        finally:
            gen_db.close()
        items = parse_array(raw)
        db = SessionLocal()
        for item in items:
            q = {
                "question_type": item.get("question_type", ""),
                "difficulty": item.get("difficulty", ""),
                "question_content": str(item.get("question_content", "")).strip(),
                "code_content": str(item.get("code_content", "")).strip(),
                "options": item.get("options", []) if isinstance(item.get("options"), list) else [],
                "correct_answer": str(item.get("correct_answer", "")).strip(),
                "explanation": str(item.get("explanation", "")).strip(),
                "score": int(item.get("score", 1) or 1),
            }
            # 强制题库定位：难度必须在 profile 范围内
            if q["difficulty"] not in BANK_PROFILES[bank]["difficulty_pool"]:
                q["difficulty"] = BANK_PROFILES[bank]["difficulty_pool"][0]
            if q["question_type"] not in BANK_PROFILES[bank]["type_pool"]:
                q["question_type"] = "单项选择题"
            ok, reason = question_generator.validate_question(q)
            if not ok:
                rejected += 1
                continue
            fp = fingerprint(q["question_content"])
            if fp in existing:
                skipped += 1
                continue
            existing.add(fp)
            kp = sample[random.randrange(len(sample))]
            q.update({
                "chapter_id": kp.chapter_id,
                "knowledge_point_id": kp.id,
                "tags_json": json.dumps([bank + "考试", kp.name], ensure_ascii=False),
                "banks_json": json.dumps([bank], ensure_ascii=False),
            })
            question_generator.persist_questions(db, [q], None, "preset")
            added += 1
        db.close()
        print(f"  批次 {b+1}/{batches}：返回 {len(items)} 道，累计入库 {added}（去重{skipped}/驳回{rejected}）")
        time.sleep(0.5)
    print(f"\n[{bank}] 完成：新增 {added} 道")


if __name__ == "__main__":
    bank = sys.argv[1] if len(sys.argv) > 1 else "专升本"
    batches = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    run(bank, batches)
