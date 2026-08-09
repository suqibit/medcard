import os
import re
import io
import uuid
import json
import base64 as _b64
import tempfile
import random

import requests
from flask import Flask, request, send_file, jsonify, render_template
import genanki

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"


def load_env_file():
    """手写 .env 加载：DEEPSEEK_API_KEY=xxx（不额外装 python-dotenv）"""
    p = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(p):
        return
    try:
        with open(p, encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except Exception:
        pass


def load_deepseek_key():
    """key 优先级：环境变量 > .env 文件 > venv activate 脚本兜底"""
    load_env_file()
    k = os.environ.get("DEEPSEEK_API_KEY")
    if k and not k.startswith("PUT_YOUR"):
        return k
    # 兜底：从 venv 激活脚本读取（覆盖不同 shell 的环境传递差异）
    cands = [
        os.path.join(BASE_DIR, "venv", "Scripts", "activate"),
        os.path.join(BASE_DIR, "venv", "Scripts", "activate.bat"),
        os.path.join(BASE_DIR, "venv", "Scripts", "Activate.ps1"),
    ]
    for p in cands:
        try:
            with open(p, encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "DEEPSEEK_API_KEY" in line and "=" in line and "PUT_YOUR" not in line:
                        m = re.search(r'DEEPSEEK_API_KEY["\']?\s*[:=]\s*["\']?([^"\'\n]+)', line)
                        if m:
                            return m.group(1).strip().strip('"').strip("'")
        except Exception:
            continue
    return None


def load_zhipu_key():
    """ZHIPU_API_KEY：环境变量 > .env > Windows 用户级环境变量（注册表）兜底"""
    load_env_file()
    k = os.environ.get("ZHIPU_API_KEY")
    if k and not k.startswith("PUT_YOUR"):
        return k
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            val, _ = winreg.QueryValueEx(key, "ZHIPU_API_KEY")
            if val and not str(val).startswith("PUT_YOUR"):
                return str(val).strip()
    except Exception:
        pass
    return None


DEEPSEEK_KEY = load_deepseek_key()
ZHIPU_KEY = load_zhipu_key()
ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"

SYSTEM_PROMPT = """你是一名医学教育内容专家，擅长将教材/讲义内容转化为适合间隔重复(Anki)的原子化记忆卡片。
要求：
1. 每张卡只考查一个独立知识点（原子化），避免复合问题。
2. front 为问题或概念提示；back 用三段式：「答案：」精炼要点，「解析：」一句话解释为什么，「关联考点：」标注所属科目章节（如 生理·肾脏滤过）。段落间用换行分隔。
3. 覆盖关键维度：定义、机制、鉴别诊断、重要数值、临床意义。
4. 医学准确性优先；对不确定的内容标注「需核实」。
5. 适度添加 tags，如 ["306","生理","循环"]。
6. 按内容密度生成 5-20 张卡片，宁缺毋滥。
7. 每张卡附带一个「选择题版」quiz 字段：{"question":"基于本卡知识点的题干","options":["选项A","选项B","选项C","选项D"],"answer":正确选项索引(0-3)}。选项简短清晰，干扰项合理有迷惑性。
8. 每张卡必须带 source 字段：**原样引用**输入资料中最能支撑该卡答案的一句话（不超过 80 字，不得改写或概括），用于用户对照原文核实。
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
7. 每张卡附带一个「选择题版」quiz 字段：{"question":"基于该考点的题干","options":["选项A","选项B","选项C","选项D"],"answer":正确选项索引(0-3)}。选项简短清晰，干扰项合理有迷惑性。
8. 每张卡必须带 source 字段：**原样引用**用户粘贴的错题中最能支撑该卡答案的一句话（不超过 80 字，不得改写）。
只输出 JSON，结构：{"cards":[{"front":"...","back":"...","tags":["..."],"quiz":{"question":"...","options":["..."],"answer":0},"source":"..."}]}"""

MODEL_ID = 1607392319


def ai_extract_cards(text, max_cards=10, mode="text", custom_tags=None):
    """调用 DeepSeek 抽卡；无 key 时返回 None（走演示模式）。mode='wrong' 为错题制卡。"""
    if not DEEPSEEK_KEY:
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
    # 用户自定义标签注入 Prompt：AI 生成 tags 时优先匹配用户标签体系
    if custom_tags:
        tags_str = "、".join(str(t) for t in custom_tags if str(t).strip())
        if tags_str:
            base_prompt += (
                f"\n补充要求：用户自定义了标签体系：【{tags_str}】。"
                "生成 tags 时，若卡片知识点与其中某个标签匹配，必须使用该标签（可与其他标签并存）；"
                "确实不匹配时照常按科目/章节打标签。"
            )
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_KEY}",
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
    resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=120)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return json.loads(content).get("cards", [])


