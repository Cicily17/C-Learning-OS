# -*- coding: utf-8 -*-
"""题目生成引擎：大模型生成 + 本地规则生成 + 严格校验。

生成结果经校验通过后才写入 questions 表（status=active），
记录 source_type 为 'ai' 或 'custom'，并在 QuestionDraft 留存原始载荷与校验报告。
"""
import json
import random

from .ai.engine import _call_llm, ai_status
from . import models, question_banks

DIFFICULTIES = ["入门", "简单", "中等", "困难"]
TYPES = ["单项选择题", "多项选择题", "判断题", "填空题", "程序阅读题",
         "程序结果分析题", "找错题", "代码补全题", "编程题"]


def build_context(db, kp_ids: list[str]) -> list[dict]:
    """取知识点的名称、核心概念、常见错误，作为出题素材。"""
    if not kp_ids:
        rows = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.is_active.is_(True)).all()
    else:
        rows = db.query(models.KnowledgePoint).filter(models.KnowledgePoint.id.in_(kp_ids)).all()
    out = []
    for kp in rows:
        out.append({
            "id": kp.id, "chapter_id": kp.chapter_id, "code": kp.code, "name": kp.name,
            "difficulty": kp.difficulty,
            "summary": kp.summary or "",
            "concept": (kp.core_concept_md or "")[:600],
            "errors": json.loads(kp.common_errors_json or "[]"),
        })
    return out


def _ai_prompt(ctx: dict, qtype: str, difficulty: str) -> str:
    return f"""请为 C 语言学习者生成 1 道高质量练习题，严格返回 JSON（不要 Markdown 代码块）。

要求：
- 知识点：{ctx['name']}（{ctx['summary']}）
- 核心概念：{ctx['concept']}
- 常见错误：{json.dumps(ctx['errors'], ensure_ascii=False)}
- 题型：{qtype}
- 难度：{difficulty}
- 语言：中文；代码必须符合 C11 标准

JSON 字段（全部必填）：
{{
  "question_content": "题干",
  "code_content": "相关C代码，没有则空字符串",
  "options": [{{"key":"A","text":"选项内容"}}, ...],
  "correct_answer": "正确答案，如 A 或 A,B 或 具体文本",
  "explanation": "详细解析，说明为什么正确、其余为什么错",
  "score": 1
}}
规则：选择题必须有 4 个选项且答案在选项key中；判断题 options 固定为 A正确/B错误；
填空题/编程题 options 可为空数组；确保答案唯一且无歧义；不要虚构不存在于题干的信息。"""


def _parse_llm_question(text: str, qtype: str, difficulty: str) -> dict | None:
    """从大模型回复中稳健提取 JSON。"""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError:
        return None
    return {
        "question_content": str(data.get("question_content", "")).strip(),
        "code_content": str(data.get("code_content", "")).strip(),
        "options": data.get("options", []) if isinstance(data.get("options"), list) else [],
        "correct_answer": str(data.get("correct_answer", "")).strip(),
        "explanation": str(data.get("explanation", "")).strip(),
        "score": int(data.get("score", 1) or 1),
        "question_type": qtype, "difficulty": difficulty,
    }


