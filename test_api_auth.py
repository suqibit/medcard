# -*- coding: utf-8 -*-
"""API 鉴权测试脚本 —— 验证「陌生人直连被挡、从页面操作正常」
用法（服务已启动后）：
    venv\\Scripts\\python.exe test_api_auth.py
或在项目目录用任意装了 requests 的 python 跑。
每个用例输出 [PASS]/[FAIL]，全部 PASS = 鉴权功能正常。
"""
import re
import time
import requests

BASE = "http://localhost:5000"
ok = fail = 0


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  [PASS] {name}")
    else:
        fail += 1
        print(f"  [FAIL] {name} {detail}")


# 等待服务就绪（最多 10 秒）
for _ in range(20):
    try:
        requests.get(BASE + "/", timeout=2)
        break
    except Exception:
        time.sleep(0.5)

# ---------- 场景 1：陌生人直连（无 token） ----------
print("场景1：无 token 直连 4 个 AI 接口 + 反馈接口 → 全部应 401")
check("POST /generate  无 token → 401",
      requests.post(BASE + "/generate", json={"text": "x"}, timeout=5).status_code == 401)
check("POST /ocr       无 token → 401",
      requests.post(BASE + "/ocr", files={"file": ("t.png", b"x", "image/png")}, timeout=5).status_code == 401)
check("POST /extract_pdf  无 token → 401",
      requests.post(BASE + "/extract_pdf", files={"file": ("t.pdf", b"x")}, timeout=5).status_code == 401)
check("POST /extract_docx 无 token → 401",
      requests.post(BASE + "/extract_docx", files={"file": ("t.docx", b"x")}, timeout=5).status_code == 401)
check("POST /feedback  无 token → 401",
      requests.post(BASE + "/feedback", json={"msg": "hi"}, timeout=5).status_code == 401)

# ---------- 场景 2：伪造 token ----------
print("场景2：乱编一个 token → 应 401")
check("POST /generate  假 token → 401",
      requests.post(BASE + "/generate", json={"text": "x"},
                    headers={"X-API-Token": "deadbeefdeadbeef"}, timeout=5).status_code == 401)

# ---------- 场景 3：正常流程（先开页面拿 token，再带 token 调接口） ----------
print("场景3：先 GET 页面拿 token，带 token 调接口 → 应正常（200/400 业务码，不是 401）")
r = requests.get(BASE + "/", timeout=10)
m = re.search(r'data-token="([a-f0-9]+)"', r.text)
token = m.group(1) if m else ""
check("页面注入了 16 位 token", bool(m), detail="实际=" + repr(r.text[:100] if not m else token[:4] + "..."))
H = {"X-API-Token": token}

r = requests.post(BASE + "/feedback", json={"msg": ""}, headers=H, timeout=5)
check("POST /feedback 带 token + 空内容 → 400（过了鉴权到业务层）", r.status_code == 400)

r = requests.post(BASE + "/ocr", files={"file": ("t.png", b"x", "image/png")}, headers=H, timeout=30)
check("POST /ocr 带 token + 假文件 → 非 401（过了鉴权层）", r.status_code != 401,
      detail="实际=" + str(r.status_code))

r = requests.post(BASE + "/generate",
                  json={"text": "糖尿病的诊断标准：空腹血糖≥7.0mmol/L。", "max_cards": 2}, headers=H, timeout=120)
check("POST /generate 带 token → 200 真出卡", r.status_code == 200,
      detail="实际=" + str(r.status_code) + " " + r.text[:120])
if r.status_code == 200:
    d = r.json()
    print(f"      卡片数={d.get('cards')} demo={d.get('demo')}（本次真实调用 AI，约几厘钱）")

# ---------- 汇总 ----------
print()
print(f"结果：{ok} PASS / {fail} FAIL")
print("全部 PASS = 鉴权上线正常；有 FAIL 先确认服务是刚重启的新版（改代码后没重启会全 401 之外的怪结果）。")
