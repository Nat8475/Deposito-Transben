# Programar Devolução em Lote — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao programar frete em lote no FormNotas, todas as NFs do mesmo fornecedor compartilham um Lote ID (UUID) em Transferencias col 30 — o FormTransferencias agrupa as linhas do lote e exibe como 1 item, e dar baixa ao lote dá baixa em todas as linhas irmãs automaticamente.

**Architecture:** Nenhuma mudança de UI no fluxo de programação — apenas backend (`Código.gs`) ganha UUID de lote e extensão do baixa. FormNotas.html ganha validação de fornecedor único. FormTransferencias.html agrupa visualmente os itens com mesmo Lote ID.

**Tech Stack:** Google Apps Script, HTML/CSS/JS vanilla, Google Sheets.

## Global Constraints

- GAS: sem `Array.from()`, sem `NodeList.forEach()` — usar for loops ou literais de array
- Nenhuma mudança em FormProgramarFrete.html ou na lógica de cancelamento/reagendamento
- `TRANSF_COL_LOTE_ID = 30`, `TRANSF_TOTAL_COL = 30` (atualizado de 29)
- Chave de validação em FormNotas: `fornNomes.length > 1` → toast `'warn'` + `return`
- Lote ID gerado com `Utilities.getUuid()` somente quando `itens.length > 1`
- Agrupamento de lote em FormTransferencias: feito em `filtrar()`, APÓS o `.filter()` atual, ANTES de `_sel = new Array(...)`
- Badge de lote: `background:#7C3AED;color:#fff;border-radius:3px;font-size:9px;padding:1px 4px`
- Não usar `forEach` em código novo — usar `for` loops

---

### Task 1: Código.gs — schema col 30 + programação em lote

**Files:**
- Modify: `Código.gs` (constantes, `_garantirAbaTransferencias`, `salvarProgramacaoDevolucao`, `executarAcaoEmLoteNotas`, `obterTransferencias`)

**Interfaces:**
- Produces: `TRANSF_COL_LOTE_ID = 30`, `TRANSF_TOTAL_COL = 30`; `salvarProgramacaoDevolucao` aceita `params.loteId`; `obterTransferencias` retorna campo `loteId` por item; `executarAcaoEmLoteNotas` gera UUID quando `itens.length > 1`

---

- [ ] **Step 1: Atualizar `TRANSF_TOTAL_COL` e adicionar `TRANSF_COL_LOTE_ID`**

Localizar em `Código.gs` (linha ~2011):
```javascript
const TRANSF_TOTAL_COL           = 29;
```

Substituir por:
```javascript
const TRANSF_TOTAL_COL           = 30;
const TRANSF_COL_LOTE_ID         = 30;
```

- [ ] **Step 2: Atualizar o comentário de schema (linha ~2010)**

Localizar:
```
\ Schema: cols 1-20 = dados originais da nota | cols 21-29 = controle de transferência
```

Substituir por:
```javascript
// Schema: cols 1-20 = dados originais da nota | cols 21-30 = controle de transferência
```

- [ ] **Step 3: Atualizar `_garantirAbaTransferencias` — verificação de schema com migração**

Localizar em `_garantirAbaTransferencias` (linha ~2026):
```javascript
try {
  var cabVal = String(ws.getRange(1, TRANSF_COL_ABA_ORIGEM).getValue()).trim();
  if (cabVal === 'Aba Origem') return ws;
} catch(_) {}
```

Substituir por:
```javascript
try {
  var cabVal  = String(ws.getRange(1, TRANSF_COL_ABA_ORIGEM).getValue()).trim();
  var cabLote = String(ws.getRange(1, TRANSF_COL_LOTE_ID).getValue()).trim();
  if (cabVal === 'Aba Origem' && cabLote === 'Lote ID') return ws;
  if (cabVal === 'Aba Origem' && cabLote !== 'Lote ID') {
    ws.getRange(1, TRANSF_COL_LOTE_ID).setValue('Lote ID')
      .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
    ws.setColumnWidth(TRANSF_COL_LOTE_ID, 280);
    return ws;
  }
} catch(_) {}
```

- [ ] **Step 4: Adicionar `'Lote ID'` ao `cabCtrl` em `_garantirAbaTransferencias`**

