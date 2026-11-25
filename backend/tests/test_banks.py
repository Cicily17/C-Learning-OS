# -*- coding: utf-8 -*-
"""题库分类测试：四个题库覆盖、按库组卷、可用量预览、AI 出题归库。"""
import random
import string
import sys

import httpx

BASE = "http://127.0.0.1:8000/api"
client = httpx.Client(base_url=BASE, timeout=90.0)
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


def main():
    u = "bank_" + "".join(random.choices(string.ascii_lowercase, k=8))
    client.post("/auth/register", json={"username": u, "password": "pass12345"})
    r = client.post("/auth/login", json={"username": u, "password": "pass12345"})
    H = {"Authorization": "Bearer " + r.json()["access_token"]}

    print("1. 题库元数据与题量")
    r = client.post("/questions/availability", json={}, headers=H)
    check("可用量接口", r.status_code == 200, r.text[:200])
    data = r.json()
    banks = {b["key"] for b in data.get("banks", [])}
    check("五个题库齐全", banks == {"leetcode", "专升本", "本科", "考研", "ai"}, str(banks))
    by_bank = data.get("by_bank", {})
    for key in ("leetcode", "专升本", "本科", "考研"):
        check(f"{key} 题库题量 > 100", by_bank.get(key, 0) > 100, str(by_bank))
    check("题库总量 > 400", data.get("bank_total", 0) > 400, str(data.get("bank_total")))

    print("2. 按题库筛选可用量")
    for key in ("leetcode", "专升本", "本科", "考研"):
        r = client.post("/questions/availability", json={"bank": key}, headers=H)
        check(f"bank={key} 可用量=该库题量",
              r.status_code == 200 and r.json()["available"] == by_bank[key],
              f"{r.status_code} {r.text[:120]}")

    print("3. 各题库组卷")
    kps = client.get("/learning/knowledge-points", headers=H).json()
    kp = kps[0]
    for key in ("leetcode", "专升本", "本科", "考研"):
        r = client.post("/practice/sessions", json={
            "knowledge_point_ids": [kp["id"]], "bank": key, "count": 3,
            "question_types": [], "difficulties": [],
        }, headers=H)
        check(f"bank={key} 组卷成功", r.status_code == 200 and r.json().get("total_count") == 3,
              f"{r.status_code} {r.text[:150]}")

    print("4. AI 出题归入指定题库")
    r = client.post("/questions/ai-generate", json={
        "knowledge_point_ids": [kp["id"]], "qtype": "判断题", "difficulty": "简单",
        "count": 2, "bank": "考研",
    }, headers=H)
    check("AI 出题带 bank 参数", r.status_code == 200, r.text[:250])
    if r.status_code == 200:
        check("报告标注题库", r.json().get("report", {}).get("bank") == "考研", str(r.json().get("report")))

    print("5. AI 题库按需实时生成")
    r = client.post("/questions/availability", json={"bank": "ai"}, headers=H)
    check("AI 题库标记 realtime", r.status_code == 200 and r.json().get("realtime") is True, r.text[:150])
    r = client.post("/practice/sessions", json={
        "knowledge_point_ids": [kp["id"]], "bank": "ai", "count": 3,
        "question_types": ["单项选择题"], "difficulties": ["简单"],
    }, headers=H)
    check("AI 题库实时组卷", r.status_code == 200 and r.json().get("total_count") == 3,
          f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        check("AI 题库标记为自动生成", r.json().get("auto_generated", 0) >= 3, str(r.json()))

    print("6. LeetCode 官方真题入库")
    r = client.post("/questions/availability", json={"bank": "leetcode"}, headers=H)
    check("LeetCode 题库题量充足", r.json().get("available", 0) > 100, r.text[:150])

    print(f"\n通过 {passed} 项，失败 {len(failed)} 项")
    if failed:
        for f in failed:
            print("  -", f)
        sys.exit(1)


if __name__ == "__main__":
    main()
