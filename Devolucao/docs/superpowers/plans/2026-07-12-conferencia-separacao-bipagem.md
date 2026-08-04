# Conferência de Separação por Bipagem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova tela `FormConferencia.html`, aberta a partir de um Lote em `FormTransferencias.html`, onde o usuário bipa código de barras/QR de cada caixa separada; o sistema identifica o produto (catálogo `_Produtos`, populado on-the-fly), soma bipagens em `_Bipagens` (log individual) e compara o total bipado contra a soma de `Qtd` das NFs do lote.

**Architecture:** Backend novo em `Código.gs` (2 abas novas + 8 funções `google.script.run`, seguindo o padrão de `_garantirAbaTransferencias`/`registrarLog`). Página nova `FormConferencia.html` no padrão SPA-via-iframe já usado pelo sistema (`_WEBAPP_PAGINAS`, `_getPageContent`, injeção do design system). Passagem do `loteId` da página de origem para a nova página replica o mecanismo já existente de `cdvBuscar()`/`_pendingBuscaTermo` em `Index.html`, generalizado para aceitar parâmetros arbitrários.

**Tech Stack:** Google Apps Script (V8 runtime), HTML/CSS/JS vanilla, Google Sheets.

## Global Constraints

- Sem `Array.from()`; usar `for` loops em vez de `.forEach()` em código novo de `Código.gs` (convenção do projeto para loops que precisam de `continue`/skip).
- Toda escrita em `_Produtos`/`_Bipagens`/coluna nova de `Transferencias` deve chamar `registrarLog(ss, nomeAba, row, col, valorAnterior, novoValor, acao)`.
- Toda função `google.script.run` exposta ao frontend retorna `JSON.stringify({...})`; erro sempre como `{erro: '❌ ...'}`.
- `toast(msg, tipo)` em `FormConferencia.html` usa `showToast()` global (injetado por `Styles.html`), tipos `'ok'|'err'|'warn'|'info'` — mesmo padrão de `FormTransferencias.html`.
- Botão "📦 Conferir Separação" só aparece para itens com `it.isLote === true` (lotes multi-NF) — decisão explícita, NF única não usa esta tela.
- Cache de páginas: chave `pg_html_v12m_` em `Código.gs:8110` e `:8125` — precisa virar `pg_html_v12n_` na última task (Task 5), cobrindo a mudança em `FormTransferencias.html` e `Index.html`.
- Nenhuma NF individual é rastreada na bipagem — soma é agregada por lote inteiro (decisão do design, ver spec `docs/superpowers/specs/2026-07-12-conferencia-separacao-bipagem-design.md`).

---

### Task 1: Código.gs — abas `_Produtos`/`_Bipagens` + funções de backend

**Files:**
- Modify: `Código.gs`

**Interfaces:**
- Produces: `ABA_PRODUTOS = '_Produtos'`, `ABA_BIPAGENS = '_Bipagens'`, `TRANSF_COL_CONFERENCIA = 31`, `TRANSF_TOTAL_COL = 31` (atualizado de 30); funções `bipar(params)`, `cadastrarProdutoEBipar(params)`, `desfazerUltimaBipagem(params)`, `obterNFsDoLote(params)`, `obterBipagensDoLote(params)`, `concluirConferencia(params)` — todas retornam `JSON.stringify({...})`; `'Conferencia': 'FormConferencia'` adicionado a `_WEBAPP_PAGINAS`

---

- [ ] **Step 1: Adicionar constantes das abas novas e coluna de conferência**

Localizar em `Código.gs` (linha ~2011, junto às constantes de Transferencias):
```javascript
const TRANSF_TOTAL_COL           = 30;
const TRANSF_COL_LOTE_ID         = 30;
```

Substituir por:
```javascript
const TRANSF_TOTAL_COL           = 31;
const TRANSF_COL_LOTE_ID         = 30;
const TRANSF_COL_CONFERENCIA     = 31;
const ABA_PRODUTOS               = '_Produtos';
const ABA_BIPAGENS               = '_Bipagens';
```

- [ ] **Step 2: Estender `_garantirAbaTransferencias` — col 31 (Conferência)**

Localizar em `_garantirAbaTransferencias` (bloco de verificação de schema, logo após a checagem de `cabLote`):
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

Substituir por:
```javascript
try {
  var cabVal  = String(ws.getRange(1, TRANSF_COL_ABA_ORIGEM).getValue()).trim();
  var cabLote = String(ws.getRange(1, TRANSF_COL_LOTE_ID).getValue()).trim();
  var cabConf = String(ws.getRange(1, TRANSF_COL_CONFERENCIA).getValue()).trim();
  if (cabVal === 'Aba Origem' && cabLote === 'Lote ID' && cabConf === 'Conferência') return ws;
  if (cabVal === 'Aba Origem' && cabLote !== 'Lote ID') {
    ws.getRange(1, TRANSF_COL_LOTE_ID).setValue('Lote ID')
      .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
    ws.setColumnWidth(TRANSF_COL_LOTE_ID, 280);
  }
  if (cabVal === 'Aba Origem' && cabConf !== 'Conferência') {
    ws.getRange(1, TRANSF_COL_CONFERENCIA).setValue('Conferência')
      .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
    ws.setColumnWidth(TRANSF_COL_CONFERENCIA, 260);
  }
  if (cabVal === 'Aba Origem') return ws;
} catch(_) {}
```

Localizar (cabeçalho completo, criação do zero):
```javascript
var cabCtrl = [
  'Aba Origem','Nº Pedido','Agendamento','Status Transf.',
  'Resp. Transf.','Cadastrado em','Data Baixa','Comprovante','Obs Cancelamento',
  'Lote ID'
];
```

Substituir por:
```javascript
var cabCtrl = [
  'Aba Origem','Nº Pedido','Agendamento','Status Transf.',
  'Resp. Transf.','Cadastrado em','Data Baixa','Comprovante','Obs Cancelamento',
  'Lote ID','Conferência'
];
```

