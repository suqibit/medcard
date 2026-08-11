#!/bin/bash
# ============================================
# 医学记忆卡 · 日常部署脚本（更新代码 + 重启）
# 用法: sudo bash deploy.sh
# ============================================
set -e

echo "==> 拉取最新代码"
cd /opt/medcard
git pull

echo "==> 更新依赖"
venv/bin/pip install -r requirements.txt gunicorn -q

echo "==> 重启服务"
systemctl restart medcard
systemctl --no-pager status medcard | head -8
echo "==> 完成"
