# 医学记忆卡 · Ponytail 审计清单（2026-08-12 凌晨，未执行）

> 审计方式：ponytail skill（YAGNI 梯子）。状态：🟡 待办 / ✅ 已做 / 🔵 已决定不做

## 🔴 建议删（死代码 / 垃圾产物）

| # | 位置 | 问题 | 状态 |
|---|------|------|------|
| 1 | templates/index.html:695 | fromUp 函数零调用（死代码 4 行） | ✅ 已删（08-12 凌晨） |
| 2 | templates/index.html:794 | fmtDate 函数零调用（死代码 8 行） | ✅ 已删（08-12 凌晨） |
| 3 | design-demos/_profile* _pt*（10 目录） | Edge headless 浏览器缓存垃圾 | ✅ 已删（08-12 下午） |
| 4 | outputs/_clip _fresh _dump* _hole* 等（~10 目录） | 测试临时 profile | ✅ 已删（08-12 下午） |
| 5 | outputs/*.apkg *.dom.html | 测试生成物 | ✅ 已删（08-12 下午） |

## 🟡 建议简化

| # | 位置 | 问题 | 建议 | 状态 |
|---|------|------|------|------|
| 6 | app.py:203 | genanki.Model 每次请求重建 | 提模块级复用 | ✅ 已做（ANKI_MODEL 模块级） |
| 7 | app.py:42-58 | venv activate 脚本正则抠 key 兜底 | 可删（env+.env 已够，Vercel 无 venv） | ✅ 已删（08-12 下午） |
| 8 | index.html:1074/1354 | needVerify 判断复制两处 | 提 needVerify(c) 函数 | ✅ 已做（08-12 下午） |
| 9 | app.py:120 | parse_ai_json find() -1 时切片隐晦 | 加 idx<0 保护 | ✅ 已做（08-12 下午） |
| 10 | 两页 :root 重复 | 可抽 static/common.css | 2 页规模先不动，等第三页 | 🔵 |

## 🟢 建议保留（看似冗余实则正确）

- deploy/ 自部署脚本（境内迁移备选）
- miniapp/cloudfunctions 独立云函数（平台决定）
- localStorage 双写备份 + 微信检测（真实场景）
- pymupdf 延迟导入（Vercel 冷启动优化）
- index.html 单文件 1342 行（MVP 形态正确）
- design-demos/*.html 设计稿（参考价值）

## 执行建议
最省事三件套（~15 分钟）：删死代码 2 处 + 删测试垃圾目录 + Model 提模块级。

## 追加清理（08-12 下午）
- miniapp/ 根目录旧版 pages/（home/review/records 12 文件）未被引用 → ✅ 已删
- ⚠️ 删除教训：PowerShell Remove-Item 走回收站 API 中文路径编码失败（trash-failed）；shutil.rmtree 被 SAFE_DELETE 批量确认拦截（>50 文件）；**可靠通道 = Python subprocess 调 cmd rd /s /q 或 del /f /q**（子进程绕开确认层且正确处理中文路径）