Localizar o array de larguras de coluna:
```javascript
[80,100,110,160,80,120,220,60,90,100,
 110,60,60,60,160,160,60,80,100,100,
 160,160,120,120,160,140,120,200,200,280].forEach(function(w,i){
```

Substituir por:
```javascript
[80,100,110,160,80,120,220,60,90,100,
 110,60,60,60,160,160,60,80,100,100,
 160,160,120,120,160,140,120,200,200,280,260].forEach(function(w,i){
```

- [ ] **Step 3: Criar `_garantirAbaProdutos(ss)`**

Adicionar logo após o fechamento de `_garantirAbaTransferencias(ss)`:
```javascript
function _garantirAbaProdutos(ss) {
  var ws = ss.getSheetByName(ABA_PRODUTOS);
  if (ws) {
    try {
      var cab = String(ws.getRange(1, 1).getValue()).trim();
      if (cab === 'Codigo Barra') return ws;
    } catch(_) {}
  } else {
    ws = ss.insertSheet(ABA_PRODUTOS);
  }
  ws.clearContents();
  var header = ['Codigo Barra', 'Nome Produto', 'Data Cadastro', 'Cadastrado Por'];
  ws.getRange(1, 1, 1, header.length).setValues([header])
    .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
  ws.setFrozenRows(1);
  [200, 300, 140, 200].forEach(function(w, i) { ws.setColumnWidth(i + 1, w); });
  return ws;
}
```

**Nota:** `.forEach` neste bloco é aceitável — é um loop de configuração de largura de coluna sem `continue`/skip condicional, igual ao já usado em `_garantirAbaTransferencias`. A restrição de `for`-loop no Global Constraints vale para os loops de processamento de dados dos steps seguintes.

- [ ] **Step 4: Criar `_garantirAbaBipagens(ss)`**

Adicionar logo após `_garantirAbaProdutos`:
```javascript
function _garantirAbaBipagens(ss) {
  var ws = ss.getSheetByName(ABA_BIPAGENS);
  if (ws) {
    try {
      var cab = String(ws.getRange(1, 1).getValue()).trim();
      if (cab === 'Lote Id') return ws;
    } catch(_) {}
  } else {
    ws = ss.insertSheet(ABA_BIPAGENS);
  }
  ws.clearContents();
  var header = ['Lote Id', 'Codigo Barra', 'Nome Produto', 'Timestamp', 'Responsavel', 'Desfeito'];
  ws.getRange(1, 1, 1, header.length).setValues([header])
    .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
  ws.setFrozenRows(1);
  [280, 200, 300, 140, 200, 80].forEach(function(w, i) { ws.setColumnWidth(i + 1, w); });
  return ws;
}
```

- [ ] **Step 5: Criar helpers internos `_buscarProdutoPorCodigo` e `_agregarBipagensPorProduto`**

Adicionar logo após `_garantirAbaBipagens`:
```javascript
function _buscarProdutoPorCodigo(wsP, codigo) {
  var ul = wsP.getLastRow();
  if (ul < 2) return null;
  var dados = wsP.getRange(2, 1, ul - 1, 2).getValues();
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][0] || '').trim() === codigo) return String(dados[i][1] || '').trim();
  }
  return null;
}

function _agregarBipagensPorProduto(wsB, loteId) {
  var ul = wsB.getLastRow();
  if (ul < 2) return { totais: [], totalBipado: 0 };
  var dados = wsB.getRange(2, 1, ul - 1, 6).getValues();
  var mapa = {};
  var ordem = [];
  var totalBipado = 0;
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (String(row[0] || '').trim() !== loteId) continue;
    if (row[5] === true) continue;
    var produto = String(row[2] || '').trim();
    if (!mapa.hasOwnProperty(produto)) { mapa[produto] = 0; ordem.push(produto); }
    mapa[produto]++;
    totalBipado++;
  }
  var totais = [];
  for (var j = 0; j < ordem.length; j++) totais.push({ produto: ordem[j], qtd: mapa[ordem[j]] });
  return { totais: totais, totalBipado: totalBipado };
}
```

- [ ] **Step 6: Criar `bipar(params)`**

