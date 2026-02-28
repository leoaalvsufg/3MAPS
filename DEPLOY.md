# Deploy 3Maps v0.1.2

## GitHub

O push foi rejeitado porque o branch local divergiu do remoto. Para publicar:

**Opção A - Manter suas alterações locais (sobrescreve o remoto):**
```bash
git push origin main --force-with-lease
```

**Opção B - Integrar alterações remotas primeiro:**
```bash
git pull origin main
# Resolva conflitos se houver
git push origin main
```

## Servidor 63.141.232.205

### Pré-requisitos
- SSH configurado para o servidor
- Node.js e npm no servidor
- Build local já executado (`npm run build`)

### Deploy manual

1. **Build:**
   ```bash
   npm run build
   ```

2. **Envie os arquivos via SCP/rsync:**
   ```bash
   rsync -avz --delete dist/ usuario@63.141.232.205:/caminho/do/app/dist/
   rsync -avz server/ usuario@63.141.232.205:/caminho/do/app/server/
   cp package.json package-lock.json server/
   ```

3. **No servidor, reinstale dependências e reinicie:**
   ```bash
   ssh usuario@63.141.232.205
   cd /caminho/do/app
   npm install --production
   pm2 restart 3maps  # ou systemctl restart 3maps
   ```

### Usando o script deploy.sh

Se tiver SSH configurado:
```bash
chmod +x deploy.sh
./deploy.sh usuario@63.141.232.205
```

Ajuste `REMOTE_DIR` no script conforme o diretório real do app no servidor.


## Deploy no Windows (PowerShell/CMD)

### Credenciais
- **Servidor:** 63.141.232.205
- **Usuario:** usuario
- **Senha:** Senh@01020304
- **Diretorio remoto:** /home/usuario/3maps

### Metodo rapido
Execute: `.\deploy.ps1` ou `deploy.bat`

### Passos manuais
1. scp -o StrictHostKeyChecking=accept-new 3maps-deploy.tar.gz usuario@63.141.232.205:/home/usuario/
2. ssh usuario@63.141.232.205
3. cd /home/usuario/3maps ; tar -xzf ~/3maps-deploy.tar.gz -C . ; npm install --production ; pm2 restart 3maps

### Automatizacao
- sshpass: nao disponivel no Windows
- plink: use PuTTY com -pw para senha
- Ou configure chave SSH
