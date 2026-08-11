#!/bin/bash
# ============================================
# 医学记忆卡 · 服务器一键初始化脚本（Ubuntu）
# 用途：阿里云轻量服务器（Ubuntu 22.04/24.04/26.04）首次配置
# 用法：sudo bash install.sh
# 注意：备案通过、DNS 解析生效后再执行
# ============================================
set -e

echo "==> [1/6] 更新系统"
apt update && apt upgrade -y

echo "==> [2/6] 安装基础依赖"
apt install -y python3 python3-venv python3-pip nginx git

echo "==> [3/6] 获取代码"
mkdir -p /opt/medcard
cd /opt/medcard
if [ ! -d .git ]; then
  # TODO: 替换为你的实际仓库地址（suqibit/medcard）
  git clone https://github.com/suqibit/medcard.git .
else
  git pull
fi

echo "==> [4/6] 创建虚拟环境并安装依赖"
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements.txt gunicorn

echo "==> [5/6] 配置 systemd 服务"
cp deploy/medcard.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable medcard

echo "==> [6/6] 提示"
echo "-------------------------------"
echo " 1) 创建环境变量文件:"
echo "    sudo nano /opt/medcard/.env"
echo "    写入:"
echo "    DEEPSEEK_API_KEY=你的key"
echo "    ZHIPU_API_KEY=你的key"
echo " 2) 启动服务:"
echo "    sudo systemctl start medcard"
echo " 3) 配置 nginx + HTTPS:"
echo "    参考 deploy/README.md 的 nginx/certbot 步骤"
echo "-------------------------------"