Localizar (linha ~2041):
```javascript
var cabCtrl = [
  'Aba Origem','Nº Pedido','Agendamento','Status Transf.',
  'Resp. Transf.','Cadastrado em','Data Baixa','Comprovante','Obs Cancelamento'
];
```

Substituir por:
```javascript
var cabCtrl = [
  'Aba Origem','Nº Pedido','Agendamento','Status Transf.',
  'Resp. Transf.','Cadastrado em','Data Baixa','Comprovante','Obs Cancelamento',
  'Lote ID'
];
```

- [ ] **Step 5: Adicionar largura da col 30 no array de widths**

Localizar (linha ~2050):
```javascript
[80,100,110,160,80,120,220,60,90,100,
 110,60,60,60,160,160,60,80,100,100,
 160,160,120,120,160,140,120,200,200].forEach(function(w,i){
```

Substituir por:
```javascript
[80,100,110,160,80,120,220,60,90,100,
 110,60,60,60,160,160,60,80,100,100,
 160,160,120,120,160,140,120,200,200,280].forEach(function(w,i){
```

- [ ] **Step 6: Adicionar `loteId` ao `rowTransf` em `salvarProgramacaoDevolucao`**

Localizar em `salvarProgramacaoDevolucao` (linha ~2111):
```javascript
var rowTransf = rowData.concat([
  params.aba,                  // col 21: Aba Origem
  transportadora,              // col 22: Transportadora
  dataAgend || '',             // col 23: Data Agendamento
  'Em Transferência',          // col 24: Status Transf
  usuario,                     // col 25: Resp. Transf
  agora,                       // col 26: Cadastrado em
  '',                          // col 27: Data Baixa
  '',                          // col 28: Comprovante
  String(params.obs || '')     // col 29: Obs
]);
```

Substituir por:
```javascript
var rowTransf = rowData.concat([
  params.aba,                       // col 21: Aba Origem
  transportadora,                   // col 22: Transportadora
  dataAgend || '',                  // col 23: Data Agendamento
  'Em Transferência',               // col 24: Status Transf
  usuario,                          // col 25: Resp. Transf
  agora,                            // col 26: Cadastrado em
  '',                               // col 27: Data Baixa
  '',                               // col 28: Comprovante
  String(params.obs || ''),         // col 29: Obs
  String(params.loteId || '')       // col 30: Lote ID
]);
```

- [ ] **Step 7: Atualizar `executarAcaoEmLoteNotas` — gerar UUID e usar for loop**

Localizar o bloco `if (acao === 'frete')` (linha ~3160):
```javascript
if (acao === 'frete') {
  var fp=params.freteParams||{}, ok=0, erros=[];
  itens.forEach(function(it){
    try {
      var r=JSON.parse(salvarProgramacaoDevolucao({
        aba:it.aba, linha:it.linha, freteTipo:fp.tipo, freteValor:fp.valor,
        dataAgendamento:fp.dataAgend, obs:fp.obs||'',
        numeroPedido:fp.numeroPedido||'',
        nf:it.nf, nfd:it.nfd, forn:it.forn, dataNF:it.data
      }));
      if (r.ok) ok++; else erros.push(it.nf+': '+(r.erro||'Erro'));
    } catch(e){ erros.push(it.nf+': '+e.message); }
  });
  return JSON.stringify({ ok:'🚚 '+ok+' NF(s) programadas para devolução.', erros:erros });
}
```

Substituir por:
```javascript
if (acao === 'frete') {
  var fp=params.freteParams||{}, ok=0, erros=[];
  var loteId = itens.length > 1 ? Utilities.getUuid() : '';
  for (var fi = 0; fi < itens.length; fi++) {
    var it = itens[fi];
    try {
      var r=JSON.parse(salvarProgramacaoDevolucao({
        aba:it.aba, linha:it.linha, freteTipo:fp.tipo, freteValor:fp.valor,
        dataAgendamento:fp.dataAgend, obs:fp.obs||'',
        numeroPedido:fp.numeroPedido||'',
        nf:it.nf, nfd:it.nfd, forn:it.forn, dataNF:it.data,
        loteId:loteId
      }));
      if (r.ok) ok++; else erros.push(it.nf+': '+(r.erro||'Erro'));
    } catch(e){ erros.push(it.nf+': '+e.message); }
  }
  var msg = loteId
    ? '🚚 Lote programado — '+ok+' NF(s) — '+(itens[0]&&itens[0].forn||'')+'.'
    : '🚚 '+ok+' NF(s) programadas para devolução.';
  return JSON.stringify({ ok: msg, erros: erros });
}
```

