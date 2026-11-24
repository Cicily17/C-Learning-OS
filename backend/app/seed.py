# -*- coding: utf-8 -*-
"""初始化知识体系与种子题库。可重复执行，已存在数据时跳过。"""
import json
import random

from .database import SessionLocal, engine
from . import models
from .models import uid
from .seed_data import CHAPTERS

# 按章节编排的程序结果分析题（答案已按 C11 语义核对）
CODE_QUESTIONS = {
    "CH01": [
        ("#include <stdio.h>\nint main(void){ printf(\"%d\", 3 > 2); return 0; }", "1",
         "关系运算的结果为 1（真）或 0（假）。3 > 2 成立，所以输出 1。"),
        ("#include <stdio.h>\nint main(void){ printf(\"%d\", sizeof(int) >= 1); return 0; }", "1",
         "sizeof(int) 至少为 1，关系表达式成立，输出 1。"),
    ],
    "CH02": [
        ("#include <stdio.h>\nint main(void){ int a=5,b=2; printf(\"%d %d\", a/b, a%b); return 0; }", "2 1",
         "整数除法 5/2 向零截断为 2；取模 5%2 得到余数 1。"),
        ("#include <stdio.h>\nint main(void){ int a=3; double b=a/2.0; printf(\"%.1f\", b); return 0; }", "1.5",
         "a/2.0 中 2.0 是 double，整数 a 被提升为 double，结果为 1.5。"),
    ],
    "CH03": [
        ("#include <stdio.h>\nint main(void){ printf(\"%d\", 1 + 2 * 3); return 0; }", "7",
         "乘法优先级高于加法，先算 2*3=6，再加 1 得 7。"),
        ("#include <stdio.h>\nint main(void){ int a=0; printf(\"%d\", a && (1/0)); return 0; }", "0",
         "&& 具有短路特性，左侧 a 为 0 时右侧不再求值，结果为 0，不会发生除零。"),
    ],
    "CH04": [
        ("#include <stdio.h>\nint main(void){ int s=0; for(int i=0;i<4;i++) s+=i; printf(\"%d\", s); return 0; }", "6",
         "i 依次取 0,1,2,3，累加和为 6。"),
        ("#include <stdio.h>\nint main(void){ int i=0; do { i++; } while(i<3); printf(\"%d\", i); return 0; }", "3",
         "do-while 至少执行一次，i 从 0 递增到 3 时条件 i<3 为假，循环结束。"),
    ],
    "CH05": [
        ("#include <stdio.h>\nint main(void){ int a[]={1,2,3,4}; printf(\"%d\", a[2]); return 0; }", "3",
         "数组下标从 0 开始，a[2] 是第三个元素，值为 3。"),
        ("#include <stdio.h>\nint main(void){ int a[2][3]={{1,2,3},{4,5,6}}; printf(\"%d\", a[1][0]); return 0; }", "4",
         "a[1][0] 是第二行第一个元素，值为 4。"),
    ],
    "CH06": [
        ("#include <stdio.h>\nint f(int n){ return n<=1 ? 1 : n*f(n-1); }\nint main(void){ printf(\"%d\", f(4)); return 0; }", "24",
         "递归计算 4! = 4*3*2*1 = 24。"),
        ("#include <stdio.h>\nvoid f(int x){ x=100; }\nint main(void){ int a=1; f(a); printf(\"%d\", a); return 0; }", "1",
         "值传递使形参 x 是实参 a 的副本，修改 x 不影响 a。"),
    ],
    "CH07": [
        ("#include <stdio.h>\nint main(void){ int a[]={10,20,30}; int *p=a; printf(\"%d\", *(p+1)); return 0; }", "20",
         "p 指向首元素，p+1 按 int 大小移动，指向第二个元素 20。"),
        ("#include <stdio.h>\nint main(void){ int x=5,*p=&x,**pp=&p; **pp=9; printf(\"%d\", x); return 0; }", "9",
         "**pp 最终解引用到变量 x，因此 x 被改为 9。"),
    ],
    "CH08": [
        ("#include <stdio.h>\n#include <string.h>\nint main(void){ char s[]=\"hello\"; printf(\"%zu %zu\", strlen(s), sizeof(s)); return 0; }", "5 6",
         "strlen 不计结尾符，为 5；sizeof 计算数组总字节数，含 '\\0' 共 6。"),
        ("#include <stdio.h>\n#include <string.h>\nint main(void){ printf(\"%d\", strcmp(\"abc\",\"abd\")); return 0; }", "-1",
         "strcmp 按字典序比较，'c' < 'd'，常见实现返回 -1；标准只保证返回负数。"),
    ],
    "CH09": [
        ("#include <stdio.h>\ntypedef struct { int x, y; } Point;\nint main(void){ Point p={3,4}; printf(\"%d\", p.x+p.y); return 0; }", "7",
         "结构体成员 x=3、y=4，和为 7。"),
        ("#include <stdio.h>\nenum Week{MON=1,TUE,WED};\nint main(void){ printf(\"%d\", WED); return 0; }", "3",
         "MON 显式为 1，后续枚举值依次递增，TUE=2、WED=3。"),
    ],
    "CH10": [
        ("#include <stdio.h>\n#include <stdlib.h>\nint main(void){ int *p=calloc(3,sizeof(int)); printf(\"%d\", p[2]); free(p); return 0; }", "0",
         "calloc 会把分配的内存全部清零，因此 p[2] 为 0。"),
        ("#include <stdio.h>\nint main(void){ FILE *f=fopen(\"none\",\"r\"); printf(\"%d\", f==NULL); return 0; }", "1",
         "以只读模式打开不存在的文件会失败，fopen 返回 NULL，f==NULL 为真。"),
    ],
    "CH11": [
        ("#include <stdio.h>\nint f(int n){ return n<=1 ? 1 : n+f(n-1); }\nint main(void){ printf(\"%d\", f(4)); return 0; }", "10",
         "f(4)=4+f(3)=4+3+2+1=10。"),
        ("#include <stdio.h>\nint main(void){ int a[]={5,2,9,1},n=4; for(int i=0;i<n-1;i++) for(int j=0;j<n-1-i;j++) if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;} printf(\"%d\", a[0]); return 0; }", "1",
         "冒泡排序按升序排列，最小元素 1 被交换到首位。"),
    ],
    "CH12": [
        ("#include <stdio.h>\n#define SQUARE(x) ((x)*(x))\nint main(void){ printf(\"%d\", SQUARE(2+3)); return 0; }", "25",
         "宏是文本替换，展开为 ((2+3)*(2+3))，由于加了括号结果为 25。"),
        ("#include <stdio.h>\nvoid f(void){ static int c=0; printf(\"%d \", ++c); }\nint main(void){ f(); f(); return 0; }", "1 2",
         "static 局部变量只在第一次调用时初始化，两次调用分别输出 1 和 2。"),
    ],
}

