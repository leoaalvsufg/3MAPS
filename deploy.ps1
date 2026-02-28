# Deploy 3Maps - 63.141.232.205
# Execute: .\deploy.ps1
# Usuario: usuario | Senha: Senh@01020304

$REMOTE = "/home/usuario/3maps"
$PASS = if ($env:TMAPS_PASS) { $env:TMAPS_PASS } else { "Senh@01020304" }
$SERVER = "63.141.232.205"
$USER = "usuario"

Write-Host "=== Deploy 3Maps v0.1.15 ===" -ForegroundColor Cyan

# Tentar Posh-SSH (suporta senha)
$poshSsh = Get-Module -ListAvailable Posh-SSH | Select-Object -First 1
if ($poshSsh) {
    Import-Module Posh-SSH -Force
    $secPass = ConvertTo-SecureString $PASS -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential($USER, $secPass)
    try {
        Write-Host "1. Enviando 3maps-deploy.tar.gz via SCP..." -ForegroundColor Yellow
        Set-SCPItem -ComputerName $SERVER -Credential $cred -Path "3maps-deploy.tar.gz" -Destination "/home/$USER/" -AcceptKey -Force
        Write-Host "2. Extraindo e instalando no servidor..." -ForegroundColor Yellow
        $session = New-SSHSession -ComputerName $SERVER -Credential $cred -AcceptKey -Force
        $cmd = "mkdir -p $REMOTE data logs && cd $REMOTE && tar -xzf ~/3maps-deploy.tar.gz -C . && npm install --production && (pm2 delete 3maps 2>/dev/null; pm2 start ecosystem.config.cjs 2>/dev/null || NODE_ENV=production PORT=8787 pm2 start server/cluster.js --name 3maps) && pm2 save"
        $result = Invoke-SSHCommand -SSHSession $session -Command $cmd
        Remove-SSHSession -SessionId $session.SessionId | Out-Null
        if ($result.ExitStatus -ne 0) { throw "Comando falhou: $($result.Error)" }
    } catch {
        Write-Host "Erro: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Posh-SSH nao encontrado. Use SSH interativo:" -ForegroundColor Yellow
    Write-Host "  scp 3maps-deploy.tar.gz ${USER}@${SERVER}:/home/$USER/" -ForegroundColor Gray
    Write-Host "  ssh ${USER}@${SERVER}" -ForegroundColor Gray
    scp -o StrictHostKeyChecking=accept-new 3maps-deploy.tar.gz "${USER}@${SERVER}:/home/$USER/"
    ssh -o StrictHostKeyChecking=accept-new "${USER}@${SERVER}" "mkdir -p $REMOTE data logs && cd $REMOTE && tar -xzf ~/3maps-deploy.tar.gz -C . && npm install --production && (pm2 delete 3maps 2>/dev/null; pm2 start ecosystem.config.cjs 2>/dev/null || NODE_ENV=production PORT=8787 pm2 start server/cluster.js --name 3maps) && pm2 save"
}
Write-Host "=== Concluido ===" -ForegroundColor Green