Adicionar logo após os helpers:
```javascript
function bipar(params) {
  try {
    var ss = SpreadsheetApp.getActive();
    var codigo = String(params.codigo || '').trim();
    var loteId = String(params.loteId || '').trim();
    if (!codigo) return JSON.stringify({ erro: 'Código vazio.' });
    if (!loteId) return JSON.stringify({ erro: 'Lote inválido.' });

    var wsP = _garantirAbaProdutos(ss);
    var produto = _buscarProdutoPorCodigo(wsP, codigo);
    if (!produto) return JSON.stringify({ precisaCadastro: true, codigo: codigo });

    var wsB = _garantirAbaBipagens(ss);
    var usuario = Session.getActiveUser().getEmail() || 'sistema';
    var agora = new Date();
    var linha = wsB.getLastRow() + 1;
    wsB.getRange(linha, 1, 1, 6).setValues([[loteId, codigo, produto, agora, usuario, false]]);
    registrarLog(ss, ABA_BIPAGENS, linha, 2, '', codigo, '📦 Bipagem: ' + produto);

    var totais = _agregarBipagensPorProduto(wsB, loteId);
    return JSON.stringify({ ok: true, produto: produto, totais: totais });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 7: Criar `cadastrarProdutoEBipar(params)`**

Adicionar logo após `bipar`:
```javascript
function cadastrarProdutoEBipar(params) {
  try {
    var ss = SpreadsheetApp.getActive();
    var codigo = String(params.codigo || '').trim();
    var nome   = String(params.nome || '').trim();
    var loteId = String(params.loteId || '').trim();
    if (!codigo || !nome) return JSON.stringify({ erro: 'Código e nome são obrigatórios.' });

    var wsP = _garantirAbaProdutos(ss);
    if (!_buscarProdutoPorCodigo(wsP, codigo)) {
      var usuario = Session.getActiveUser().getEmail() || 'sistema';
      var agora = new Date();
      var linha = wsP.getLastRow() + 1;
      wsP.getRange(linha, 1, 1, 4).setValues([[codigo, nome, agora, usuario]]);
      registrarLog(ss, ABA_PRODUTOS, linha, 2, '', nome, '🆕 Produto cadastrado');
    }
    return bipar({ loteId: loteId, codigo: codigo });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 8: Criar `desfazerUltimaBipagem(params)`**

Adicionar logo após `cadastrarProdutoEBipar`:
```javascript
function desfazerUltimaBipagem(params) {
  try {
    var ss = SpreadsheetApp.getActive();
    var loteId = String(params.loteId || '').trim();
    if (!loteId) return JSON.stringify({ erro: 'Lote inválido.' });

    var wsB = _garantirAbaBipagens(ss);
    var ul = wsB.getLastRow();
    if (ul < 2) return JSON.stringify({ erro: 'Nenhuma bipagem encontrada.' });

    var dados = wsB.getRange(2, 1, ul - 1, 6).getValues();
    var linhaAlvo = -1;
    for (var i = dados.length - 1; i >= 0; i--) {
      if (String(dados[i][0] || '').trim() === loteId && dados[i][5] !== true) {
        linhaAlvo = i + 2;
        break;
      }
    }
    if (linhaAlvo === -1) return JSON.stringify({ erro: 'Nada para desfazer.' });

    wsB.getRange(linhaAlvo, 6).setValue(true);
    registrarLog(ss, ABA_BIPAGENS, linhaAlvo, 6, false, true, '↩️ Bipagem desfeita');

    var totais = _agregarBipagensPorProduto(wsB, loteId);
    return JSON.stringify({ ok: true, totais: totais });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 9: Criar `obterNFsDoLote(params)`**

Adicionar logo após `desfazerUltimaBipagem`:
```javascript
function obterNFsDoLote(params) {
  try {
    var ss = SpreadsheetApp.getActive();
    var loteId = String(params.loteId || '').trim();
    if (!loteId) return JSON.stringify({ erro: 'Lote inválido.' });

    var wsTr = _garantirAbaTransferencias(ss);
    var ul = wsTr.getLastRow();
    if (ul < 2) return JSON.stringify({ erro: 'Nenhuma transferência encontrada.' });

    var dados = wsTr.getRange(2, 1, ul - 1, TRANSF_TOTAL_COL).getValues();
    var nfs = [];
    var totalEsperado = 0;
    var transportadora = '', dataAgend = '', forn = '';
    for (var i = 0; i < dados.length; i++) {
      var row = dados[i];
      if (String(row[TRANSF_COL_LOTE_ID - 1] || '').trim() !== loteId) continue;
      var qtd = Number(row[COL_QTD - 1]) || 0;
      totalEsperado += qtd;
      nfs.push({ nf: row[COL_NF - 1], nfd: row[COL_NFD - 1], desc: row[COL_DESC - 1], qtd: qtd });
      transportadora = row[TRANSF_COL_TRANSPORTADORA - 1];
      dataAgend = row[TRANSF_COL_DATA_AGEND - 1];
      forn = row[COL_FORN - 1];
    }
    if (!nfs.length) return JSON.stringify({ erro: 'Lote não encontrado.' });

    return JSON.stringify({
      nfs: nfs, totalEsperado: totalEsperado,
      transportadora: transportadora, dataAgend: dataAgend, forn: forn
    });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 10: Criar `obterBipagensDoLote(params)`**

Adicionar logo após `obterNFsDoLote`:
```javascript
function obterBipagensDoLote(params) {
  try {
    var ss = SpreadsheetApp.getActive();
    var loteId = String(params.loteId || '').trim();
    if (!loteId) return JSON.stringify({ erro: 'Lote inválido.' });

    var wsB = _garantirAbaBipagens(ss);
    var totais = _agregarBipagensPorProduto(wsB, loteId);
    return JSON.stringify(totais);
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 11: Criar `concluirConferencia(params)`**

Adicionar logo após `obterBipagensDoLote`:
```javascript
function concluirConferencia(params) {
  try {
    var ss = SpreadsheetApp.getActive();
    var loteId = String(params.loteId || '').trim();
    if (!loteId) return JSON.stringify({ erro: 'Lote inválido.' });

    var wsTr = _garantirAbaTransferencias(ss);
    var ul = wsTr.getLastRow();
    if (ul < 2) return JSON.stringify({ erro: 'Nenhuma transferência encontrada.' });

    var dados = wsTr.getRange(2, 1, ul - 1, TRANSF_TOTAL_COL).getValues();
    var usuario = Session.getActiveUser().getEmail() || 'sistema';
    var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var marcado = 0;
    for (var i = 0; i < dados.length; i++) {
      if (String(dados[i][TRANSF_COL_LOTE_ID - 1] || '').trim() !== loteId) continue;
      var linha = i + 2;
      wsTr.getRange(linha, TRANSF_COL_CONFERENCIA).setValue('Conferida em ' + agora + ' por ' + usuario);
      marcado++;
    }
    if (!marcado) return JSON.stringify({ erro: 'Lote não encontrado.' });

    registrarLog(ss, ABA_TRANSFERENCIAS, 0, TRANSF_COL_CONFERENCIA, '', loteId, '📦 Conferência de separação concluída');
    return JSON.stringify({ ok: true });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 12: Registrar a página em `_WEBAPP_PAGINAS`**

Localizar (linha ~7956):
```javascript
var _WEBAPP_PAGINAS = {
  'Index'          : 'Index',
  'Dashboard'      : 'FormDashboard',
  'Lancamento'     : 'FormLancamento',
  'Busca'          : 'FormBusca',
  'Email'          : 'FormEmailDevolucao',
  'Frete'          : 'FormProgramarFrete',
  'BaixaDevolucao' : 'FormExportarPDF',
  'BaixaVenda'     : 'FormVenda',
  'Reabertura'     : 'FormReabertura',
  'Relatorios'     : 'FormRelatorios',
  'Backup'         : 'FormBackup',
  'Auditoria'      : 'FormAuditoria',
  'Configuracoes'  : 'FormConfiguracoes',
  'Notas'          : 'FormNotas',
  'Transferencias' : 'FormTransferencias'
};
```

Substituir por (adicionar a última linha):
```javascript
var _WEBAPP_PAGINAS = {
  'Index'          : 'Index',
  'Dashboard'      : 'FormDashboard',
  'Lancamento'     : 'FormLancamento',
  'Busca'          : 'FormBusca',
  'Email'          : 'FormEmailDevolucao',
  'Frete'          : 'FormProgramarFrete',
  'BaixaDevolucao' : 'FormExportarPDF',
  'BaixaVenda'     : 'FormVenda',
  'Reabertura'     : 'FormReabertura',
  'Relatorios'     : 'FormRelatorios',
  'Backup'         : 'FormBackup',
  'Auditoria'      : 'FormAuditoria',
  'Configuracoes'  : 'FormConfiguracoes',
  'Notas'          : 'FormNotas',
  'Transferencias' : 'FormTransferencias',
  'Conferencia'    : 'FormConferencia'
};
```

- [ ] **Step 13: Verificar manualmente**

Abrir `Código.gs` e confirmar:
1. `TRANSF_TOTAL_COL = 31`, `TRANSF_COL_CONFERENCIA = 31`, `ABA_PRODUTOS`/`ABA_BIPAGENS` definidos
2. `_garantirAbaTransferencias`: migração cobre `cabConf`; `cabCtrl` tem 11 elementos (termina em `'Conferência'`); array de widths tem 31 valores (termina em `260`)
3. `_garantirAbaProdutos` e `_garantirAbaBipagens` existem, cada uma com header + freeze row 1 + larguras
4. Todas as 6 funções novas (`bipar`, `cadastrarProdutoEBipar`, `desfazerUltimaBipagem`, `obterNFsDoLote`, `obterBipagensDoLote`, `concluirConferencia`) retornam `JSON.stringify(...)` em todo caminho (sucesso e erro)
5. `_WEBAPP_PAGINAS['Conferencia'] === 'FormConferencia'`

- [ ] **Step 14: Commit**

```
git add "Código.gs"
git commit -m "feat(backend): conferência de separação por bipagem — abas _Produtos/_Bipagens + funções"
```

---

### Task 2: FormConferencia.html — página nova de bipagem

**Files:**
- Create: `FormConferencia.html`

**Interfaces:**
- Consumes: `bipar`, `cadastrarProdutoEBipar`, `desfazerUltimaBipagem`, `obterNFsDoLote`, `obterBipagensDoLote`, `concluirConferencia` (Task 1); `showToast()` (global, injetado por `Styles.html`); `window.callServer(fn, args, ok, er)` (polyfill global injetado pelo iframe, ver Task 3); mensagem `postMessage({cdvAutoLote: loteId})` vinda do `Index.html` (Task 3)
- Produces: página completa, sem dependências de outras tasks para renderizar (só fica funcional após Task 3 estar pronta, pois depende do `cdvAutoLote`)

---

- [ ] **Step 1: Criar o arquivo com head, CSS e estrutura HTML**

Criar `FormConferencia.html`:
```html
<meta charset="utf-8">
<title>Conferência de Separação</title>
<style>
  body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 16px; background: var(--bg, #F4F6FB); color: var(--text-body, #1E293B); }
  .cf-header { background: var(--surface, #fff); border: 1.5px solid var(--border, #E3E8F2); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .cf-header h2 { margin: 0 0 4px; font-size: 15px; color: var(--navy, #2563EB); }
  .cf-header .sub { font-size: 12px; color: var(--text-faint, #94A3B8); display: flex; gap: 14px; flex-wrap: wrap; }
  .cf-scan { display: flex; gap: 8px; margin-bottom: 12px; }
  .cf-scan input { flex: 1; font-size: 16px; padding: 12px 14px; border-radius: 8px; border: 1.5px solid var(--border-def, #C9D4E5); }
  .cf-scan input:focus { outline: none; border-color: var(--navy, #2563EB); }
  .cf-lista { background: var(--surface, #fff); border: 1.5px solid var(--border, #E3E8F2); border-radius: 10px; min-height: 120px; margin-bottom: 12px; }
  .item-row { display: flex; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border, #E3E8F2); font-size: 13px; }
  .item-row:last-child { border-bottom: none; }
  .item-nome { color: var(--text-body, #1E293B); }
  .item-qtd { font-weight: 700; color: var(--navy, #2563EB); }
  .empty { padding: 30px; text-align: center; color: var(--text-faint, #94A3B8); font-size: 13px; }
  .cf-rodape { display: flex; justify-content: space-between; align-items: center; background: var(--surface, #fff); border: 1.5px solid var(--border, #E3E8F2); border-radius: 10px; padding: 14px 16px; }
  .cf-rodape .totais { font-size: 13px; }
  .dif { font-weight: 700; font-size: 13px; padding: 4px 10px; border-radius: 6px; }
  .dif.ok { background: var(--green-bg, #ECFDF5); color: var(--green, #059669); }
  .dif.falta { background: var(--red-bg, #FEF2F2); color: var(--red, #DC2626); }
  .dif.sobra { background: var(--red-bg, #FEF2F2); color: var(--red, #DC2626); }
  .cf-acoes { display: flex; gap: 8px; }
  .btn { font-size: 12px; padding: 9px 14px; border-radius: 7px; border: none; cursor: pointer; font-weight: 600; }
  .btn-undo { background: var(--slate-100, #F1F5F9); color: var(--text-body, #1E293B); }
  .btn-concluir { background: var(--green, #059669); color: #fff; }
  .btn-concluir:disabled { opacity: .5; cursor: not-allowed; }
  .modal-bg { display: none; position: fixed; inset: 0; background: rgba(15,23,42,.45); align-items: center; justify-content: center; z-index: 50; }
  .modal-box { background: var(--surface, #fff); border-radius: 10px; padding: 20px; width: 320px; }
  .modal-box h3 { margin: 0 0 10px; font-size: 14px; }
  .modal-box .cod { font-family: monospace; font-size: 13px; color: var(--text-faint, #94A3B8); margin-bottom: 10px; }
  .modal-box input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 7px; border: 1.5px solid var(--border-def, #C9D4E5); font-size: 13px; margin-bottom: 12px; }
  .modal-box .mb-acoes { display: flex; gap: 8px; justify-content: flex-end; }
</style>

<div class="cf-header">
  <h2>📦 Conferência de Separação</h2>
  <div class="sub">
    <span id="lote-forn">—</span>
    <span id="lote-transp">—</span>
    <span id="lote-nfs">—</span>
  </div>
</div>

<div class="cf-scan">
  <input type="text" id="scan-input" placeholder="Bipe o código de barras/QR..." autocomplete="off" disabled>
</div>

<div class="cf-lista" id="lista">
  <div class="empty">Carregando lote...</div>
</div>

<div class="cf-rodape">
  <div class="totais">
    Bipado: <strong id="total-bipado">0</strong> / Esperado: <strong id="total-esperado">0</strong>
    <span class="dif" id="total-dif" style="margin-left:10px">—</span>
  </div>
  <div class="cf-acoes">
    <button class="btn btn-undo" onclick="desfazerUltima()">↩️ Desfazer última</button>
    <button class="btn btn-concluir" id="btn-concluir" onclick="concluir()" disabled>✅ Concluir Conferência</button>
  </div>
</div>

<div class="modal-bg" id="modal-cadastro">
  <div class="modal-box">
    <h3>🆕 Produto não cadastrado</h3>
    <div class="cod">Código: <span id="cad-codigo"></span></div>
    <input type="text" id="cad-nome" placeholder="Nome do produto (ex: Fritadeira 11L 127V)">
    <div class="mb-acoes">
      <button class="btn btn-undo" onclick="fecharCadastro()">Cancelar</button>
      <button class="btn btn-concluir" onclick="confirmarCadastro()">Cadastrar e bipar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Adicionar o JS de estado e renderização**

Adicionar ao final de `FormConferencia.html`:
```html
<script>
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toast(msg, tipo) { showToast(msg, tipo || 'ok'); }

var _loteId = null;
var _totais = [];
var _totalBipado = 0;
var _totalEsperado = 0;
var _codigoPendente = null;

function renderLista() {
  var el = document.getElementById('lista');
  if (!_totais.length) { el.innerHTML = '<div class="empty">Nenhum item bipado ainda.</div>'; return; }
  var html = '';
  for (var i = 0; i < _totais.length; i++) {
    html += '<div class="item-row"><span class="item-nome">' + esc(_totais[i].produto) + '</span>'
          + '<span class="item-qtd">' + _totais[i].qtd + '</span></div>';
  }
  el.innerHTML = html;
}

function renderRodape() {
  document.getElementById('total-bipado').textContent = _totalBipado;
  document.getElementById('total-esperado').textContent = _totalEsperado;
  var dif = _totalBipado - _totalEsperado;
  var difEl = document.getElementById('total-dif');
  var btnConcluir = document.getElementById('btn-concluir');
  if (dif === 0) {
    difEl.textContent = 'Completo ✓'; difEl.className = 'dif ok'; btnConcluir.disabled = false;
  } else if (dif > 0) {
    difEl.textContent = 'Sobra: ' + dif; difEl.className = 'dif sobra'; btnConcluir.disabled = true;
  } else {
    difEl.textContent = 'Falta: ' + Math.abs(dif); difEl.className = 'dif falta'; btnConcluir.disabled = true;
  }
}
</script>
```

- [ ] **Step 3: Adicionar o JS de carregamento do lote**

Adicionar dentro do mesmo `<script>` do Step 2, após `renderRodape`:
```javascript
function carregarLote() {
  if (!_loteId) return;
  callServer('obterNFsDoLote', [{ loteId: _loteId }], function(resp) {
    var d = JSON.parse(resp);
    if (d.erro) { toast(d.erro, 'err'); return; }
    _totalEsperado = d.totalEsperado;
    document.getElementById('lote-forn').textContent = '🏭 ' + (d.forn || '—');
    document.getElementById('lote-transp').textContent = '🚚 ' + (d.transportadora || '—');
    document.getElementById('lote-nfs').textContent = '📄 ' + d.nfs.length + ' NF(s)';
    carregarBipagens();
  }, function(e) { toast('Erro: ' + e.message, 'err'); });
}

function carregarBipagens() {
  callServer('obterBipagensDoLote', [{ loteId: _loteId }], function(resp) {
    var d = JSON.parse(resp);
    if (d.erro) { toast(d.erro, 'err'); return; }
    _totais = d.totais;
    _totalBipado = d.totalBipado;
    renderLista();
    renderRodape();
    var inp = document.getElementById('scan-input');
    inp.disabled = false;
    inp.focus();
  }, function(e) { toast('Erro: ' + e.message, 'err'); });
}
```

- [ ] **Step 4: Adicionar o JS de bipagem, cadastro, desfazer e concluir**

Adicionar dentro do mesmo `<script>`, após `carregarBipagens`:
```javascript
function bipar(codigo) {
  callServer('bipar', [{ loteId: _loteId, codigo: codigo }], function(resp) {
    var d = JSON.parse(resp);
    var inp = document.getElementById('scan-input');
    if (d.erro) { toast(d.erro, 'err'); inp.focus(); return; }
    if (d.precisaCadastro) { abrirCadastro(d.codigo); return; }
    _totais = d.totais.totais;
    _totalBipado = d.totais.totalBipado;
    var qtdAtual = 0;
    for (var i = 0; i < _totais.length; i++) {
      if (_totais[i].produto === d.produto) { qtdAtual = _totais[i].qtd; break; }
    }
    toast('✓ ' + d.produto + ' — ' + qtdAtual + ' bipado(s)', 'ok');
    renderLista();
    renderRodape();
    inp.focus();
  }, function(e) { toast('Erro: ' + e.message, 'err'); document.getElementById('scan-input').focus(); });
}

function abrirCadastro(codigo) {
  _codigoPendente = codigo;
  document.getElementById('cad-codigo').textContent = codigo;
  document.getElementById('cad-nome').value = '';
  document.getElementById('modal-cadastro').style.display = 'flex';
  setTimeout(function() { document.getElementById('cad-nome').focus(); }, 50);
}

function fecharCadastro() {
  document.getElementById('modal-cadastro').style.display = 'none';
  _codigoPendente = null;
  document.getElementById('scan-input').focus();
}

function confirmarCadastro() {
  var nome = document.getElementById('cad-nome').value.trim();
  if (!nome) { toast('Informe o nome do produto.', 'warn'); return; }
  var codigo = _codigoPendente;
  callServer('cadastrarProdutoEBipar', [{ loteId: _loteId, codigo: codigo, nome: nome }], function(resp) {
    var d = JSON.parse(resp);
    fecharCadastro();
    if (d.erro) { toast(d.erro, 'err'); return; }
    _totais = d.totais.totais;
    _totalBipado = d.totais.totalBipado;
    toast('✓ ' + d.produto + ' cadastrado e bipado', 'ok');
    renderLista();
    renderRodape();
  }, function(e) { toast('Erro: ' + e.message, 'err'); });
}

function desfazerUltima() {
  callServer('desfazerUltimaBipagem', [{ loteId: _loteId }], function(resp) {
    var d = JSON.parse(resp);
    if (d.erro) { toast(d.erro, 'err'); return; }
    _totais = d.totais.totais;
    _totalBipado = d.totais.totalBipado;
    toast('↩️ Última bipagem desfeita', 'info');
    renderLista();
    renderRodape();
    document.getElementById('scan-input').focus();
  }, function(e) { toast('Erro: ' + e.message, 'err'); });
}

function concluir() {
  callServer('concluirConferencia', [{ loteId: _loteId }], function(resp) {
    var d = JSON.parse(resp);
    if (d.erro) { toast(d.erro, 'err'); return; }
    toast('✅ Conferência concluída', 'ok');
    document.getElementById('btn-concluir').disabled = true;
  }, function(e) { toast('Erro: ' + e.message, 'err'); });
}
```

- [ ] **Step 5: Adicionar listeners de teclado e de mensagem (recebe o loteId)**

Adicionar dentro do mesmo `<script>`, ao final:
```javascript
document.getElementById('scan-input').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  var codigo = this.value.trim();
  this.value = '';
  if (!codigo) return;
  bipar(codigo);
});

document.getElementById('cad-nome').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); confirmarCadastro(); }
  if (e.key === 'Escape') { e.preventDefault(); fecharCadastro(); }
});

