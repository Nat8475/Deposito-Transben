# Design: Programar Devolução em Lote (Grupo E)

**Data:** 2026-06-27
**Status:** Aprovado
**Escopo:** FormNotas.html + Código.gs + FormTransferencias.html

---

## Contexto

O FormNotas já possui bulk bar com botão "🚚 Prog. Frete" que abre `abrirFreteModal()`. Quando o usuário confirma (`confirmarFrete()`), o backend `executarAcaoEmLoteNotas({acao:'frete', itens:[...], freteParams:{...}})` chama `salvarProgramacaoDevolucao()` individualmente para cada NF — criando **uma linha por NF** na aba Transferencias.

O objetivo é consolidar visualmente em **UM item por fornecedor** no FormTransferencias, usando um **Lote ID** (UUID) compartilhado entre as linhas do mesmo lote. Cada NF ainda gera sua própria linha em Transferencias (preservando integridade de dados e baixa individual), mas o Lote ID na nova col 30 permite agrupar na UI.

---

## O que NÃO muda

- `abrirFreteModal()` — UI de params de frete inalterada
- `salvarProgramacaoDevolucao()` — lógica principal (limpa linha origem, cria row em Transferencias) — apenas recebe param adicional opcional `loteId`
- FormProgramarFrete.html — wizard single-NF inalterado
- Schema cols 1-29 da aba Transferencias — inalterado
- Cancelamento e reagendamento de transferências

---

## Arquitetura

Duas fases independentes:

1. **Programação** — FormNotas.html valida fornecedor único; `executarAcaoEmLoteNotas` gera UUID e passa `loteId` a cada chamada de `salvarProgramacaoDevolucao`; col 30 armazena o UUID.

2. **Visualização/Baixa** — `obterTransferencias()` retorna campo `loteId` por item; FormTransferencias agrupa itens com mesmo `loteId` antes de renderizar; baixa envia `linha` do primeiro item do grupo; `darBaixaTransferencia` detecta `loteId` e dá baixa em todas as linhas irmãs automaticamente.

---

## FormNotas.html

### 1. Validação em `confirmarFrete()` (linha ~1436)

Localizar após (linha ~1436):
```javascript
var fornNomes = Object.keys(fornMap);
var mesmoForn = fornNomes.length === 1;
```

Adicionar imediatamente após:
```javascript
if (!mesmoForn) {
  toast('⚠️ Selecione NFs de apenas um fornecedor para programar em lote.', 'warn');
  return;
}
```

**Nota:** `fecharModal('modal-frete')` é chamado na linha 1430, ANTES de `fornMap` ser construído — portanto o modal de frete já está fechado quando essa validação roda. Não chamar `fecharModal` novamente.

Nenhuma outra mudança em FormNotas.html.

---

## Código.gs

### 1. Novas constantes (após `TRANSF_COL_OBS = 29`)

```javascript
const TRANSF_COL_LOTE_ID  = 30;
```

Atualizar:
```javascript
const TRANSF_TOTAL_COL = 30;  // era 29
```

Localizar o comentário de schema na linha ~2010:
```
\ Schema: cols 1-20 = dados originais da nota | cols 21-29 = controle de transferência
```
Atualizar para:
```
// Schema: cols 1-20 = dados originais da nota | cols 21-30 = controle de transferência
```

### 2. `_garantirAbaTransferencias(ss)` — cabeçalho col 30

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

**Atualizar a verificação de schema** para incluir col 30. Localizar (linha ~2026-2028):
```javascript
var cabVal = String(ws.getRange(1, TRANSF_COL_ABA_ORIGEM).getValue()).trim();
if (cabVal === 'Aba Origem') return ws;
```

Substituir por:
```javascript
var cabVal   = String(ws.getRange(1, TRANSF_COL_ABA_ORIGEM).getValue()).trim();
var cabLote  = String(ws.getRange(1, TRANSF_COL_LOTE_ID).getValue()).trim();
if (cabVal === 'Aba Origem' && cabLote === 'Lote ID') return ws;
if (cabVal === 'Aba Origem' && cabLote !== 'Lote ID') {
  // migração: adiciona só o cabeçalho e a largura da nova col
  ws.getRange(1, TRANSF_COL_LOTE_ID).setValue('Lote ID')
    .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
  ws.setColumnWidth(TRANSF_COL_LOTE_ID, 280);
  return ws;
}
```

Isso garante que planilhas existentes recebam a nova coluna sem rebuild completo.

### 3. `salvarProgramacaoDevolucao(params)` — aceitar `loteId` opcional

Localizar a construção de `rowTransf` (linha ~2111):
```javascript
var rowTransf = rowData.concat([
  params.aba,          // col 21
  transportadora,      // col 22
  dataAgend || '',     // col 23
  'Em Transferência',  // col 24
  usuario,             // col 25
  agora,               // col 26
  '',                  // col 27
  '',                  // col 28
  String(params.obs || '')  // col 29
]);
```

Substituir por:
```javascript
var rowTransf = rowData.concat([
  params.aba,                       // col 21
  transportadora,                   // col 22
  dataAgend || '',                  // col 23
  'Em Transferência',               // col 24
  usuario,                          // col 25
  agora,                            // col 26
  '',                               // col 27
  '',                               // col 28
  String(params.obs || ''),         // col 29
  String(params.loteId || '')       // col 30: Lote ID
]);
```

### 4. `executarAcaoEmLoteNotas()` — gerar UUID e passar `loteId`

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

**Nota:** `forEach` substituído por `for` loop — GAS não garante suporte a `Array.prototype.forEach` em todos os contextos de execução.

### 5. `obterTransferencias()` — retornar `loteId` por item

Localizar o objeto retornado no `.map()` (linha ~2396). Adicionar campo `loteId` ao objeto:

```javascript
loteId: String(l[TRANSF_COL_LOTE_ID - 1] || '').trim(),
```

Isso requer que `TRANSF_TOTAL_COL` seja 30 (já atualizado) para que `wsTr.getRange(..., TRANSF_TOTAL_COL)` leia col 30.

### 6. `darBaixaTransferencia(params)` — processar linhas irmãs do lote

Localizar o final da função, após marcar a linha principal como 'Concluída' (após linha `wsTr.getRange(linhaTransf, TRANSF_COL_STATUS).setValue('Concluída')`):

Adicionar bloco para processar irmãs do lote:
```javascript
// Dar baixa a todas as linhas irmãs do mesmo lote
var loteId = String(rowData[TRANSF_COL_LOTE_ID - 1] || '').trim();
if (loteId) {
  var ulTr = wsTr.getLastRow();
  if (ulTr >= 2) {
    var todosDados = wsTr.getRange(2, 1, ulTr - 1, TRANSF_TOTAL_COL).getValues();
    for (var ti = 0; ti < todosDados.length; ti++) {
      var lRow = todosDados[ti];
      var linha2 = ti + 2;
      if (linha2 === linhaTransf) continue;
      var loteId2 = String(lRow[TRANSF_COL_LOTE_ID - 1] || '').trim();
      var st2     = String(lRow[TRANSF_COL_STATUS - 1]   || '').trim();
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

      var ulOrig2  = obterUltimaLinhaDados(wsOrig2);
      var dest2    = (ulOrig2 >= LINHA_DADOS ? ulOrig2 : LINHA_DADOS - 1) + 1;
      if (dest2 > ULTIMA_LINHA_DADOS) continue; // aba cheia — pular sem erro fatal

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

**Dependências de escopo:** `ss`, `agora`, `obsDevol`, `urlComprovante`, `params` — todas já definidas no escopo da função acima deste bloco.

---

## FormTransferencias.html

### 1. Agrupamento em `filtrar()` — após o `.filter()` atual

Localizar o final de `filtrar()` (linha ~288), onde `_filt` é atribuído:
```javascript
_filt = _itens.filter(function(it) { ... });
```

Após esta linha (antes de `_sel = new Array(_filt.length).fill(false)`), inserir o agrupamento:

```javascript
// Agrupar itens com mesmo loteId em um único item de exibição
var filtAgrup = [];
var loteMap   = {};
for (var gi = 0; gi < _filt.length; gi++) {
  var gItem = _filt[gi];
  if (!gItem.loteId) { filtAgrup.push(gItem); continue; }
  if (loteMap[gItem.loteId]) {
    var grp = loteMap[gItem.loteId];
    grp.nfd    += ', ' + gItem.nfd;
    grp.nf     += ', ' + gItem.nf;
    grp.vlTot  += gItem.vlTot;
    grp.qtd    += gItem.qtd;
    grp._loteLinhas.push(gItem.linha);
  } else {
    var novoGrp = {};
    for (var gk in gItem) { if (gItem.hasOwnProperty(gk)) novoGrp[gk] = gItem[gk]; }
    novoGrp._loteLinhas = [gItem.linha];
    novoGrp.isLote = true;
    filtAgrup.push(novoGrp);
    loteMap[gItem.loteId] = novoGrp;
  }
}
_filt = filtAgrup;
```

### 2. `renderTabela()` — badge LOTE na célula de NFD

Localizar (linha ~336):
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

Para itens de lote, `it.nf` já contém as NFs concatenadas (e.g. `"1234, 5678"`) e `it.nfd` os NFDs — resultado do agrupamento em `filtrar()`.

### 3. `abrirBaixa(i)` — título para lote

Localizar (linha ~466):
```javascript
document.getElementById('mBaixaTitulo').textContent = '✅ Confirmar Baixa — NF ' + _filt[i].nf;
```

Substituir por:
```javascript
document.getElementById('mBaixaTitulo').textContent = _filt[i].isLote
  ? '✅ Confirmar Baixa em Lote — ' + _filt[i].forn
  : '✅ Confirmar Baixa — NF ' + _filt[i].nf;
```

Localizar (linha ~467):
```javascript
document.getElementById('mBaixaDesc').textContent = 'Fornecedor: ' + _filt[i].forn ...
```

Substituir por:
```javascript
document.getElementById('mBaixaDesc').textContent = _filt[i].isLote
  ? 'Lote: ' + _filt[i].nfd + ' (' + _filt[i]._loteLinhas.length + ' NF(s))'
  : 'Fornecedor: ' + _filt[i].forn + ((_filt[i].numeroPedido) ? ' · Pedido: ' + _filt[i].numeroPedido : '');
```

`_linhaBaixa` permanece `_filt[i].linha` (linha do primeiro item do grupo) — inalterado.

---

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `FormNotas.html` | Validação de fornecedor único em `confirmarFrete()` |
| `Código.gs` | `TRANSF_TOTAL_COL=30`, `TRANSF_COL_LOTE_ID=30`, `_garantirAbaTransferencias` header, `salvarProgramacaoDevolucao` col 30, `executarAcaoEmLoteNotas` UUID + for loop, `obterTransferencias` campo loteId, `darBaixaTransferencia` lote siblings |
| `FormTransferencias.html` | Agrupamento em `filtrar()`, badge LOTE em `renderTabela()`, título em `abrirBaixa()` |

---

## Fora do Escopo

- FormProgramarFrete.html (single-NF, sem mudanças)
- Cancelamento de lote (cancelar individualmente cada linha — comportamento atual inalterado)
- Reagendamento de lote (reagendar cada linha individualmente — inalterado)
- Export PDF / e-mail para lote
- Seleção de fornecedores distintos (bloqueado com toast de aviso)
