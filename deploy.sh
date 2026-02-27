#!/bin/bash
# Script de deploy 3Maps para servidor 63.141.232.205
# Uso: ./deploy.sh [usuario@63.141.232.205]
# Configure SSH key ou use usuário/senha

set -e
SERVER="${1:-root@63.141.232.205}"
REMOTE_DIR="/var/www/3maps"
LOCAL_DIST="dist"
LOCAL_SERVER="server"

echo "=== Build local ==="
npm run build

echo "=== Criando pacote de deploy ==="
DEPLOY_DIR=$(mktemp -d)
cp -r $LOCAL_DIST "$DEPLOY_DIR/"
cp -r $LOCAL_SERVER "$DEPLOY_DIR/"
cp package.json package-lock.json "$DEPLOY_DIR/" 2>/dev/null || true
cp index.html vite.config.ts "$DEPLOY_DIR/" 2>/dev/null || true

echo "=== Enviando para $SERVER ==="
ssh $SERVER "mkdir -p $REMOTE_DIR"
rsync -avz --delete "$DEPLOY_DIR/" "$SERVER:$REMOTE_DIR/"

echo "=== Reiniciando serviço (se aplicável) ==="
ssh $SERVER "cd $REMOTE_DIR && (pm2 restart 3maps 2>/dev/null || systemctl restart 3maps 2>/dev/null || echo 'Reinicie manualmente o servidor Node')"

rm -rf "$DEPLOY_DIR"
echo "=== Deploy concluído ==="