window.addEventListener('message', function(e) {
  if (!e.data || !e.data.cdvAutoLote) return;
  _loteId = String(e.data.cdvAutoLote);
  carregarLote();
});
</script>
```

- [ ] **Step 6: Verificar manualmente**

Abrir `FormConferencia.html` e confirmar:
1. Não há `<!DOCTYPE>`/`<html>`/`<head>`/`<body>` explícitos — página é injetada como fragmento, igual às demais `Form*.html` do projeto (confirmar comparando com `FormTransferencias.html`)
2. `<input id="scan-input">` começa `disabled` (só habilita depois que `carregarBipagens` popula os dados)
3. Todas as chamadas ao backend usam `callServer(fn, args, ok, er)` — não `google.script.run` direto (padrão de compatibilidade com o polyfill do iframe)
4. `toast()` é um wrapper de uma linha para `showToast()`, igual a `FormTransferencias.html:698`
5. O listener de `message` verifica `e.data.cdvAutoLote` antes de qualquer outra coisa

- [ ] **Step 7: Commit**

```
git add FormConferencia.html
git commit -m "feat(conferencia): nova página de bipagem de separação"
```

---

### Task 3: Index.html — propagação de parâmetro (`loteId`) na navegação SPA

**Files:**
- Modify: `Index.html`

**Interfaces:**
- Consumes: `cdvNav(p)`, `loadPage(p)`, `_pageCache`, `_POLYFILL` — já existentes
- Produces: `window.cdvConferir(loteId)` (global, chamável de dentro do iframe de `FormTransferencias.html`); polyfill injetado ganha `window.cdvLoad(p, params)` com 2º argumento opcional; página carregada recebe `postMessage({cdvAutoLote: loteId})` após `onload`, no mesmo padrão de `_cdvBuscaAutoSearch`

---

- [ ] **Step 1: Estender o polyfill `cdvLoad` para aceitar parâmetros**

Localizar em `Index.html` (dentro de `_POLYFILL`, linha ~965):
```javascript
+ 'window.cdvLoad=function(p){window.parent.postMessage({cdvNavPage:p},"*");};'
```

Substituir por:
```javascript
+ 'window.cdvLoad=function(p,params){window.parent.postMessage({cdvNavPage:p,cdvNavParams:params||null},"*");};'
```

- [ ] **Step 2: Adicionar `cdvConferir` ao lado de `cdvBuscar`**

Localizar (linha ~1022):
```javascript
window.cdvBuscar = function(termo) {
  window._pendingBuscaTermo = termo;
  window.cdvNav('Busca');
};
```

Substituir por:
```javascript
window.cdvBuscar = function(termo) {
  window._pendingBuscaTermo = termo;
  window.cdvNav('Busca');
};

