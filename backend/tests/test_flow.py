"""端到端业务流程测试：注册 -> 知识学习 -> 练习 -> 提交判分 -> 历史恢复。"""
import sys
import uuid

import httpx

BASE = "http://127.0.0.1:8000/api"


def check(cond, message):
    if not cond:
        raise AssertionError(message)
    print(f"  [PASS] {message}")


def main():
    client = httpx.Client(base_url=BASE, timeout=30)
    username = "flow_" + uuid.uuid4().hex[:8]
    password = "test123456"

    print("1. 认证")
    r = client.post("/auth/register", json={"username": username, "password": password})
    check(r.status_code == 200, f"注册成功 ({r.status_code})")
    token = r.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    r = client.get("/auth/me")
    check(r.status_code == 200 and r.json()["username"] == username, "JWT 鉴权获取当前用户")

    print("2. 知识体系")
    chapters = client.get("/learning/chapters").json()
    check(len(chapters) >= 11, f"章节数量 {len(chapters)}")
    kps = client.get("/learning/knowledge-points").json()
    check(len(kps) >= 70, f"知识点数量 {len(kps)}")
    kp = kps[0]
    r = client.get(f"/learning/knowledge-points/{kp['id']}")
    check(r.status_code == 200 and r.json()["id"] == kp["id"], "知识点详情读取")

    print("3. 学习记录与收藏")
    r = client.put(f"/learning/knowledge-points/{kp['id']}/progress",
                   json={"status": "mastered", "progress_pct": 100})
    check(r.status_code == 200, "保存学习进度")
    fav = client.post("/learning/favorites", json={"target_type": "knowledge_point", "target_id": kp["id"]})
    check(fav.status_code == 200 and "收藏" in fav.json()["message"], "收藏知识点")
    favs = client.get("/learning/favorites").json()
    check(any(f["target_id"] == kp["id"] for f in favs), "收藏列表可恢复")

    print("4. 自动出题")
    r = client.post("/practice/sessions", json={
        "knowledge_point_ids": [k["id"] for k in kps[:5]],
        "difficulties": [], "question_types": [], "count": 5, "time_limit_minutes": 10,
    })
    check(r.status_code == 200, f"按知识点组卷 ({r.status_code})")
    session = r.json()
    check(session["total_count"] == 5 and len(session["questions"]) == 5, "生成 5 道题且无重复虚构")
    qids = [q["id"] for q in session["questions"]]
    check(len(set(qids)) == 5, "题目 ID 唯一")
    sid = session["session_id"]

    r = client.post("/practice/sessions", json={
        "knowledge_point_ids": ["not-exist-kp"], "count": 5,
    })
    check(r.status_code == 409 and "不会虚构题目" in r.json()["detail"], "题量不足时明确报错，不虚构题目")

    print("5. 答题、提示与答案")
    r = client.post(f"/practice/sessions/{sid}/hint", params={"question_id": qids[0], "level": 2})
    check(r.status_code == 200 and r.json()["level"] == 2, "二级提示可用")
    r = client.get(f"/practice/sessions/{sid}/answer", params={"question_id": qids[0]})
    check(r.status_code == 200 and "correct_answer" in r.json(), "练习模式可查看参考答案")
    for i, qid in enumerate(qids):
        r = client.post(f"/practice/sessions/{sid}/answers", json={
            "question_id": qid, "user_answer": "A" if i == 0 else "B", "time_spent_seconds": 5,
        })
        check(r.status_code == 200 and "is_correct" in r.json(), f"第 {i+1} 题作答保存") if i == 0 else None

    print("6. 提交判分")
    r = client.post(f"/practice/sessions/{sid}/submit")
    check(r.status_code == 200, "提交练习")
    result = r.json()
    check(result["total_count"] == 5 and 0 <= result["correct_count"] <= 5, "判分结果在合理范围")
    check(result["exp_gained"] == result["correct_count"] * 5, "经验值由真实答题结果计算")

    r = client.get(f"/practice/sessions/{sid}/result")
    check(r.status_code == 200 and len(r.json()["items"]) == 5, "提交后可查看完整解析")

    print("7. 历史与档案恢复")
    history = client.get("/practice/history").json()
    check(any(h["id"] == sid for h in history), "练习历史可恢复")
    dash = client.get("/learning/dashboard").json()
    check(dash["total_practice"] >= 1, "工作台统计来自真实记录")
    check(dash["studied_kp_count"] >= 1, "掌握度统计来自真实记录")

    print("8. 权限隔离")
    r = client.get("/auth/me", headers={"Authorization": "Bearer invalid-token"})
    check(r.status_code == 401, "无效令牌被拒绝")

    print("\nALL FLOW TESTS PASSED")
    client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\nFAILED: {exc}")
        sys.exit(1)
