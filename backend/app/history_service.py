"""历史记录删除时的关联数据回退。

删除一次练习/考试记录，不只是删掉一行成绩：这次作答写入错题本的错误次数
也要同步回退，否则“待复习错题”会留下无法解释的幽灵数据，正确率面板却已经变了。
"""

from . import models


def rollback_wrong_questions(db, user_id: str, answers) -> None:
    """按作答明细回退错题计数；计数归零时移除该错题。"""
    for ans in answers:
        if getattr(ans, "is_correct", None) is not False:
            continue
        question_id = getattr(ans, "question_id", None)
        if not question_id:
            continue
        wrong = (
            db.query(models.WrongQuestion)
            .filter(
                models.WrongQuestion.user_id == user_id,
                models.WrongQuestion.question_id == question_id,
            )
            .first()
        )
        if not wrong:
            continue
        remaining = (wrong.wrong_count or 1) - 1
        if remaining <= 0:
            db.delete(wrong)
        else:
            wrong.wrong_count = remaining
