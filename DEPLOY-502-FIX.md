# Correção do 502 Bad Gateway

O 502 ocorre quando o **nginx não consegue conectar ao backend Node.js**. Siga os passos abaixo no servidor.

## 1. Conectar ao servidor

```bash
ssh usuario@63.141.232.205
# Senha: Senh@01020304
```

## 2. Verificar se o Node está rodando

```bash
cd /home/usuario/3maps
pm2 list
pm2 logs 3maps
```

Se não estiver rodando ou tiver erros:

```bash
pm2 delete 3maps
NODE_ENV=production PORT=8787 pm2 start server/cluster.js --name 3maps
pm2 save
```

## 3. Testar o backend localmente

```bash
curl http://127.0.0.1:8787/api/usage
# Deve retornar 401 (precisa de auth) ou JSON - não 502
```

## 4. Configurar o nginx

O nginx precisa fazer proxy para `127.0.0.1:8787`. Verifique a config atual:

```bash
sudo cat /etc/nginx/sites-enabled/default
# ou
ls /etc/nginx/sites-enabled/
```

Use o exemplo em `nginx-3maps.conf.example`:

```bash
sudo cp /home/usuario/3maps/nginx-3maps.conf.example /etc/nginx/sites-available/3maps
sudo ln -sf /etc/nginx/sites-available/3maps /etc/nginx/sites-enabled/
# Ou edite o default para incluir o proxy
```

A configuração mínima para o proxy:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Para arquivos estáticos (SPA), o `root` deve apontar para `dist/`:

```nginx
root /home/usuario/3maps/dist;
location / {
    try_files $uri $uri/ /index.html;
}
```

Depois:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Redeploy (se necessário)

Execute novamente o deploy do seu PC:

```powershell
cd c:\Users\dellg\Downloads\mindmap
.\deploy.ps1
```

O novo pacote inclui `ecosystem.config.cjs` e inicia o servidor na porta 8787.