- [ ] **Step 8: Adicionar campo `loteId` ao objeto retornado em `obterTransferencias`**

Localizar o objeto de retorno no `.map()` (linha ~2396). O objeto tem campos como `linha`, `nfd`, `nf`, `forn` etc. Localizar a última propriedade do objeto — `atrasado: ...` — e adicionar `loteId` como próxima propriedade:

Localizar:
```javascript
atrasado:       dataAgend instanceof Date && dataAgend < hoje && stTransf === 'Em Transferência'
```

Substituir por:
```javascript
atrasado:       dataAgend instanceof Date && dataAgend < hoje && stTransf === 'Em Transferência',
loteId:         String(l[TRANSF_COL_LOTE_ID - 1] || '').trim()
```

- [ ] **Step 9: Verificar manualmente**

Abrir `Código.gs` e confirmar:
1. `TRANSF_TOTAL_COL = 30` e `TRANSF_COL_LOTE_ID = 30` estão definidos sequencialmente após `TRANSF_COL_OBS = 29`
2. Em `_garantirAbaTransferencias`: o bloco de migração existe com `cabLote !== 'Lote ID'`; `cabCtrl` tem 10 elementos (termina em `'Lote ID'`); o array de widths tem 30 valores (termina em `280`)
3. Em `salvarProgramacaoDevolucao`: `rowTransf.concat([...])` tem 10 elementos de controle (o 10º é `String(params.loteId || '')`)
4. Em `executarAcaoEmLoteNotas` (bloco `acao==='frete'`): `Utilities.getUuid()` é chamado; usa `for` loop (não `forEach`); `loteId` é passado para `salvarProgramacaoDevolucao`
5. Em `obterTransferencias`: objeto retornado inclui `loteId: String(l[TRANSF_COL_LOTE_ID - 1] || '').trim()`

- [ ] **Step 10: Commit**

```
git add Código.gs
git commit -m "feat(backend): col 30 Lote ID em Transferencias + UUID em lote de programação"
```

---

### Task 2: Código.gs — darBaixaTransferencia processa irmãs do lote

**Files:**
- Modify: `Código.gs` (apenas `darBaixaTransferencia`)

**Interfaces:**
- Consumes: `TRANSF_COL_LOTE_ID = 30`, `TRANSF_TOTAL_COL = 30` (de Task 1); `obsDevol`, `agora`, `ss`, `urlComprovante`, `params` — variáveis já em escopo na função
- Produces: ao dar baixa em qualquer linha de um lote, todas as irmãs com mesmo loteId e status `'Em Transferência'` também recebem baixa

---

- [ ] **Step 1: Inserir bloco de irmãs de lote em `darBaixaTransferencia`**

Localizar em `darBaixaTransferencia` (linha ~2229), logo após:
```javascript
if (params.obs) wsTr.getRange(linhaTransf, TRANSF_COL_OBS).setValue(params.obs);
```

