# -*- coding: utf-8 -*-
"""第三阶段端到端测试：题库扩充、AI/自编题、自动补足、删除历史。"""
import json
import random
import string
import sys

import httpx

BASE = "http://127.0.0.1:8000/api"
client = httpx.Client(base_url=BASE, timeout=60.0)

passed = 0
failed = []


def check(name, cond, detail=""):
    global passed
    if cond:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed.append(f"{name} {detail}")
        print(f"  [FAIL] {name} {detail}")


def token_headers(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    uname = "t3_" + "".join(random.choices(string.ascii_lowercase, k=8))
    r = client.post("/auth/register", json={"username": uname, "password": "test123456"})
    check("注册", r.status_code == 200, r.text[:200])
    token = r.json()["access_token"]
    H = token_headers(token)

    # 1. 题库覆盖度：9 种题型、4 档难度都有题
    r = client.post("/questions/availability", json={}, headers=H)
    check("可用量接口", r.status_code == 200, r.text[:200])
    avail = r.json()
    check("题库总量 > 150", avail["bank_total"] > 150, str(avail["bank_total"]))
    by_type = avail["by_type_all"]
    expected_types = ["单项选择题", "多项选择题", "判断题", "填空题", "程序阅读题",
                      "程序结果分析题", "找错题", "代码补全题", "编程题"]
    check("9 种题型全覆盖", all(t in by_type and by_type[t] > 0 for t in expected_types), str(by_type))

    # 2. 筛选条件生效：只选"编程题"
    r = client.post("/questions/availability", json={"question_types": ["编程题"]}, headers=H)
    check("按题型筛选可用量", r.status_code == 200 and r.json()["available"] >= 4, r.text[:200])

    # 3. AI 出题（无密钥时本地回退，仍需真实校验入库）
    kps = client.get("/learning/knowledge-points", headers=H).json()
    kp = kps[0]
    r = client.post("/questions/ai-generate", json={
        "knowledge_point_ids": [kp["id"]], "qtype": "判断题", "difficulty": "简单", "count": 3,
    }, headers=H)
    check("AI 出题", r.status_code == 200, r.text[:300])
    if r.status_code == 200:
        data = r.json()
        check("AI 生成 3 道", data["generated"] == 3, str(data.get("generated")))
        check("AI 题目来源=llm/local", data["report"]["source"] in ("llm", "local"), str(data["report"]))
        check("AI 题目已入题库", len(data["question_ids"]) == 3, str(data.get("question_ids")))

    # 4. 自编题
    r = client.post("/questions/custom", json={
        "chapter_id": kp["chapter_id"], "knowledge_point_id": kp["id"],
        "question_type": "单项选择题", "difficulty": "中等",
        "question_content": "这是一道自编的测试题目，关于 C 语言变量的正确描述是哪项？",
        "options": [{"key": "A", "text": "变量必须先声明后使用"}, {"key": "B", "text": "变量无需声明"},
                    {"key": "C", "text": "变量不能赋值"}, {"key": "D", "text": "以上都错"}],
        "correct_answer": "A", "explanation": "C 语言要求变量先声明后使用，这是基本语法规则。",
        "score": 1,
    }, headers=H)
    check("自编题", r.status_code == 200, r.text[:300])
    custom_qid = r.json().get("question_id") if r.status_code == 200 else None

    # 5. 我的题目列表
    r = client.get("/questions/mine", headers=H)
    check("我的题目列表", r.status_code == 200 and len(r.json()) >= 4, r.text[:200])

    # 6. 自编题校验失败拦截（答案为非法选项）
    r = client.post("/questions/custom", json={
        "chapter_id": kp["chapter_id"], "knowledge_point_id": kp["id"],
        "question_type": "单项选择题", "difficulty": "中等",
        "question_content": "这是一道应当被校验拦截的题目，答案不在选项中？",
        "options": [{"key": "A", "text": "甲"}, {"key": "B", "text": "乙"}],
        "correct_answer": "Z", "explanation": "这是一个足够长度的解析说明文本，用于测试校验逻辑。",
        "score": 1,
    }, headers=H)
    check("非法答案被拦截", r.status_code == 422, r.text[:200])

    # 7. 关键：勾选一个题目稀少的组合 + 大题量，验证自动补足（不再报"没有题目"）
    # 选一个具体知识点 + 平时最少的题型
    r = client.post("/practice/sessions", json={
        "knowledge_point_ids": [kps[-1]["id"]],  # 最后一个知识点
        "question_types": ["代码补全题"],  # 稀少题型
        "difficulties": ["困难"],  # 稀少难度
        "count": 4,
    }, headers=H)
    check("稀少条件自动补足组卷成功", r.status_code == 200, r.text[:400])
    if r.status_code == 200:
        d = r.json()
        check("组卷题量正确", d["total_count"] == 4, str(d["total_count"]))
        check("返回自动补足标记字段", "auto_generated" in d, str(d.keys()))

    # 8. 提交练习 -> 产生历史
    sid = r.json()["session_id"] if r.status_code == 200 else None
    if sid:
        questions = r.json()["questions"]
        for q in questions:
            client.post(f"/practice/sessions/{sid}/answers", json={
                "question_id": q["id"], "user_answer": "", "time_spent_seconds": 0,
            }, headers=H)
        sub = client.post(f"/practice/sessions/{sid}/submit", headers=H)
        check("提交练习", sub.status_code == 200, sub.text[:200])

    r = client.get("/practice/history", headers=H)
    check("产生练习历史", r.status_code == 200 and len(r.json()) >= 1, r.text[:200])

    # 9. 删除单条历史
    if sid:
        r = client.delete(f"/practice/history/{sid}", headers=H)
        check("删除单条练习历史", r.status_code == 200, r.text[:200])
        r = client.get("/practice/history", headers=H)
        check("删除后历史减少", all(h["id"] != sid for h in r.json()), r.text[:200])

    # 10. 清空历史（先造一条）
    r = client.post("/practice/sessions", json={
        "knowledge_point_ids": [kps[0]["id"]], "count": 2,
    }, headers=H)
    if r.status_code == 200:
        sid2 = r.json()["session_id"]
        client.post(f"/practice/sessions/{sid2}/submit", headers=H)
        r = client.delete("/practice/history", headers=H)
        check("清空练习历史", r.status_code == 200, r.text[:200])
        check("清空后为空", len(client.get("/practice/history", headers=H).json()) == 0)

    # 11. 删除自编题（未被引用时应硬删）
    if custom_qid:
        mine = client.get("/questions/mine", headers=H).json()
        row = next((m for m in mine if m["question_id"] == custom_qid), None)
        if row:
            r = client.delete(f"/questions/{row['id']}", headers=H)
            check("删除自编题", r.status_code == 200, r.text[:200])

    print(f"\n通过 {passed} 项，失败 {len(failed)} 项")
    if failed:
        for f in failed:
            print("  -", f)
        sys.exit(1)


if __name__ == "__main__":
    main()