window.cdvConferir = function(loteId) {
  window._pendingLoteId = loteId;
  window.cdvNav('Conferencia');
};
```

- [ ] **Step 3: Capturar `cdvNavParams` no listener de mensagem e guardar o `loteId`**

Localizar (linha ~1387):
```javascript
if (e.data.cdvNavPage) { window.cdvNav(e.data.cdvNavPage); return; }
```

Substituir por:
```javascript
if (e.data.cdvNavPage) {
  if (e.data.cdvNavParams && e.data.cdvNavParams.loteId) {
    window._pendingLoteId = e.data.cdvNavParams.loteId;
  }
  window.cdvNav(e.data.cdvNavPage);
  return;
}
```

- [ ] **Step 4: Inicializar `_pendingLoteId` junto de `_pendingBuscaTermo`**

Localizar (linha ~1397):
```javascript
window._pendingBuscaTermo = null;
```

Substituir por:
```javascript
window._pendingBuscaTermo = null;
window._pendingLoteId = null;
```

- [ ] **Step 5: Criar `_cdvConferenciaAutoLoad` ao lado de `_cdvBuscaAutoSearch`**

Localizar (linha ~1110):
```javascript
function _cdvBuscaAutoSearch(frm, p) {
  if (!window._pendingBuscaTermo || p !== 'Busca') return;
  var t = window._pendingBuscaTermo;
  window._pendingBuscaTermo = null;
  setTimeout(function() {
    try { frm.contentWindow.postMessage({ cdvAutoSearch: t }, '*'); } catch(_) {}
  }, 120);
}
```

Adicionar logo após:
```javascript
function _cdvConferenciaAutoLoad(frm, p) {
  if (!window._pendingLoteId || p !== 'Conferencia') return;
  var loteId = window._pendingLoteId;
  window._pendingLoteId = null;
  setTimeout(function() {
    try { frm.contentWindow.postMessage({ cdvAutoLote: loteId }, '*'); } catch(_) {}
  }, 120);
}
```

- [ ] **Step 6: Chamar `_cdvConferenciaAutoLoad` nos dois pontos de `onload` do iframe**

Localizar (linha ~1065, dentro de `loadPage`, ramo de cache):
```javascript
frm.onload = function () { show('pgf'); _cdvBuscaAutoSearch(frm, p); };
```

Substituir por:
```javascript
frm.onload = function () { show('pgf'); _cdvBuscaAutoSearch(frm, p); _cdvConferenciaAutoLoad(frm, p); };
```

Localizar (linha ~1079, dentro de `loadPage`, ramo de fetch novo):
```javascript
frm.onload = function () { show('pgf'); _cdvBuscaAutoSearch(frm, p); };
```

Substituir por (mesmo texto, segunda ocorrência):
```javascript
frm.onload = function () { show('pgf'); _cdvBuscaAutoSearch(frm, p); _cdvConferenciaAutoLoad(frm, p); };
```

**Nota:** as duas ocorrências têm o mesmo texto original — usar contexto ao redor (linha ~1065 vs ~1079, dentro dos dois branches de `loadPage`) para diferenciar ao editar.

- [ ] **Step 7: Verificar manualmente**

Abrir `Index.html` e confirmar:
1. `_POLYFILL`: `cdvLoad` aceita `(p,params)` e inclui `cdvNavParams:params||null` no `postMessage`
2. `cdvConferir(loteId)` está definido ao lado de `cdvBuscar`
3. Listener de `message`: bloco `cdvNavPage` lê `e.data.cdvNavParams.loteId` antes de chamar `cdvNav`
4. `window._pendingLoteId = null;` inicializado junto de `_pendingBuscaTermo`
5. `_cdvConferenciaAutoLoad` existe e é chamado nos DOIS `frm.onload` dentro de `loadPage` (cache e fetch novo)

- [ ] **Step 8: Commit**

```
git add Index.html
git commit -m "feat(index): propagar loteId na navegação SPA para FormConferencia"
```

---

### Task 4: FormTransferencias.html — botão "Conferir Separação" em lotes

**Files:**
- Modify: `FormTransferencias.html`

**Interfaces:**
- Consumes: `it.isLote`, `it.loteId` (já existentes em `_filt[i]`); `cdvConferir(loteId)` (Task 3, injetado no iframe via polyfill herdado do parent)

---

- [ ] **Step 1: Adicionar o botão de conferência às ações da linha**

Localizar em `renderTabela()` (linha ~347):
```javascript
var acoes = (ativo && !_modoRO)
  ? '<div style="display:flex;gap:5px;flex-wrap:wrap">'
    + '<button class="acao-mini verde" onclick="abrirBaixa(' + i + ')">✓ Baixa</button>'
    + '<button class="acao-mini azul" onclick="abrirReagendar(' + i + ')" title="Reagendar">📅</button>'
    + '<button class="acao-mini verm" onclick="abrirCancelar(' + i + ')" title="Cancelar">✕</button>'
    + '</div>'
  : '<span style="font-size:10px;color:var(--text-faint)">' + esc(it.dataBaixa||it.obsCancel||'') + '</span>';