def rule_extract_cards(text, max_cards=15):
    """演示模式：句子级切分生成卡（无 key 时兜底，质量有限）。"""
    sentences = re.split(r"(?<=[。；;.!?！？])\s*", text)
    cards = []
    for s in sentences:
        s = s.strip()
        if len(s) < 10:
            continue
        hint = s[:12] + ("…" if len(s) > 12 else "")
        cards.append(
            {
                "front": f"请回忆/解释：{hint}",
                "back": s,
                "tags": ["演示", "规则抽卡"],
                "source": s[:80],
            }
        )
        if len(cards) >= max_cards:
            break
    return cards


def build_deck(cards, deck_name):
    model = genanki.Model(
        MODEL_ID,
        "MedCardModel",
        fields=[{"name": "Front"}, {"name": "Back"}],
        templates=[
            {
                "name": "Card",
                "qfmt": "{{Front}}",
                "afmt": '{{Front}}<hr id="answer">{{Back}}',
            }
        ],
    )
    deck_id = random.randint(1 << 30, 1 << 31)
    deck = genanki.Deck(deck_id, deck_name or "医学记忆卡")
    for c in cards:
        note = genanki.Note(
            model, fields=[str(c.get("front", "")), str(c.get("back", ""))]
        )
        if c.get("tags"):
            note.tags = [str(t) for t in c["tags"]]
        deck.add_note(note)
    fname = f"{(deck_name or 'deck')}_{uuid.uuid4().hex[:8]}.apkg"
    # 内存生成（临时文件同请求内使用，兼容 serverless 无持久文件系统）
    fd, tmp = tempfile.mkstemp(suffix=".apkg")
    os.close(fd)
    try:
        genanki.Package(deck).write_to_file(tmp)
        with open(tmp, "rb") as fh:
            data = fh.read()
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return data, fname


app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/records")
def records():
    return render_template("records.html")


@app.route("/generate", methods=["POST"])
def generate():
    print(f">>> /generate key={'SET' if DEEPSEEK_KEY else 'NONE'}", flush=True)
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    deck_name = (data.get("deck_name") or "医学记忆卡").strip()[:40]
    if not text:
        return jsonify({"error": "请输入或上传内容"}), 400
    try:
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
            return jsonify({"error": "未能生成卡片，请检查内容或 API Key"}), 400
        data, fname = build_deck(cards, deck_name)
        return jsonify(
            {
                "file": fname,
                "file_b64": _b64.b64encode(data).decode(),
                "cards": len(cards),
                "demo": demo,
                "cards_content": cards,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


try:
    from pypdf import PdfReader
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False


MAX_UPLOAD = 4 * 1024 * 1024  # 4MB（Vercel 函数体 4.5MB 限制的保守值）


@app.route("/extract_pdf", methods=["POST"])
def extract_pdf():
    """上传 PDF → 提取文字；扫描件（无文字层）自动渲染成图片走智谱 OCR 兜底（最多前 3 页）"""
    f = request.files.get("file")
    if not f or not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "请上传 PDF 文件"}), 400
    try:
        data = f.read()
        if len(data) > MAX_UPLOAD:
            return jsonify({"error": "文件过大（限 4MB）"}), 400
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t)
        text = "\n".join(parts).strip()
        if not text:
            # 扫描件/图片版 PDF → 渲染成图片走 AI 识别
            if not ZHIPU_KEY:
                return jsonify({"error": "未能提取到文字（扫描件 PDF），且未配置 ZHIPU_API_KEY 无法 AI 识别"}), 400
            try:
                import pymupdf
            except ImportError:
                return jsonify({"error": "未能提取到文字（扫描件 PDF），且服务器缺少渲染库"}), 500
            doc = pymupdf.open(stream=data, filetype="pdf")
            ocr_parts = []
            for i, page in enumerate(doc):
                if i >= 3:
                    break
                pix = page.get_pixmap(dpi=150)
                png = pix.tobytes("png")
                ocr_parts.append(zhipu_ocr_image(png, "image/png"))
            text = "\n".join(ocr_parts).strip()
            if not text:
                return jsonify({"error": "扫描件 AI 识别也未提取到文字"}), 400
            return jsonify({"text": text[:50000], "ocr": True})
        return jsonify({"text": text[:50000]})
    except Exception as e:
        return jsonify({"error": f"PDF 解析失败：{e}"}), 500