Inserir imediatamente após essa linha (antes das declarações `var nf` e `var nfd`):
```javascript
// Baixa em todas as linhas irmãs do mesmo lote
var loteId = String(rowData[TRANSF_COL_LOTE_ID - 1] || '').trim();
if (loteId) {
  var ulTr = wsTr.getLastRow();
  if (ulTr >= 2) {
    var todosDados = wsTr.getRange(2, 1, ulTr - 1, TRANSF_TOTAL_COL).getValues();
    for (var ti = 0; ti < todosDados.length; ti++) {
      var lRow  = todosDados[ti];
      var linha2 = ti + 2;
      if (linha2 === linhaTransf) continue;
      var loteId2 = String(lRow[TRANSF_COL_LOTE_ID - 1] || '').trim();
      var st2     = String(lRow[TRANSF_COL_STATUS   - 1] || '').trim();
      if (loteId2 !== loteId || st2 !== 'Em Transferência') continue;

      var abaOrig2 = String(lRow[TRANSF_COL_ABA_ORIGEM - 1] || '').trim();
      var wsOrig2  = ss.getSheetByName(abaOrig2);
      if (!wsOrig2) continue;

      var dadosOrig2 = lRow.slice(0, TOTAL_COLUNAS);
      dadosOrig2[IDX_STATUS]    = 'Devolvido';
      dadosOrig2[IDX_PEND_CHK]  = false;
      dadosOrig2[IDX_DEV_CHK]   = true;
      dadosOrig2[IDX_VENDA_CHK] = false;
      dadosOrig2[IDX_OBS]       = obsDevol + (params.obs ? ' | ' + params.obs : '');

      var ulOrig2 = obterUltimaLinhaDados(wsOrig2);
      var dest2   = (ulOrig2 >= LINHA_DADOS ? ulOrig2 : LINHA_DADOS - 1) + 1;
      if (dest2 > ULTIMA_LINHA_DADOS) continue;

      wsOrig2.getRange(dest2, 1, 1, TOTAL_COLUNAS).setValues([dadosOrig2]);
      wsOrig2.getRange(dest2, COL_VL_TOT).setFormula(_formulaTotal(dest2));
      wsOrig2.getRange(dest2, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(dest2));
      wsOrig2.getRange(dest2, 1, 1, TOTAL_COLUNAS).setBackground(COR_VERDE);
      protegerLinhaConcluida(ss, wsOrig2, dest2, 'Devolvido');
      _incrementarContadorConcluidos();

      wsTr.getRange(linha2, TRANSF_COL_STATUS).setValue('Concluída');
      wsTr.getRange(linha2, TRANSF_COL_DATA_BAIXA).setValue(agora);
      if (urlComprovante) wsTr.getRange(linha2, TRANSF_COL_COMPROVANTE).setValue(urlComprovante);
      if (params.obs) wsTr.getRange(linha2, TRANSF_COL_OBS).setValue(params.obs);
    }
  }
}
```

- [ ] **Step 2: Verificar manualmente**

Abrir `Código.gs` e confirmar na função `darBaixaTransferencia`:
1. O bloco `// Baixa em todas as linhas irmãs do mesmo lote` aparece logo após a linha `if (params.obs) wsTr.getRange(linhaTransf, TRANSF_COL_OBS).setValue(params.obs);`
2. O bloco usa `for` loop (não `forEach`)
3. Todas as variáveis usadas — `obsDevol`, `agora`, `ss`, `urlComprovante`, `params`, `TOTAL_COLUNAS`, `IDX_STATUS`, `IDX_PEND_CHK`, `IDX_DEV_CHK`, `IDX_VENDA_CHK`, `IDX_OBS`, `LINHA_DADOS`, `ULTIMA_LINHA_DADOS`, `COR_VERDE` — são definidas ANTES deste bloco na mesma função ou são constantes de módulo
4. `continue` é usado (não `return`) para que o loop pule irmãs problemáticas sem abortar o processo completo

- [ ] **Step 3: Commit**

```
git add Código.gs
git commit -m "feat(backend): darBaixaTransferencia dá baixa em todas as irmãs do lote"
```

---

### Task 3: FormNotas.html — validação de fornecedor único

**Files:**
- Modify: `FormNotas.html` (apenas `confirmarFrete()`)

**Interfaces:**
- Consumes: `fornNomes` e `mesmoForn` — já declarados em `confirmarFrete()` (linhas ~1435-1436) a partir de `fornMap`; `toast(msg, tipo)` — função existente no FormNotas (tipos aceitos: `'ok'`, `'err'`, `'warn'`, `'info'`)
- Produces: se `!mesmoForn`, exibe toast e retorna — modal de confirmação não é aberto

---

- [ ] **Step 1: Adicionar validação em `confirmarFrete()` após `mesmoForn`**

Localizar em `FormNotas.html` (linha ~1436):
```javascript
var mesmoForn = fornNomes.length === 1;

_acaoPend  = 'frete';
```

Substituir por:
```javascript
var mesmoForn = fornNomes.length === 1;

if (!mesmoForn) {
  toast('⚠️ Selecione NFs de apenas um fornecedor para programar em lote.', 'warn');
  return;
}

_acaoPend  = 'frete';
```

**Nota:** `fecharModal('modal-frete')` NÃO deve ser chamado aqui — ele já foi chamado na linha 1430, antes da construção de `fornMap`.