JUDGMENTS = {
    "CH01": [("void main(void) 是标准 C 推荐的 main 函数写法。", "错误", "标准 C 规定 main 必须返回 int，void main 不是标准写法。"),
             ("C 语言是编译型语言，源程序需要经过编译和链接才能运行。", "正确", "C 源程序需经过预处理、编译、汇编、链接四个阶段生成可执行文件。")],
    "CH02": [("在 C 中，5 / 2 的结果是 2.5。", "错误", "两个整数相除执行整数除法，结果向零截断为 2。"),
             ("局部变量在未显式初始化时，其值是随机的。", "正确", "自动存储期的局部变量不自动清零，未初始化时值不确定。")],
    "CH03": [("逻辑与运算符 && 具有短路特性。", "正确", "左侧为假时右侧表达式不会被求值。"),
             ("表达式 i = i++ 在 C 中是明确定义的行为。", "错误", "同一表达式中对同一变量多次修改属于未定义行为。")],
    "CH04": [("do-while 循环的循环体至少执行一次。", "正确", "do-while 先执行循环体再判断条件。"),
             ("switch 语句的 case 分支如果不写 break，一定会发生贯穿。", "错误", "最后一个分支或 default 之后不写 break 不会贯穿到其他分支。")],
    "CH05": [("C 数组的下标从 0 开始。", "正确", "长度为 n 的数组合法下标范围是 0 到 n-1。"),
             ("在函数内部可以用 sizeof(形参数组) 得到数组元素个数。", "错误", "数组作为函数参数时退化为指针，sizeof 得到的是指针大小。")],
    "CH06": [("C 语言的函数参数默认是值传递。", "正确", "形参是实参的副本，修改形参不影响普通实参。"),
             ("递归函数可以没有终止条件。", "错误", "没有终止条件的递归会无限调用，最终导致栈溢出。")],
    "CH07": [("指针 p+1 表示地址值增加 1 个字节。", "错误", "指针加 1 实际增加 sizeof(*p) 个字节。"),
             ("数组名在大多数表达式中会退化为指向首元素的指针。", "正确", "但 sizeof(数组) 和 &数组 是例外。")],
    "CH08": [("strlen(\"hello\") 的结果是 6。", "错误", "strlen 不计算结尾符 '\\0'，结果为 5。"),
             ("用 scanf 的 %s 读取字符串时存在缓冲区溢出风险。", "正确", "应限制读取宽度或使用 fgets。")],
    "CH09": [("共用体的大小等于所有成员大小之和。", "错误", "共用体成员共享内存，大小取决于最大的成员。"),
             ("typedef 只是为已有类型创建别名，不会创建新类型。", "正确", "typedef 不分配存储，也不产生新的类型。")],
    "CH10": [("free 之后继续使用该指针是安全的。", "错误", "free 后指针成为悬空指针，继续解引用是未定义行为。"),
             ("while (!feof(fp)) 是读取文件直到末尾的推荐写法。", "错误", "feof 在读取失败后才置位，应以读取函数返回值作为循环条件。")],
    "CH11": [("二分查找可以在无序数组上正常工作。", "错误", "二分查找要求数据预先按序排列。"),
             ("调试时应先复现问题再缩小定位范围。", "正确", "这是系统化的调试流程。")],
    "CH12": [("宏定义中的参数应该适当加括号以避免优先级问题。", "正确", "不加括号在传入表达式时可能产生错误结果。"),
             ("static 修饰的局部变量每次函数调用都会重新初始化。", "错误", "static 局部变量只在程序开始时初始化一次。")],
}


