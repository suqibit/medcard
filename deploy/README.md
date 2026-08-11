# 医学记忆卡 · 服务器部署文档（阿里云轻量 + Ubuntu）

> 前提：ICP 备案**已通过**、DNS 已解析 medcard.icu → 服务器公网 IP（当前 `121.40.225.35`）
> 服务器规格：2C2G / 40GB / Ubuntu 26.04（学生机，按流量计费）

## 架构

```
用户浏览器 → medcard.icu:443 (nginx, HTTPS)
                 ↓ 反代
           gunicorn :5000 (Flask app.py)
                 ↓
       DeepSeek API / 智谱 API（key 在 /opt/medcard/.env）
```

## 部署步骤（一次性，约 15 分钟）

### 1. DNS 解析
腾讯云域名管理 → medcard.icu → 添加解析：
- 记录类型 `A`，主机记录 `@`，记录值 `121.40.225.35`
- 记录类型 `A`，主机记录 `www`，记录值 `121.40.225.35`（可选）
等 10-30 分钟全球生效（可用 `ping medcard.icu` 验证）。

### 2. 服务器初始化
```bash
# SSH 登录服务器（阿里云控制台可网页终端）
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/suqibit/medcard/main/deploy/install.sh)"
# 或者: 把 deploy/ 传到服务器后 sudo bash deploy/install.sh
```

### 3. 配置密钥
```bash
sudo nano /opt/medcard/.env
# 写入（与本地 .env 相同）：
# DEEPSEEK_API_KEY=sk-xxxx
# ZHIPU_API_KEY=xxxx
sudo systemctl start medcard
curl http://127.0.0.1:5000/   # 应返回 HTML
```

### 4. HTTPS 证书（certbot 自动续期）
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d medcard.icu -d www.medcard.icu
# 按提示填邮箱，选自动跳转 https
# certbot 会自动改 nginx 配置并续期（每天凌晨自动检查）
```

### 5. nginx 站点
```bash
sudo cp deploy/medcard.nginx.conf /etc/nginx/sites-available/medcard
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/medcard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
（如果先跑了 certbot，证书路径会自动填好，本步骤只是兜底模板）

### 6. 网站底部挂备案号（必做，管局要求）
编辑 `templates/index.html` 页脚，加：
```html
<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">湘ICP备XXXXXXXX号</a>
```
（替换为备案通过后获得的备案号）→ 重新 deploy.sh

### 7. 验证
- 浏览器打开 https://medcard.icu → 正常出页面
- 上传 4MB 文件测试（nginx 已调 client_max_body_size 5m）
- 抽卡/OCR 走一遍

## 日常更新

```bash
sudo bash /opt/medcard/deploy/deploy.sh
```

## 回滚

- 代码回滚：`cd /opt/medcard && git reset --hard <旧commit> && sudo bash deploy.sh`
- 回 Vercel：域名解析改回 Vercel（代码和 vercel.json 都还在 git 里）

## 注意

- **.env 不入 git**（已 .gitignore），服务器上的 .env 手动创建
- 服务器系统盘 40GB：venv + 代码 + 日志占用 < 2GB，够用
- 流量按量计费 0.8 元/GB：套餐自带流量足够，可设余额告警防意外
- 学生机条款限制经营性用途：当前免费工具合规；未来收费需换企业机（届时代码原样迁移）
