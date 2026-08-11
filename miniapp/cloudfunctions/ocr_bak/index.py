# -*- coding: utf-8 -*-
# 云函数 ocr：图片文字识别（智谱免费视觉模型 glm-4v-flash）
# 部署时在云开发控制台配置环境变量 ZHIPU_API_KEY
import os
import json
import base64
import requests

ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"


def clean_ocr_text(text):
    """OCR 后处理：规则清洗 App 界面噪音行（web 版同款，确定性兜底）"""
    drop_prefix = ("统计", "标签", "来源", "难度", "本题", "全部考生", "本人答", "正确率")
    drop_kw = ("纠错", "1.1万", "写评论", "收藏", "点赞", "评论", "笔记", "有争议", "已过时")
    lines = []
    for ln in (text or "").split("\n"):
        s = ln.strip()
        if not s:
            continue
        if s.startswith(drop_prefix):
            continue
        if any(k in s for k in drop_kw):
            continue
        lines.append(s)
    return "\n".join(lines)


def zhipu_ocr_image(b64, mime):
    key = os.environ.get("ZHIPU_API_KEY")
    if not key or key.startswith("PUT_YOUR"):
        raise RuntimeError("未配置 ZHIPU_API_KEY")
    payload = {
        "model": "glm-4v-flash",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": "请提取这张图片中的医学题目内容。\n如果图片是练习/考试 App 的题目截图：提取「题干」「选项（A/B/C/D/E 及内容）」「答案与解析（如有）」，可保留顶部科目/章节信息（如：外科学 第二十三章 乳房疾病）和题型标注（如 A3/A4 型题）。\n必须忽略所有与题目无关的界面元素：状态栏（时间/信号/电量）、导航栏、搜索栏、按钮文字（写评论/笔记/收藏/评论/点赞）、「5条纠错」「难度」「标签」「来源」「1.1万」等。特别注意：任何以「统计：」开头的整行（包含收藏数/作答次数/正确率/本人答等数字）必须整行丢弃。\n如果图片不是题目截图，则提取全部文字。\n原样输出，保持段落与选项分行，不要添加任何解释、评论或格式标记。如果图片里没有文字，只输出：无文字"},
                ],
            }
        ],
        "temperature": 0.1,
    }
    resp = None
    for attempt in range(2):
        try:
            resp = requests.post(
                ZHIPU_URL,
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
                timeout=110,
            )
            resp.raise_for_status()
            break
        except Exception:
            if attempt == 1:
                raise
    content = resp.json()["choices"][0]["message"]["content"].strip()
    return clean_ocr_text(content)


def main_handler(event, context):
    data = event.get("data") if isinstance(event, dict) and isinstance(event.get("data"), dict) else (event or {})
    b64 = data.get("image") or ""
    mime = data.get("mime") or "image/png"
    if not b64:
        return {"error": "缺少图片数据"}
    if len(b64) > 2 * 1024 * 1024:
        return {"error": "图片过大（base64 限 2MB，请压缩后重试）"}
    try:
        text = zhipu_ocr_image(b64, mime)[:50000]
        return {"text": text}
    except Exception as e:
        return {"error": f"图片识别失败：{e}"}