# ---------- 本地模板生成（无大模型密钥时的真实可用回退）----------
def _local_question(ctx: dict, qtype: str, difficulty: str) -> dict:
    name, summary = ctx["name"], ctx["summary"]
    errors = ctx["errors"] or []
    wrong = errors[:3] or ["该描述颠倒了基本概念。", "该描述混淆了相邻知识点。", "该描述忽略了重要前提。"]

    if qtype == "判断题":
        good = f"{name}的相关描述符合其后总结的核心概念。"
        bad = errors[0] if errors else f"关于{name}的描述与事实相反。"
        use_truth = random.random() < 0.5
        statement = good if use_truth else bad
        return {
            "question_content": f"判断下列说法是否正确：{statement}",
            "code_content": "",
            "options": [{"key": "A", "text": "正确"}, {"key": "B", "text": "错误"}],
            "correct_answer": "A" if use_truth else "B",
            "explanation": (f"正确。{name}：{summary}" if use_truth
                            else f"错误。{name}：{summary}。题干表述与正确概念相违背。"),
            "score": 1,
        }
    if qtype == "填空题":
        key = name.replace("函数", "").replace("运算符", "")[:6] or name
        return {
            "question_content": f"在 C 语言中，与「{name}」直接相关的关键字或概念是 ______。（提示：{summary[:40]}）",
            "code_content": "", "options": [], "correct_answer": key,
            "explanation": f"本题考查{name}。{summary}", "score": 1,
        }
    if qtype == "编程题":
        return {
            "question_content": (f"【编程练习】请编写一段完整的 C 程序（C11 标准），演示并验证「{name}」的使用方法。"
                                 f"要求：包含 int main(void)，使用 printf 输出结果，代码可独立编译运行。"
                                 f"背景：{summary}"),
            "code_content": "#include <stdio.h>\n\nint main(void){\n    /* 在此编写你的代码 */\n    return 0;\n}",
            "options": [],
            "correct_answer": "参考要点：正确使用与「" + name + "」相关的语法，包含 int main(void) 与 printf 输出，代码可编译运行并通过测试用例。",
            "explanation": f"本题为编程题，采用测试用例或人工评价。核心考查：{name}。{summary}", "score": 3,
        }
    # 其他类型统一生成概念辨析选择题
    correct = summary or f"{name}的正确描述"
    distractors = [w for w in wrong if w != correct][:3]
    while len(distractors) < 3:
        distractors.append(f"关于{name}的一项不准确描述（第{len(distractors) + 1}项）")
    pairs = [(correct, True)] + [(d, False) for d in distractors]
    random.shuffle(pairs)
    keys = "ABCD"
    options = [{"key": keys[i], "text": str(t)} for i, (t, _) in enumerate(pairs)]
    answer = keys[next(i for i, (_, ok) in enumerate(pairs) if ok)]
    qcontent = (f"关于「{name}」，下列说法正确的是哪一项？" if qtype == "单项选择题"
                else f"阅读下列关于「{name}」的描述，选出正确的一项。")
    return {
        "question_content": qcontent, "code_content": "", "options": options,
        "correct_answer": answer,
        "explanation": f"正确答案对应「{name}」的核心概念：{summary}。其余选项为常见误区或不准确表述。",
        "score": 1,
    }


def validate_question(q: dict) -> tuple[bool, str]:
    """格式与答案校验，未通过不允许入正式题库。"""
    if not q.get("question_content") or len(q["question_content"]) < 6:
        return False, "题干为空或过短"
    if q.get("question_type") not in TYPES:
        return False, f"题型非法：{q.get('question_type')}"
    if q.get("difficulty") not in DIFFICULTIES:
        return False, f"难度非法：{q.get('difficulty')}"
    if not q.get("correct_answer"):
        return False, "缺少正确答案"
    if not q.get("explanation") or len(q["explanation"]) < 8:
        return False, "解析为空或过短"
    qtype, options, ans = q["question_type"], q.get("options", []), q["correct_answer"]
    keys = {str(o.get("key", "")).strip().upper() for o in options if isinstance(o, dict)}
    if qtype in ("单项选择题", "多项选择题", "判断题", "程序阅读题",
                 "程序结果分析题", "找错题", "代码补全题"):
        if len(options) < 2:
            return False, "选择题类必须有至少 2 个选项"
        if qtype == "判断题" and not keys.issuperset({"A", "B"}):
            return False, "判断题必须有 A/B 两个选项"
        picked = [x.strip().upper() for x in ans.replace("，", ",").split(",")]
        if not set(picked).issubset(keys):
            return False, f"答案 {ans} 不在选项 key 中"
        if qtype != "多项选择题" and len(picked) != 1:
            return False, "单选题答案必须唯一"
    if q.get("code_content") and len(q["code_content"]) > 8000:
        return False, "代码过长"
    return True, "通过"


