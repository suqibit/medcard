# 医学记忆卡 · Vercel 部署指南

## 架构说明（重要）

- **数据全在浏览器本地**（IndexedDB + localStorage）：复习卡片、进度、统计都不经过服务器
- 服务器只做无状态的「AI 加工厂」：`/generate`（DeepSeek 抽卡）、`/ocr`（智谱识别）、`/extract_pdf`、`/extract_docx`
- 无需任何数据库。用户换设备靠 JSON 备份/导入

## 部署步骤

### 1. 推到 GitHub
```bash
git init
git add .
git commit -m "医学记忆卡 MVP"
git remote add origin https://github.com/suqibit/medcard.git   # 换成你的仓库
git push -u origin main
```
> ⚠️ `.env` 已被 .gitignore 排除，**key 不会进仓库**（请先确认 `git status` 里没有 .env）

### 2. 导入 Vercel
1. 打开 https://vercel.com → New Project → Import 你的 GitHub 仓库
2. Framework Preset 选 **Other**（不用选 Flask，我们有 vercel.json）
3. 添加环境变量（Settings → Environment Variables，Production）：
   - `DEEPSEEK_API_KEY` = 你的 DeepSeek key
   - `ZHIPU_API_KEY` = 你的智谱 key
4. Deploy

### 3. 绑定域名（suqiqinak.xyz）
1. Vercel 项目 → Settings → Domains → Add `suqiqinak.xyz`
2. 腾讯云 DNS 控制台 → 解析设置 → 添加记录：
   - 主机记录 `@`，类型 `CNAME`，记录值 `cname.vercel-dns.com`
   - （如需 www 也加一条 `www` → CNAME → `cname.vercel-dns.com`）
3. 等待生效（几分钟～几小时），Vercel 会自动签发 HTTPS

## 部署后验证清单

- [ ] 打开 https://suqiqinak.xyz 首页正常（深卡其学术风）
- [ ] 粘贴教材 → 生成牌组 → **下载 .apkg** 能直接下载（Blob 直传，不再依赖服务器文件）
- [ ] 错题制卡 → 传图片 → OCR 识别 → 复核 → 生成
- [ ] 扫描件 PDF → 自动 AI 识别
- [ ] Word (.docx) 提取
- [ ] 开始复习 / 复习记录页正常（数据在浏览器本地，换页不丢）

## 已知限制（Vercel 平台导致）

| 限制 | 说明 |
|---|---|
| 上传限 4MB | Vercel 函数体上限 4.5MB，代码已按 4MB 保守值校验 |
| 冷启动慢 2-5 秒 | pymupdf 体积大（扫描件 PDF 识别用）；可接受 |
| 函数最长 300s | Hobby 默认，抽卡/OCR 均在范围内 |
| 无持久文件系统 | 已改造：apkg 直接 base64 返回，前端 Blob 下载 |
| 国内访问速度 | Vercel 回源境外，国内可能偏慢（比本地慢但能用）；若用户反馈卡，可换国内服务器 |

## 本地开发（不变）

```bash
cd mvp-cardgen
venv\Scripts\python.exe app.py    # http://localhost:5000
```
或双击桌面「启动医学记忆卡.bat」