- [ ] **Step 2: Verificar manualmente**

Abrir `FormNotas.html` e confirmar:
1. O bloco `if (!mesmoForn)` aparece imediatamente após `var mesmoForn = ...` e ANTES de `_acaoPend = 'frete'`
2. O toast usa tipo `'warn'` (string exata)
3. `fecharModal('modal-frete')` NÃO aparece dentro do bloco `if (!mesmoForn)`

- [ ] **Step 3: Commit**

```
git add FormNotas.html
git commit -m "feat(notas): bloquear prog. frete em lote com fornecedores distintos"
```

---

### Task 4: FormTransferencias.html — agrupamento visual por loteId

**Files:**
- Modify: `FormTransferencias.html` (`filtrar()`, `renderTabela()`, `abrirBaixa()`)

**Interfaces:**
- Consumes: `_filt[i].loteId` — campo retornado por `obterTransferencias` (Task 1); `_filt[i].isLote` — propriedade adicionada durante agrupamento nesta task; `_filt[i]._loteLinhas` — array de linhas do lote adicionado durante agrupamento
- Produces: `_filt` contém itens agrupados por loteId; itens de lote têm `isLote=true`, `nfd` = NFDs concatenados, `vlTot` = soma, `linha` = linha da primeira NF do lote

---

- [ ] **Step 1: Adicionar agrupamento de lote em `filtrar()`**

Localizar em `FormTransferencias.html` (linha ~280):
```javascript
_filt = _itens.filter(function(it) {
  if (fs && it.stTransf !== fs) return false;
  if (fb) {
    var h = ((it.nf||'')+(it.nfd||'')+(it.forn||'')+(it.numeroPedido||'')+(it.abaOrigem||'')).toLowerCase();
    if (h.indexOf(fb) === -1) return false;
  }
  return true;
});
_sel = new Array(_filt.length).fill(false);
```

Substituir por:
```javascript
_filt = _itens.filter(function(it) {
  if (fs && it.stTransf !== fs) return false;
  if (fb) {
    var h = ((it.nf||'')+(it.nfd||'')+(it.forn||'')+(it.numeroPedido||'')+(it.abaOrigem||'')).toLowerCase();
    if (h.indexOf(fb) === -1) return false;
  }
  return true;
});

// Agrupar itens do mesmo lote em um único item de exibição
var filtAgrup = [];
var loteMap   = {};
for (var gi = 0; gi < _filt.length; gi++) {
  var gItem = _filt[gi];
  if (!gItem.loteId) { filtAgrup.push(gItem); continue; }
  if (loteMap[gItem.loteId]) {
    var grp = loteMap[gItem.loteId];
    grp.nfd   += ', ' + gItem.nfd;
    grp.nf    += ', ' + gItem.nf;
    grp.vlTot += gItem.vlTot;
    grp.qtd   += gItem.qtd;
    grp._loteLinhas.push(gItem.linha);
  } else {
    var novoGrp = {};
    for (var gk in gItem) { if (Object.prototype.hasOwnProperty.call(gItem, gk)) novoGrp[gk] = gItem[gk]; }
    novoGrp._loteLinhas = [gItem.linha];
    novoGrp.isLote = true;
    filtAgrup.push(novoGrp);
    loteMap[gItem.loteId] = novoGrp;
  }
}
_filt = filtAgrup;

_sel = new Array(_filt.length).fill(false);
```

- [ ] **Step 2: Adicionar badge LOTE em `renderTabela()`**

Localizar em `renderTabela()` (linha ~336):
```javascript
+ '<td><b style="color:var(--navy);font-size:11px">' + esc(it.nf) + '</b><div style="font-size:10px;color:var(--text-sm)">' + esc(it.nfd) + '</div></td>'
```

Substituir por:
```javascript
+ '<td>'
  + (it.isLote ? '<span style="background:#7C3AED;color:#fff;border-radius:3px;font-size:9px;padding:1px 4px;margin-right:3px">LOTE</span>' : '')
  + '<b style="color:var(--navy);font-size:11px">' + esc(it.nf) + '</b>'
  + '<div style="font-size:10px;color:var(--text-sm)">' + esc(it.nfd) + '</div>'
+ '</td>'
```

- [ ] **Step 3: Atualizar título e descrição em `abrirBaixa()`**

