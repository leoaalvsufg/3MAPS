#!/bin/bash
# Execute no servidor: bash scripts/server-setup.sh
# Configura e inicia o 3Maps

set -e
APP_DIR="${1:-/home/usuario/3maps}"
cd "$APP_DIR"

echo "=== 3Maps - Setup no servidor ==="

# Criar diretório de dados e logs
mkdir -p data logs

# Instalar dependências
npm install --production

# Parar pm2 se já estiver rodando
pm2 delete 3maps 2>/dev/null || true

# Iniciar com ecosystem (usa cluster.js, PORT=8787)
if [ -f ecosystem.config.cjs ]; then
    pm2 start ecosystem.config.cjs
else
    NODE_ENV=production PORT=8787 pm2 start server/cluster.js --name 3maps
fi

pm2 save
pm2 startup 2>/dev/null || echo "Execute o comando sugerido pelo pm2 startup para iniciar no boot"

echo ""
echo "Verifique se está rodando: pm2 list"
echo "Logs: pm2 logs 3maps"
echo "O app deve estar em http://127.0.0.1:8787"
echo "Nginx deve fazer proxy de /api/ para 127.0.0.1:8787"
