# -*- coding: utf-8 -*-
"""M3 考试中心 / M5 游戏化 / M6 AI 助手 端到端测试。需先启动后端服务。"""
import uuid

import httpx

from app import models
from app.database import SessionLocal

BASE = "http://127.0.0.1:8000/api"
PASS = 0


def check(cond, label):
    global PASS
    assert cond, f"FAIL: {label}"
    PASS += 1
    print(f"  [OK] {label}")


def main():
    global PASS
    c = httpx.Client(base_url=BASE, timeout=30)
    username = f"phase2_{uuid.uuid4().hex[:8]}"
    r = c.post("/auth/register", json={"username": username, "password": "test123456"})
    check(r.status_code == 200, "注册测试用户")
    token = r.json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"
    db = SessionLocal()

    try:
        chapters = c.get("/learning/chapters").json()
        check(len(chapters) >= 2, f"章节数据可用（{len(chapters)} 章）")
        ch = chapters[0]

        print("\n--- M3 考试中心 ---")
        config = {
            "name": "第一阶段 C 语言测验",
            "chapter_ids": [ch["id"]],
            "count": 6,
            "type_counts": {"单项选择题": 4, "判断题": 2},
            "type_scores": {"单项选择题": 5, "判断题": 5},
            "duration_minutes": 20,
            "total_score": 30,
        }
        r = c.post("/exams/papers", json=config)
        check(r.status_code == 200, f"自动组卷成功（{r.text[:80]}）")
        paper = r.json()
        check(paper["total_score"] == 30 and paper["question_count"] == 6, "分值计算与题量准确")

        bad = dict(config, total_score=99)
        r = c.post("/exams/papers", json=bad)
        check(r.status_code == 400, "总分不匹配时明确拒绝")

        r = c.post("/exams/sessions", params={"paper_id": paper["id"]})
        check(r.status_code == 200, "开始考试")
        session_id = r.json()["session_id"]

        r = c.get(f"/exams/sessions/{session_id}")
        payload = r.json()
        check(r.status_code == 200, "获取考试题目")
        serialized = str(payload)
        for forbidden in ("correct_answer", "explanation", "score", "accuracy", "obtained_score"):
            check(forbidden not in serialized, f"考试中不下发字段：{forbidden}")

        r = c.get(f"/exams/sessions/{session_id}/result")
        check(r.status_code == 403, "交卷前访问成绩被拒绝")

        keys = {
            k.question_id: k.correct_answer
            for k in db.query(models.ExamAnswerKey).filter(
                models.ExamAnswerKey.paper_id == paper["id"]
            ).all()
        }
        for q in payload["questions"]:
            r = c.post(f"/exams/sessions/{session_id}/answers", json={
                "question_id": q["id"], "user_answer": keys[q["id"]],
            })
        check(r.status_code == 200 and r.json() == {"saved": True}, "保存答案不泄露正误")
        r = c.post(f"/exams/sessions/{session_id}/mark", json={
            "question_id": payload["questions"][0]["id"], "marked": True,
        })
        check(r.json()["marked"] is True, "标记疑难题目")

        r = c.post(f"/exams/sessions/{session_id}/submit")
        check(r.status_code == 200, "交卷成功")
        result = r.json()
        check(result["obtained_score"] == 30 and result["correct_count"] == 6, "服务端判分准确（满分）")
        check(result["time_used_seconds"] >= 0, "考试用时已记录")

        r = c.post(f"/exams/sessions/{session_id}/submit")
        check(r.status_code == 400, "重复交卷被拒绝（记录锁定）")

        report = c.get(f"/exams/sessions/{session_id}/result").json()
        check(report["obtained_score"] == 30, "考试报告分数正确")
        check(len(report["knowledge_point_scores"]) > 0, "报告含知识点得分")
        check(len(report["question_type_scores"]) == 2, "报告含题型得分")
        check(len(report["suggestions"]) > 0, "报告含复习建议")
        check(len(report["wrong_items"]) == 0, "满分时无错题")

        history = c.get("/exams/history").json()
        check(len(history) == 1 and history[0]["obtained_score"] == 30, "考试历史可恢复")

        print("\n--- M5 游戏化 ---")
        game_map = c.get("/game/map").json()
        check(game_map["chapters"][0]["unlocked"] is True, "第一章节默认解锁")
        check(game_map["chapters"][1]["unlocked"] is False, "后续章节初始锁定")
        profile = c.get("/game/profile").json()
        check(profile["level"]["level"] >= 1, "等级系统可用")
        check(len(profile["achievements"]) >= 6, "成就徽章已初始化")
        check(len(profile["daily_tasks"]) >= 3, "每日任务已初始化")

        r = c.post(f"/game/chapters/{chapters[1]['id']}/challenge")
        check(r.status_code == 403, "未解锁章节挑战被拒绝")

        r = c.post(f"/game/chapters/{ch['id']}/challenge")
        check(r.status_code == 200, "第一章节挑战开启")
        challenge = r.json()
        sess = c.get(f"/practice/sessions/{challenge['session_id']}").json()
        for q in sess["questions"]:
            qrow = db.query(models.Question).filter(models.Question.id == q["id"]).first()
            c.post(f"/practice/sessions/{challenge['session_id']}/answers", json={
                "question_id": q["id"], "user_answer": qrow.correct_answer,
            })
        r = c.post(f"/practice/sessions/{challenge['session_id']}/submit")
        check(r.status_code == 200 and r.json()["accuracy"] == 1.0, "章节挑战全部答对")
        game_map = c.get("/game/map").json()
        check(game_map["chapters"][0]["challenge_passed"] is True, "挑战通过状态已保存")
        check(game_map["chapters"][1]["unlocked"] is True, "通过后解锁下一章节")
        profile = c.get("/game/profile").json()
        unlocked = [a["name"] for a in profile["achievements"] if a["unlocked"]]
        check("初章通关" in unlocked, "成就按真实结果解锁")

        print("\n--- M6 AI 助手与代码沙箱 ---")
        r = c.post("/ai/chat", json={"mode": "exam", "question": "这题选什么"})
        check(r.status_code == 403, "考试模式 AI 求助被拒绝")
        r = c.post("/ai/chat", json={"mode": "practice", "topic": "指针"})
        check(r.status_code == 200 and len(r.json()["answer"]) > 20, "练习模式助手可用")
        cfg = c.get("/ai/config").json()
        check("api_key" not in str(cfg), "AI 配置不回传密钥")

        code = '#include <stdio.h>\nint main(void){ printf("Hello\\n"); return 0; }'
        r = c.post("/ai/run", json={"code": code, "stdin": ""})
        check(r.status_code == 200 and r.json()["stdout"].strip() == "Hello", "C11 代码真实编译运行")
        r = c.post("/ai/run", json={"code": 'int main(void){ system("dir"); return 0; }'})
        check(r.status_code == 200 and r.json()["stage"] == "validation", "危险调用被静态拦截")
        r = c.post("/ai/run", json={"code": "int main(void){ while(1){} }"})
        check(r.json()["stage"] == "runtime", "死循环被超时终止")

        print(f"\nALL PASSED: {PASS} assertions")
    finally:
        db.close()
        c.close()


if __name__ == "__main__":
    main()
