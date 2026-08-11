# 医学记忆卡 · 微信小程序版（miniapp）

## 目录结构

```
miniapp/
├── app.js                  # 云开发初始化（改 cloudEnv）
├── app.json                # 页面路由 + tabBar
├── project.config.json     # 开发者工具配置（改 appid）
├── utils/
│   ├── db.js               # wx.storage 封装（替代 IndexedDB）
│   ├── limit.js            # 每日限额 + 连续打卡
│   ├── fsrs.js             # FSRS 调度（ts-fsrs 6.x，评级 1-4）
│   └── format.js           # 展示格式化
├── vendor/ts-fsrs.umd.js   # 与 web 版同源
├── pages/
│   ├── home/               # 首页：生成（粘贴/拍照OCR/上传PDF-Word）+ 复习入口
│   ├── review/             # 学习/复习流（三段式 + 选择题 + 评级 + 打卡）
│   └── records/            # 记录页（列表/筛选/薄弱点）
└── cloudfunctions/
    ├── generate/           # Python：DeepSeek 抽卡（需 DEEPSEEK_API_KEY）
    ├── ocr/                # Python：智谱视觉识别（需 ZHIPU_API_KEY）
    └── extract/            # Node：PDF(pdf-parse)/Word(mammoth) 提取
```

## 部署步骤（本地 → 微信开发者工具）

1. **导入项目**：微信开发者工具 → 导入 → 选 `miniapp/` 目录 → AppID 填你注册的小程序 AppID（project.config.json 的 appid 改为正式值）
2. **开通云开发**：工具栏「云开发」→ 开通 → 记下环境 ID（如 `medcard-prod-xxxxx`）
3. **改环境 ID**：`app.js` 的 `cloudEnv` 改成你的环境 ID
4. **部署云函数**：在 `cloudfunctions/` 每个函数目录右键 →「上传并部署：云端安装依赖」；extract 先 `npm install` 或选云端安装
5. **配置密钥（环境变量）**：云开发控制台 → 云函数 → generate/ocr → 配置 → 环境变量：
   - `DEEPSEEK_API_KEY` = 你的 DeepSeek key（generate）
   - `ZHIPU_API_KEY` = 你的智谱 key（ocr）
6. **测试链路**：编译 → 真机预览（或开发者工具模拟器）→ 粘贴文本生成 → 复习 → 记录页

## 限额（免费版默认，utils/limit.js + app.js 可调）

| 功能 | 每人/天 |
|------|--------|
| AI 抽卡 | 10 次 |
| 拍照 OCR | 15 次 |
| PDF/Word 上传 | 5 次 |
| 新卡学习 | 20 张 |
| 复习 | 100 张 |

## 与 web 版差异（有意为之）

- ❌ PDF 扫描件渲染 OCR（extract 只提取文本层，扫描件提示改用拍照识别）
- ❌ apkg 导出 Anki（web 版保留按钮并提示「仅浏览器可用」）
- ✅ 其余功能对齐：AI 抽卡 prompt 同源、FSRS 同库同参数、薄弱点同阈值（r>=3 算对）

## ⚠️ 踩坑记录（必看）

- **ts-fsrs 6.x 的 repeat 返回 `{1:{card,log},...}`**：必须 `res[rating].card`（rating=1忘记/2困难/3记得/4简单），`res[0]` 不存在（Manual 无 key）；Rating 枚举双向映射，用 `Rating[rating]` 会拿到字符串 key → undefined
- 云函数入参限制：图片 base64 限 1.8MB（页面端 wx.compressImage 压缩）；文件走云存储中转（wx.cloud.uploadFile → fileID）
- 主包体积限制 2MB：当前代码无压力（ts-fsrs UMD ~71KB）