```

Substituir por:
```javascript
var acoes = (ativo && !_modoRO)
  ? '<div style="display:flex;gap:5px;flex-wrap:wrap">'
    + (it.isLote ? '<button class="acao-mini azul" onclick="conferirLote(' + i + ')" title="Conferir Separação">📦</button>' : '')
    + '<button class="acao-mini verde" onclick="abrirBaixa(' + i + ')">✓ Baixa</button>'
    + '<button class="acao-mini azul" onclick="abrirReagendar(' + i + ')" title="Reagendar">📅</button>'
    + '<button class="acao-mini verm" onclick="abrirCancelar(' + i + ')" title="Cancelar">✕</button>'
    + '</div>'
  : '<span style="font-size:10px;color:var(--text-faint)">' + esc(it.dataBaixa||it.obsCancel||'') + '</span>';
```

- [ ] **Step 2: Criar a função `conferirLote(i)`**

Localizar `abrirBaixa(i)` (linha ~485):
```javascript
function abrirBaixa(i) {
  _idxAcao = i;
  _linhaBaixa = _filt[i].linha;
```

Adicionar imediatamente ANTES dessa função:
```javascript
function conferirLote(i) {
  var loteId = _filt[i].loteId;
  if (!loteId) { toast('Lote sem identificador — não é possível conferir.', 'err'); return; }
  if (typeof cdvConferir === 'function') { cdvConferir(loteId); return; }
  toast('Navegação indisponível fora do menu principal.', 'err');
}

function abrirBaixa(i) {
  _idxAcao = i;
  _linhaBaixa = _filt[i].linha;
```

- [ ] **Step 3: Verificar manualmente**

Abrir `FormTransferencias.html` e confirmar:
1. O botão `📦` só é injetado quando `it.isLote` é truthy — NF única (sem lote) não mostra o botão
2. `conferirLote(i)` lê `_filt[i].loteId` e chama `cdvConferir(loteId)` (função global injetada pelo polyfill do iframe pai — ver Task 3)
3. Fallback de `toast('Navegação indisponível...')` cobre o caso da página ser aberta fora do shell SPA (`cdvConferir` indefinido)

- [ ] **Step 4: Commit**

```
git add FormTransferencias.html
git commit -m "feat(transferencias): botão Conferir Separação para lotes multi-NF"
```

---

### Task 5: Código.gs — bump da chave de cache de páginas

**Files:**
- Modify: `Código.gs`

**Interfaces:**
- Consumes: nenhuma
- Produces: cache de HTML de todas as páginas invalidado (necessário porque `Index.html` e `FormTransferencias.html` mudaram nas Tasks 3 e 4, e `FormConferencia.html` é nova — sem bump, o Web App pode continuar servindo a versão antiga em cache por até 600s)

---

- [ ] **Step 1: Bump `pg_html_v12m_` → `pg_html_v12n_`**

Localizar (linha ~8110):
```javascript
var pgKey   = 'pg_html_v12m_' + pagina;
```

Substituir por:
```javascript
var pgKey   = 'pg_html_v12n_' + pagina;
```

Localizar (linha ~8125):
```javascript
var keys = Object.keys(_WEBAPP_PAGINAS).map(function(p){ return 'pg_html_v12m_' + _WEBAPP_PAGINAS[p]; });
```

Substituir por:
```javascript
var keys = Object.keys(_WEBAPP_PAGINAS).map(function(p){ return 'pg_html_v12n_' + _WEBAPP_PAGINAS[p]; });
```

- [ ] **Step 2: Verificar manualmente**

Abrir `Código.gs` e confirmar que as DUAS ocorrências de `pg_html_v12m_` viraram `pg_html_v12n_` (uma em `_getPageContent`, outra na função que lista as chaves para limpeza de cache).

- [ ] **Step 3: Commit**

```
git add "Código.gs"
git commit -m "chore(cache): bump chave de páginas v12m -> v12n"
```

---

## Self-Review

**Spec coverage:**
- ✅ Abas `_Produtos`/`_Bipagens` → Task 1 Steps 3-4
- ✅ Cadastro on-the-fly de produto → Task 1 Steps 6-7, Task 2 Steps 4-5 (modal)
- ✅ Log individual de bipagem (`_Bipagens`, com `Desfeito`) → Task 1 Steps 4, 6, 8
- ✅ Bipagem agregada por lote (não por NF) → Task 1 Step 6 (`bipar` recebe `loteId`, não `nf`)
- ✅ Botão "Conferir Separação" só em lotes multi-NF → Task 4 Step 1 (`it.isLote`)
- ✅ Total esperado = soma de `Qtd` das NFs do lote → Task 1 Step 9 (`obterNFsDoLote`)
- ✅ Tela ao vivo por produto + rodapé com diferença → Task 2 Steps 2-3
- ✅ Desfazer última bipagem (soft delete) → Task 1 Step 8, Task 2 Step 4
- ✅ Concluir conferência quando bate → Task 1 Step 11, Task 2 Step 4
- ✅ Input sempre focado, aceita leitor físico (Enter) → Task 2 Step 5
- ✅ Câmera (fase 2) → fora do escopo deste plano, conforme spec
- ✅ Permissão igual à de quem já opera Transferências → nenhum gate novo adicionado (implícito — sem mudança de `_getPageContent`'s bloco de restrição, que só existe para `FormConfiguracoes`)
- ✅ Cache de páginas invalidado → Task 5

**Placeholder scan:** nenhum TBD/TODO. Todo step de código tem o código completo (não há "similar to Task N" nem descrições sem implementação).

**Type consistency:**
- `loteId`: string, mesmo nome em `bipar`/`cadastrarProdutoEBipar`/`desfazerUltimaBipagem`/`obterNFsDoLote`/`obterBipagensDoLote`/`concluirConferencia` (Task 1) → `_filt[i].loteId` (Task 4) → `cdvConferir(loteId)` → `window._pendingLoteId` → `postMessage({cdvAutoLote: loteId})` (Task 3) → `_loteId` no frontend (Task 2). Consistente em toda a cadeia.
- `{ totais: [...], totalBipado: N }`: retornado por `_agregarBipagensPorProduto` (Task 1 Step 5), usado como `d.totais` em `bipar`/`cadastrarProdutoEBipar`/`desfazerUltimaBipagem` (aninhado — `d.totais.totais`/`d.totais.totalBipado`) e diretamente em `obterBipagensDoLote` (Task 1 Step 10, `d.totais`/`d.totalBipado` sem aninhamento). O frontend (Task 2) trata os dois casos corretamente: `carregarBipagens` usa `d.totais`/`d.totalBipado` direto; `bipar`/`confirmarCadastro`/`desfazerUltima` usam `d.totais.totais`/`d.totais.totalBipado`.
- `precisaCadastro`/`codigo`: produzido por `bipar` (Task 1 Step 6) quando produto não existe → consumido por `bipar()` do frontend (Task 2 Step 4) que chama `abrirCadastro(d.codigo)`. Consistente.
- `TRANSF_TOTAL_COL = 31`: usado em `obterNFsDoLote` e `concluirConferencia` (Task 1) para ler a faixa completa da linha — consistente com a extensão de schema do Step 2.
