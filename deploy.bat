@echo off
REM Deploy 3Maps - Execute na pasta mindmap
echo === Deploy 3Maps para 63.141.232.205 ===
echo.
echo 1. Enviando arquivos (digite a senha quando solicitado)...
scp -o StrictHostKeyChecking=accept-new 3maps-deploy.tar.gz usuario@63.141.232.205:/home/usuario/
echo.
echo 2. Instalando no servidor (digite a senha quando solicitado)...
ssh -o StrictHostKeyChecking=accept-new usuario@63.141.232.205 "mkdir -p /home/usuario/3maps && cd /home/usuario/3maps && tar -xzf ~/3maps-deploy.tar.gz -C . && npm install --production && (pm2 restart 3maps 2>/dev/null || pm2 start server/index.js --name 3maps 2>/dev/null || echo Inicie: node server/index.js)"
echo.
echo === Concluido ===
pause
