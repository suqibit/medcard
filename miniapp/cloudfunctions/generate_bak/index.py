# -*- coding: utf-8 -*-
# 云函数 generate：AI 抽卡（DeepSeek）——从 web 版 app.py 迁移
# 零第三方依赖（urllib 标准库），避免云端安装依赖失败
# 部署时在云开发控制台配置环境变量 DEEPSEEK_API_KEY
import os
import json
import urllib.request
import urllib.error

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"


def post_json(url, payload, headers, timeout=110):
    """标准库 HTTP POST，返回解析后的 JSON；非 2xx 抛异常。"""
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

SYSTEM_PROMPT = """你是一名医学教育内容专家，擅长将教材/讲义内容转化为适合间隔重复(Anki)的原子化记忆卡片。
要求：
1. 每张卡只考查一个独立知识点（原子化），避免复合问题。
2. front 为问题或概念提示；back 用三段式：「答案：」精炼要点，「解析：」一句话解释为什么，「关联考点：」标注所属科目章节（如 生理·肾脏滤过）。段落间用换行分隔。
3. 覆盖关键维度：定义、机制、鉴别诊断、重要数值、临床意义。
4. 医学准确性优先；对不确定的内容标注「需核实」。
5. 适度添加 tags，如 ["306","生理","循环"]。
6. 按内容密度生成 5-20 张卡片，宁缺毋滥。
7. 每张卡附带一个「选择题版」quiz 字段：{"question":"基于本卡知识点的题干","options":["选项A","选项B","选项C","选项D","选项E"],"answer":正确选项索引(0-4)}。仿考研真题五选一（A-E），选项简短清晰，干扰项合理有迷惑性。
8. 每张卡必须带 source 字段：**原样引用**输入资料中最能支撑该卡答案的一句话（不超过 80 字，不得改写或概括），用于用户对照原文核实。
9. 所有字符串值内部严禁使用英文双引号（会破坏 JSON），引用术语用「」。
只输出 JSON，结构：{"cards":[{"front":"...","back":"...","tags":["..."],"quiz":{"question":"...","options":["..."],"answer":0},"source":"..."}]}"""

WRONG_PROMPT = """你是一名医学教育内容专家，专门帮助考研学生「把做错的题变成记忆卡」，下次不再错。
用户会粘贴一道 TA 做错的题（题干、选项、TA 的答案或当时纠结的点）。
要求：
1. 从错题中提炼背后的知识点，生成记忆卡——front 是「针对该考点的问题」（不是复述原题，而是考查题目背后的知识点）。
2. back 用三段式：「答案：」该考点的正确结论，「解析：」点破常见错误认知/为什么容易选错（结合用户错因），「关联考点：」所属科目章节（如 内科学·呼吸·COPD）。段落间用换行分隔。
3. 若题目涉及易混概念或鉴别诊断，优先做成「对比卡」（如 A vs B 的关键区别）。
4. tags 必须含「错题」，再加科目/章节标签，如 ["错题","306","内科学"]。
5. 医学准确性优先；对不确定的内容标注「需核实」。
6. 生成 1-5 张，宁缺毋滥——一道错题通常 1-2 张就够。
7. 每张卡附带一个「选择题版」quiz 字段：{"question":"基于该考点的题干","options":["选项A","选项B","选项C","选项D","选项E"],"answer":正确选项索引(0-4)}。仿考研真题五选一（A-E），选项简短清晰，干扰项合理有迷惑性。
8. 每张卡必须带 source 字段：**原样引用**用户粘贴的错题中最能支撑该卡答案的一句话（不超过 80 字，不得改写）。
9. 所有字符串值内部严禁使用英文双引号（会破坏 JSON），引用术语用「」。
只输出 JSON，结构：{"cards":[{"front":"...","back":"...","tags":["..."],"quiz":{"question":"...","options":["..."],"answer":0},"source":"..."}]}"""


