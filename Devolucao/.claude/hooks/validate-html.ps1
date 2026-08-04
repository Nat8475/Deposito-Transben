# PostToolUse (Edit|Write): valida HTML do GAS apos edicao.
# Checa scriptlets <? ?> balanceados e pares de tags criticas.
# Aviso vai para o Claude via exit 2 + stderr.
# ATENCAO: manter este arquivo ASCII puro (PS 5.1 le sem BOM como ANSI).

$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$filePath = $payload.tool_input.file_path
if (-not $filePath -or $filePath -notmatch '\.html$') { exit 0 }
if (-not (Test-Path $filePath)) { exit 0 }

$content = [System.IO.File]::ReadAllText($filePath)
# Normaliza fechamentos escapados em strings JS (<\/script>) e remove comentarios
# HTML/CSS/JS-bloco para reduzir falsos positivos.
$content = $content -replace '<\\/', '</'
$content = [regex]::Replace($content, '<!--.*?-->', '', 'Singleline')
$content = [regex]::Replace($content, '/\*.*?\*/', '', 'Singleline')
$problems = @()

# Scriptlets GAS: <? / <?= / <?!= devem fechar com ?>
$open = ([regex]::Matches($content, '<\?')).Count
$close = ([regex]::Matches($content, '\?>')).Count
if ($open -ne $close) {
    $problems += "Scriptlets GAS desbalanceados: $open '<?' vs $close '?>' (quebram silenciosamente no HtmlService)."
}

# Pares de tags que costumam quebrar layout quando desbalanceadas
foreach ($tag in @('div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'script', 'select')) {
    $o = ([regex]::Matches($content, "<$tag(\s|>)", 'IgnoreCase')).Count
    $c = ([regex]::Matches($content, "</$tag>", 'IgnoreCase')).Count
    if ($o -ne $c) {
        $problems += "Tag <$tag> desbalanceada: $o aberturas vs $c fechamentos."
    }
}

# Regra do projeto: nunca ::before/::after em <tr>
if ($content -match '(^|[\s,{>])tr(:hover)?::(before|after)') {
    $problems += "Uso de ::before/::after em <tr> detectado - vira celula anonima no Chrome e desalinha colunas (bug cdd9cd9)."
}

if ($problems.Count -gt 0) {
    $name = Split-Path $filePath -Leaf
    [Console]::Error.WriteLine("validate-html [$name]:`n- " + ($problems -join "`n- ") + "`nVerifique se a edicao introduziu isso (contagens podem ter falso positivo em strings JS).")
    exit 2
}
exit 0