Localizar em `abrirBaixa` (linha ~466):
```javascript
document.getElementById('mBaixaTitulo').textContent = '✅ Confirmar Baixa — NF ' + _filt[i].nf;
document.getElementById('mBaixaDesc').textContent = 'Fornecedor: ' + _filt[i].forn
  + ((_filt[i].numeroPedido) ? ' · Pedido: ' + _filt[i].numeroPedido : '');
```

Substituir por:
```javascript
document.getElementById('mBaixaTitulo').textContent = _filt[i].isLote
  ? '✅ Confirmar Baixa em Lote — ' + _filt[i].forn
  : '✅ Confirmar Baixa — NF ' + _filt[i].nf;
document.getElementById('mBaixaDesc').textContent = _filt[i].isLote
  ? 'Lote: ' + _filt[i].nfd + ' (' + _filt[i]._loteLinhas.length + ' NF(s))'
  : 'Fornecedor: ' + _filt[i].forn + ((_filt[i].numeroPedido) ? ' · Pedido: ' + _filt[i].numeroPedido : '');
```

`_linhaBaixa = _filt[i].linha` (linha ~465) permanece inalterado — `linha` do item agrupado é a linha da primeira NF do lote, que `darBaixaTransferencia` usa para detectar o loteId e processar as irmãs.

- [ ] **Step 4: Verificar manualmente**

Abrir `FormTransferencias.html` e confirmar:
1. O bloco de agrupamento em `filtrar()` usa `for` loops (não `forEach`); está entre `_filt = _itens.filter(...)` e `_sel = new Array(_filt.length).fill(false)`
2. O `for...in` usa `Object.prototype.hasOwnProperty.call(gItem, gk)` para cópia segura
3. Em `renderTabela()`: a linha da célula `<td>` com `it.nf` tem a condicional `it.isLote ? '<span style="background:#7C3AED...">LOTE</span>' : ''` antes do `<b>`
4. Em `abrirBaixa()`: o título e descrição são condicionais em `_filt[i].isLote`
5. `_linhaBaixa = _filt[i].linha` NÃO foi alterado

- [ ] **Step 5: Commit**

```
git add FormTransferencias.html
git commit -m "feat(transferencias): agrupar linhas de lote por loteId na visualização"
```

---

## Self-Review

**Spec coverage:**
- ✅ FormNotas — bloquear fornecedor misto → Task 3 Step 1
- ✅ `TRANSF_TOTAL_COL = 30`, `TRANSF_COL_LOTE_ID = 30` → Task 1 Step 1
- ✅ Comentário de schema atualizado → Task 1 Step 2
- ✅ `_garantirAbaTransferencias` migração + cabCtrl + widths → Task 1 Steps 3-5
- ✅ `salvarProgramacaoDevolucao` aceita `params.loteId` → Task 1 Step 6
- ✅ `executarAcaoEmLoteNotas` gera UUID + for loop → Task 1 Step 7
- ✅ `obterTransferencias` retorna `loteId` → Task 1 Step 8
- ✅ `darBaixaTransferencia` processa irmãs de lote → Task 2 Step 1
- ✅ Agrupamento por loteId em `filtrar()` → Task 4 Step 1
- ✅ Badge LOTE em `renderTabela()` → Task 4 Step 2
- ✅ Título de baixa de lote em `abrirBaixa()` → Task 4 Step 3

**Placeholder scan:** Nenhum TBD/TODO. Todos os steps têm código completo.

**Type consistency:**
- `loteId`: gerado em `executarAcaoEmLoteNotas` (Task 1 Step 7) → armazenado via `salvarProgramacaoDevolucao` (Task 1 Step 6) → lido em `obterTransferencias` (Task 1 Step 8) → usado em `filtrar()` (Task 4 Step 1) e `darBaixaTransferencia` (Task 2 Step 1). Nome consistente em todos os steps.
- `isLote`: criado em `filtrar()` (Task 4 Step 1) → usado em `renderTabela()` (Task 4 Step 2) e `abrirBaixa()` (Task 4 Step 3). Consistente.
- `_loteLinhas`: array criado em `filtrar()` (Task 4 Step 1) → usado em `abrirBaixa()` (Task 4 Step 3) como `_filt[i]._loteLinhas.length`. Consistente.