def parse_ai_json(content):
    """容错解析 AI 返回的 JSON：先直解，失败截取最外层花括号再解，仍失败返回 None。"""
    if not content:
        return None
    try:
        return json.loads(content)
    except Exception:
        pass
    s = content[content.find("{"): content.rfind("}") + 1]
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        return None


def ai_extract_cards(text, max_cards=10, mode="text", custom_tags=None):
    """调用 DeepSeek 抽卡；无 key 时返回 None（走规则抽卡兜底）。"""
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key or key.startswith("PUT_YOUR"):
        return None
    if mode == "wrong":
        base_prompt = WRONG_PROMPT.replace(
            "6. 生成 1-5 张，宁缺毋滥——一道错题通常 1-2 张就够。",
            f"6. 生成最多 {max_cards} 张，宁缺毋滥——一道错题通常 1-2 张就够。",
        )
        user_msg = f"这是我做错的一道题，请帮我提炼知识点记忆卡：\n\n{text}"
    else:
        base_prompt = SYSTEM_PROMPT.replace(
            "按内容密度生成 5-20 张卡片，宁缺毋滥。",
            f"按内容密度生成最多 {max_cards} 张卡片，宁缺毋滥。",
        )
        user_msg = f"请将以下医学教材/讲义内容转化为记忆卡片：\n\n{text}"
    if custom_tags:
        tags_str = "、".join(str(t) for t in custom_tags if str(t).strip())
        if tags_str:
            base_prompt += (
                f"\n补充要求：用户自定义了标签体系：【{tags_str}】。"
                "生成 tags 时，若卡片知识点与其中某个标签匹配，必须使用该标签（可与其他标签并存）；"
                "确实不匹配时照常按科目/章节打标签。"
            )
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": base_prompt},
            {"role": "user", "content": user_msg},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    }
    resp = None
    for attempt in range(2):
        try:
            resp = post_json(DEEPSEEK_URL, payload, headers)
            break
        except Exception:
            if attempt == 1:
                raise
    content = resp["choices"][0]["message"]["content"]
    data = parse_ai_json(content)
    if not data:
        return None
    return data.get("cards", [])


def rule_extract_cards(text, max_cards=15):
    """规则抽卡兜底（无 key 时）：句子级切分。"""
    import re
    sentences = re.split(r"(?<=[。；;.!?！？])\s*", text)
    cards = []
    for s in sentences:
        s = s.strip()
        if len(s) < 10:
            continue
        hint = s[:12] + ("…" if len(s) > 12 else "")
        cards.append({
            "front": f"请回忆/解释：{hint}",
            "back": s,
            "tags": ["演示", "规则抽卡"],
            "source": s[:80],
        })
        if len(cards) >= max_cards:
            break
    return cards


def main_handler(event, context):
    # 兼容 callFunction 包装：event.data 或直接传入
    data = event.get("data") if isinstance(event, dict) and isinstance(event.get("data"), dict) else (event or {})
    text = str(data.get("text") or "").strip()
    if len(text) > 30000:
        text = text[:30000]
    if not text:
        return {"error": "请输入或上传内容"}
    try:
        max_cards = int(data.get("max_cards") or 10)
    except (TypeError, ValueError):
        max_cards = 10
    max_cards = max(1, min(20, max_cards))
    mode = "wrong" if data.get("mode") == "wrong" else "text"
    custom_tags = data.get("custom_tags") or []
    if not isinstance(custom_tags, list):
        custom_tags = []
    custom_tags = [str(t)[:20] for t in custom_tags][:30]
    try:
        cards = ai_extract_cards(text, max_cards, mode=mode, custom_tags=custom_tags)
        demo = False
        if cards is None:
            demo = True
            cards = rule_extract_cards(text, max_cards)
            if mode == "wrong":
                for c in cards:
                    if "错题" not in c.get("tags", []):
                        c["tags"] = ["错题"] + c.get("tags", [])
        if not cards:
            return {"error": "未能生成卡片，请检查内容"}
        return {"cards": cards, "count": len(cards), "demo": demo}
    except Exception as e:
        return {"error": f"生成失败：{e}"}
