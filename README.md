# medcard · 医疗信息聚合平台

> 个人独立开发的医疗信息聚合与健康数据管理平台：医疗知识库 + 健康数据管理 + 微信小程序端。
> 由 AI coding agent 结对开发，全程人工验证与安全加固。

## ✨ 功能特性

- 医疗知识库：结构化知识条目管理，支持全文检索
  - 防幻觉设计：条目标注来源渠道与版本年份；草稿态不可被引用；AI 起草 + 人工审核双轨制
- 健康数据管理：化验 / 偶测记录等健康指标的追踪与展示（[待确认：补充当前已上线的具体功能]）
- 微信小程序端：移动端访问入口
- REST API：自建接口，认证保护

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python / Flask + SQLite |
| 前端 | 小程序端（miniapp）+ HTML 模板 |
| 部署 | Vercel（serverless） |
| 测试 | pytest（认证接口自动化测试） |

## 🚀 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置环境变量（密钥不入库）
#    [待确认：列出实际所需的环境变量名，如 DATABASE_URL / API_SECRET 等]

# 3. 本地运行
python app.py
```

## 🔒 安全设计

- 零硬编码密钥：小程序 appid、API 密钥等全部走环境变量 / 私有配置（gitignored）
- 提示词注入防护：用户输入与系统指令之间建立明确边界（delimit user input + instructions）
- 错误信息脱敏：对外统一返回通用错误信息，不暴露内部异常细节（`replace str(e) error exposure`）
- 自动化测试：认证接口 pytest 测试（test_api_auth.py）
- 持续审计：AUDIT_TODO.md 维护安全审计清单，迭代推进

## 📁 项目结构

```
api/           # API 相关模块
deploy/        # 部署辅助
miniapp/       # 微信小程序端
static/        # 静态资源
templates/     # HTML 模板
app.py         # Flask 主应用
test_api_auth.py   # 认证接口自动化测试
AUDIT_TODO.md      # 安全审计清单
DEPLOY.md          # 部署文档
vercel.json        # Vercel 配置
```