def _opts(correct_text, fact_texts):
    others = fact_texts[:3]
    options = [(correct_text, True)] + [(x, False) for x in others]
    random.shuffle(options)
    keys = "ABCD"
    options_json = json.dumps(
        [{"key": keys[i], "text": text} for i, (text, _) in enumerate(options)],
        ensure_ascii=False,
    )
    answer = keys[[i for i, (_, ok) in enumerate(options) if ok][0]]
    return options_json, answer


def seed():
    db = SessionLocal()
    try:
        if db.query(models.Chapter).count() > 0:
            print("数据库已有章节数据，跳过初始化。")
            return
        print("开始初始化知识体系与题库...")

        kp_refs = []
        for ch_data in CHAPTERS:
            ch = models.Chapter(
                code=ch_data["code"], name=ch_data["name"],
                description=ch_data["description"], order_index=len(kp_refs) + 1,
            )
            db.add(ch)
            db.flush()
            for i, kp_data in enumerate(ch_data["kps"]):
                code, name, difficulty, summary, concept, syntax, example, errors = kp_data
                kp = models.KnowledgePoint(
                    chapter_id=ch.id, code=code, name=name, difficulty=difficulty,
                    summary=summary, core_concept_md=concept, explanation_md=concept,
                    syntax_md=syntax,
                    examples_json=json.dumps([{"code": example, "title": f"{name} 示例"}], ensure_ascii=False),
                    line_explain_json=json.dumps(
                        [{"line": idx + 1, "text": line.strip()} for idx, line in enumerate(example.split("\n")) if line.strip()],
                        ensure_ascii=False,
                    ),
                    common_errors_json=json.dumps(errors, ensure_ascii=False),
                    confused_with_json=json.dumps([], ensure_ascii=False),
                    applications_json=json.dumps([], ensure_ascii=False),
                    related_kp_ids=json.dumps([], ensure_ascii=False),
                    estimated_minutes=10, order_index=i + 1,
                )
                db.add(kp)
                db.flush()
                kp_refs.append((ch.id, kp.id, code, name, summary, difficulty))

        all_summaries = [x[4] for x in kp_refs]
        q_no = 0
        for ch_id, kp_id, code, name, summary, difficulty in kp_refs:
            q_no += 1
            pool = [s for s in all_summaries if s != summary]
            distractors = random.sample(pool, 3)
            options_json, answer = _opts(summary, distractors)
            db.add(models.Question(
                question_id=f"Q{q_no:04d}", chapter_id=ch_id, knowledge_point_id=kp_id,
                question_type="单项选择题", difficulty="入门",
                question_content=f"以下关于「{name}」的描述，正确的是哪一项？",
                code_content="", options_json=options_json, correct_answer=answer,
                explanation=f"正确答案对应的描述是「{name}」的核心概念。其他选项描述的是其他知识点，不符合题干要求。",
                score=1, tags_json=json.dumps(["概念识别", name], ensure_ascii=False),
                source_type="preset",
            ))

        for ch in CHAPTERS:
            ch_row = db.query(models.Chapter).filter(models.Chapter.code == ch["code"]).first()
            kp_first = db.query(models.KnowledgePoint).filter(
                models.KnowledgePoint.chapter_id == ch_row.id
            ).order_by(models.KnowledgePoint.order_index).first()
            for idx, (code_text, answer, explanation) in enumerate(CODE_QUESTIONS.get(ch["code"], [])):
                q_no += 1
                wrong = ["0", "1", "2", "-1", "3", "4"]
                wrong = [w for w in wrong if w != answer][:3]
                options_json, ans = _opts(answer, wrong)
                db.add(models.Question(
                    question_id=f"Q{q_no:04d}", chapter_id=ch_row.id,
                    knowledge_point_id=kp_first.id, question_type="程序结果分析题",
                    difficulty="中等",
                    question_content="以下 C 程序（C11 标准）的输出是什么？",
                    code_content=code_text, options_json=options_json, correct_answer=ans,
                    explanation=explanation, score=2,
                    tags_json=json.dumps(["程序输出", "C11"], ensure_ascii=False),
                    source_type="preset",
                ))
            for idx, (statement, answer, explanation) in enumerate(JUDGMENTS.get(ch["code"], [])):
                q_no += 1
                options_json = json.dumps([
                    {"key": "A", "text": "正确"}, {"key": "B", "text": "错误"}
                ], ensure_ascii=False)
                db.add(models.Question(
                    question_id=f"Q{q_no:04d}", chapter_id=ch_row.id,
                    knowledge_point_id=kp_first.id, question_type="判断题",
                    difficulty="简单", question_content=f"判断下列说法是否正确：{statement}",
                    code_content="", options_json=options_json,
                    correct_answer="A" if answer == "正确" else "B",
                    explanation=explanation, score=1,
                    tags_json=json.dumps(["概念判断"], ensure_ascii=False),
                    source_type="preset",
                ))

        for task in [
            ("TASK01", "完成一次练习", "完成一套自主练习并提交", '{"type":"practice","count":1}', 10),
            ("TASK02", "学习一个知识点", "标记一个知识点为已掌握", '{"type":"kp_master","count":1}', 5),
            ("TASK03", "答对十道题", "今日累计答对 10 道题", '{"type":"correct","count":10}', 15),
        ]:
            db.add(models.DailyTask(code=task[0], title=task[1], description=task[2],
                                    condition_json=task[3], exp_reward=task[4]))

        db.commit()
        print(f"初始化完成：{len(CHAPTERS)} 个章节，{len(kp_refs)} 个知识点，{q_no} 道题目。")
    finally:
        db.close()


if __name__ == "__main__":
    from .database import Base
    Base.metadata.create_all(bind=engine)
    seed()
