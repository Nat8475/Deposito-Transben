# PostToolUse (Bash|PowerShell): após 'clasp push', injeta lembrete do fluxo completo de deploy.

$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$cmd = $payload.tool_input.command
if (-not $cmd -or $cmd -notmatch 'clasp\s+push') { exit 0 }

$reminder = "LEMBRETE deploy: 'clasp push' so atualiza @HEAD. Para a mudanca aparecer no Web App: (1) redeploy nos 2 deployments versionados (clasp deploy -i <id>), (2) tratar cache de paginas (bump da chave pg_html_v12*_ em _getPageContent e limparCachePaginas, ou menu Limpar Cache, ou aguardar 10min). Ver skill deploy-teste."

$out = @{ hookSpecificOutput = @{ hookEventName = 'PostToolUse'; additionalContext = $reminder } } | ConvertTo-Json -Compress
[Console]::Out.WriteLine($out)
exit 0