@app.route("/extract_docx", methods=["POST"])
def extract_docx():
    """上传 Word(.docx) → 提取段落+表格文字 → 返回（限 5 万字）"""
    f = request.files.get("file")
    if not f or not f.filename.lower().endswith(".docx"):
        return jsonify({"error": "请上传 .docx 文件"}), 400
    try:
        from docx import Document
        data = f.read()
        if len(data) > MAX_UPLOAD:
            return jsonify({"error": "文件过大（限 4MB）"}), 400
        doc = Document(io.BytesIO(data))
        parts = []
        for p in doc.paragraphs:
            if p.text.strip():
                parts.append(p.text)
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))
        text = "\n".join(parts).strip()
        if not text:
            return jsonify({"error": "未能提取到文字（可能是图片型 Word）"}), 400
        return jsonify({"text": text[:50000]})
    except Exception as e:
        return jsonify({"error": f"Word 解析失败：{e}"}), 500


IMG_EXTS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def clean_ocr_text(text):
    """OCR 后处理：规则清洗 App 界面噪音行（确定性兜底，不依赖模型心情）"""
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


def zhipu_ocr_image(data, mime):
    """智谱免费视觉模型识别图片文字 → 返回清洗后的文本（无 key/失败抛异常）"""
    if not ZHIPU_KEY:
        raise RuntimeError("未配置 ZHIPU_API_KEY")
    b64 = _b64.b64encode(data).decode()
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
    resp = requests.post(ZHIPU_URL, headers={"Authorization": f"Bearer {ZHIPU_KEY}"}, json=payload, timeout=120)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"].strip()
    return clean_ocr_text(content)


@app.route("/ocr", methods=["POST"])
def ocr():
    """上传图片 → 智谱免费视觉模型(glm-4v-flash)提取文字 → 返回（限 10MB）"""
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "请上传图片"}), 400
    ext = os.path.splitext(f.filename or "")[1].lower()
    mime = IMG_EXTS.get(ext)
    if not mime:
        return jsonify({"error": "仅支持 png / jpg / jpeg / webp 图片"}), 400
    if not ZHIPU_KEY:
        return jsonify({"error": "未配置 ZHIPU_API_KEY，无法识别图片（可在 .env 填入或配置系统环境变量）"}), 400
    data = f.read()
    if len(data) > MAX_UPLOAD:
        return jsonify({"error": "图片过大（限 4MB）"}), 400
    try:
        return jsonify({"text": zhipu_ocr_image(data, mime)[:50000]})
    except Exception as e:
        return jsonify({"error": f"图片识别失败：{e}"}), 500


if __name__ == "__main__":
    print(
        f">>> STARTUP key={'SET' if DEEPSEEK_KEY else 'NONE'} "
        f"prefix={(DEEPSEEK_KEY[:8] if DEEPSEEK_KEY else '-')}",
        flush=True,
    )
    app.run(host="127.0.0.1", port=5000, debug=False)
