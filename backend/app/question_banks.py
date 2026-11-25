# -*- coding: utf-8 -*-
"""题库分类：LeetCode / 专升本 / 本科 / 考研。

一道题可同时属于多个题库（多标签），保证每个题库都有充足题量，
组卷时按 bank 参数筛选 banks_json 包含该题库的题目。
"""
import json

BANKS = [
    {"key": "leetcode", "name": "LeetCode 题库", "desc": "官方编程与算法实战题"},
    {"key": "专升本", "name": "专升本题库", "desc": "基础概念与语法"},
    {"key": "本科", "name": "本科题库", "desc": "课程同步练习"},
    {"key": "考研", "name": "考研题库", "desc": "综合与拔高题"},
    {"key": "ai", "name": "AI 题库", "desc": "按你的条件实时生成题目"},
]
BANK_KEYS = [b["key"] for b in BANKS]

CODE_TYPES = {"编程题", "找错题", "代码补全题", "程序结果分析题", "程序阅读题"}


def classify_banks(question_type: str, difficulty: str, tags) -> list[str]:
    """按题型、难度与标签给题目打题库标签。"""
    if isinstance(tags, str):
        try:
            tags = json.loads(tags or "[]")
        except (ValueError, TypeError):
            tags = []
    tags = tags or []
    tags_l = [str(t).lower() for t in tags]
    is_code = question_type in CODE_TYPES or any("leetcode" in t for t in tags_l)

    banks: set[str] = set()
    # 编程/算法风格 → LeetCode
    if is_code:
        banks.add("leetcode")
    # 基础概念（入门/简单）→ 专升本
    if difficulty in ("入门", "简单") and not is_code:
        banks.add("专升本")
    # 本科课程范围：入门到中等
    if difficulty in ("入门", "简单", "中等"):
        banks.add("本科")
    # 考研：中等与困难
    if difficulty in ("中等", "困难"):
        banks.add("考研")
    # 保底：任何题至少属于一个题库
    if not banks:
        banks.add("本科")
    return [k for k in BANK_KEYS if k in banks]


def in_bank(banks_json: str, bank: str) -> bool:
    try:
        return bank in json.loads(banks_json or "[]")
    except (ValueError, TypeError):
        return False