def generate_questions(db, kp_ids: list[str], qtype: str, difficulty: str,
                       count: int, prefer_ai: bool = True) -> tuple[list[dict], dict]:
    """生成并校验题目，返回 (通过的题目列表, 报告)。不在此写库。"""
    ctxs = build_context(db, kp_ids)
    if not ctxs:
        return [], {"generated": 0, "valid": 0, "source": "none", "message": "没有可用的知识点"}
    use_llm = prefer_ai and ai_status(db).get("configured", False)
    results, report = [], {"generated": 0, "valid": 0, "source": "llm" if use_llm else "local",
                           "rejected": [], "provider": ai_status(db).get("provider", "")}
    for i in range(count):
        ctx = ctxs[i % len(ctxs)]
        q = None
        if use_llm:
            try:
                q = _parse_llm_question(_call_llm(db, _ai_prompt(ctx, qtype, difficulty)), qtype, difficulty)
            except Exception as exc:
                report.setdefault("llm_errors", []).append(str(exc)[:200])
        if q is None:
            q = _local_question(ctx, qtype, difficulty)
        # 确保题型与难度字段存在（本地生成器不返回这两项）
        q.setdefault("question_type", qtype)
        q.setdefault("difficulty", difficulty)
        report["generated"] += 1
        ok, reason = validate_question(q)
        if ok:
            q.update({"chapter_id": ctx["chapter_id"], "knowledge_point_id": ctx["id"],
                      "tags_json": json.dumps(["AI生成", ctx["name"]], ensure_ascii=False)})
            results.append(q)
            report["valid"] += 1
        else:
            report["rejected"].append(reason)
    return results, report


def persist_questions(db, questions: list[dict], user_id: str, source_type: str) -> list[str]:
    """校验通过的题目写入 questions，并留 QuestionDraft 记录，返回 question_id 列表。"""
    saved = []
    max_no = 0
    for q in db.query(models.Question).all():
        qid = q.question_id
        prefix = "AI" if source_type == "ai" else "CUS"
        if qid.startswith(prefix):
            try:
                max_no = max(max_no, int(qid[len(prefix):]))
            except ValueError:
                pass
    prefix = "AI" if source_type == "ai" else "CUS"
    for q in questions:
        max_no += 1
        qid = f"{prefix}{max_no:04d}"
        banks = question_banks.classify_banks(
            q["question_type"], q["difficulty"], q.get("tags_json", "[]")
        )
        # 调用方若指定了额外题库归属，合并进去（例如自动补题要求归入当前题库）
        extra = q.get("banks_json")
        if extra:
            try:
                for b in json.loads(extra):
                    if b not in banks:
                        banks.append(b)
            except (ValueError, TypeError):
                pass
        question = models.Question(
            question_id=qid, chapter_id=q["chapter_id"], knowledge_point_id=q["knowledge_point_id"],
            question_type=q["question_type"], difficulty=q["difficulty"],
            question_content=q["question_content"], code_content=q.get("code_content", ""),
            options_json=json.dumps(q.get("options", []), ensure_ascii=False),
            correct_answer=q["correct_answer"], explanation=q["explanation"],
            score=q.get("score", 1), tags_json=q.get("tags_json", "[]"),
            banks_json=json.dumps(banks, ensure_ascii=False),
            source_type=source_type, created_by=user_id, status="active",
        )
        db.add(question)
        db.add(models.QuestionDraft(
            provider="llm" if source_type == "ai" else "user",
            model_name="", prompt_version="v1",
            raw_payload_json=json.dumps(q, ensure_ascii=False),
            validation_status="passed",
            validation_report_json=json.dumps({"result": "内容格式与答案校验通过"}, ensure_ascii=False),
            human_reviewed=(source_type == "custom"),
            promoted_question_id=qid,
        ))
        saved.append(qid)
    db.commit()
    return saved
