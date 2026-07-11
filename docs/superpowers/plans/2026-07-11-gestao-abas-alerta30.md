# Gestão de Abas + Toggle Alerta +30 Dias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela de Configurações lista todas as abas de notas (fixas + extras), permite criar/excluir aba extra e ligar/desligar por aba o e-mail de alerta de atraso crítico (+30 dias).

**Architecture:** Toggle armazenado como lista de abas DESLIGADAS em ScriptProperties (`cdv_alerta30_off`); ausência = ligado. Backend em Código.gs (4 funções novas + 2 ajustes); frontend na tela `screen-fornecedor` do FormConfiguracoes.html usando componentes v12 do Styles.html injetado.

**Tech Stack:** Google Apps Script (ES5), HtmlService, `google.script.run`, PropertiesService. Sem framework de testes — verificação por `node --check` (sintaxe) + teste manual pós-deploy.

**Spec:** `docs/superpowers/specs/2026-07-11-gestao-abas-alerta30-design.md`

## Global Constraints

- Escopo do toggle: SÓ o e-mail (`verificarAtrasosEEnviarAlerta`). Não tocar em `COR_ALERTA_30DIAS` (Código.gs:1122/1141) nem na flag `alerta` do dashboard (Código.gs:2540).
- Código backend em ES5 (var, function) — padrão do arquivo.
- CSS novo: NENHUM. Usar classes existentes do Styles.html (`.rd-switch`, `.track`) e estilos inline pontuais. Nova variável CSS iria só em Styles.html (regra do projeto) — não é necessária aqui.
- Mensagens no FormConfiguracoes: usar `showMsg(prefixo, tipo, txt)` (convenção do form; prefixo da tela fornecedor é `'f'`).
- Funções expostas a `google.script.run` retornam `JSON.stringify({...})` e começam com check `_usuarioEhAdmin()` quando administrativas.
- Nunca `::before`/`::after` em `<tr>` (regra do projeto — não usamos tabela aqui, listas em div).
- Commits frequentes; mensagens em português, prefixo convencional (`feat:`, `fix:`).

---

### Task 1: Backend — helpers de storage + `obterConfigAbas` + `salvarAlerta30Aba`

**Files:**
- Modify: `Código.gs` (inserir helpers após `obterAbasExtras`, ~linha 230; funções públicas antes de `criarNovoFornecedor`, ~linha 7274)

**Interfaces:**
- Consumes: `_getTodasAbas()`, `ABAS_OPERACIONAIS`, `_getAbasExtras()`, `getSS()`, `obterUltimaLinhaDados(ws)`, `LINHA_DADOS`, `_usuarioEhAdmin()`, `registrarLog(ss, user, qtd, val, nf, forn, msg)`, `registrarErroSistema(funcao, msg)`
- Produces:
  - `_getAlerta30Off()` → `Array<string>` nomes de abas com alerta desligado
  - `_setAlerta30Off(arr)` → void, grava a lista
  - `obterConfigAbas()` → JSON string `{ abas: [{nome, fixa, alerta30, usado}] }` ou `{erro}`
  - `salvarAlerta30Aba(params)` com `params = {nome: string, ligado: boolean}` → JSON string `{ok}` ou `{erro}`

- [ ] **Step 1: Adicionar helpers de storage**

Em `Código.gs`, logo após a função `obterAbasExtras()` (termina na linha ~230), inserir:

```javascript
/** Lê a lista de abas com alerta de +30 dias DESLIGADO (ausente = ligado). */
function _getAlerta30Off() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('cdv_alerta30_off') || '[]';
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch(_) { return []; }
}

/** Grava a lista de abas com alerta de +30 dias desligado. */
function _setAlerta30Off(arr) {
  PropertiesService.getScriptProperties().setProperty('cdv_alerta30_off', JSON.stringify(arr || []));
}
```

- [ ] **Step 2: Adicionar funções públicas**

Em `Código.gs`, imediatamente antes de `function criarNovoFornecedor(params)` (~linha 7274), inserir:

```javascript
/** Lista todas as abas operacionais com status do alerta +30d e ocupação (p/ FormConfiguracoes). */
function obterConfigAbas() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  try {
    var ss  = getSS();
    var off = _getAlerta30Off();
    var abas = _getTodasAbas().map(function(nome) {
      var ws = ss.getSheetByName(nome);
      var usado = ws ? Math.max(0, obterUltimaLinhaDados(ws) - LINHA_DADOS + 1) : 0;
      return {
        nome:     nome,
        fixa:     ABAS_OPERACIONAIS.indexOf(nome) !== -1,
        alerta30: off.indexOf(nome) === -1,
        usado:    usado
      };
    });
    return JSON.stringify({ abas: abas });
  } catch (e) {
    registrarErroSistema('obterConfigAbas', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

/** Liga/desliga o alerta de +30 dias de uma aba. params = {nome, ligado}. */
function salvarAlerta30Aba(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  try {
    var nome   = String(params.nome || '').trim();
    var ligado = !!params.ligado;
    if (!nome) return JSON.stringify({ erro: 'Aba não informada.' });
    if (_getTodasAbas().indexOf(nome) === -1)
      return JSON.stringify({ erro: 'Aba "' + nome + '" não é uma aba operacional.' });

    var off = _getAlerta30Off();
    var idx = off.indexOf(nome);
    if (ligado  && idx !== -1) off.splice(idx, 1);
    if (!ligado && idx === -1) off.push(nome);
    _setAlerta30Off(off);

    registrarLog(getSS(), 'SISTEMA', 0, 0, '', nome,
      (ligado ? '🔔' : '🔕') + ' Alerta +30 dias ' + (ligado ? 'ativado' : 'desativado') + ' — aba ' + nome);
    return JSON.stringify({ ok: (ligado ? '🔔 Alerta ativado' : '🔕 Alerta desativado') + ' para "' + nome + '".' });
  } catch (e) {
    registrarErroSistema('salvarAlerta30Aba', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node --check "Código.gs"`
Expected: sem saída (exit 0). Se falhar, o erro aponta a linha.

- [ ] **Step 4: Commit**

```bash
git add "Código.gs"
git commit -m "feat(config): backend p/ toggle de alerta +30d por aba (cdv_alerta30_off)"
```

---

### Task 2: Backend — `excluirAbaExtra` + alerta varre todas as abas respeitando toggle

**Files:**
- Modify: `Código.gs` — `verificarAtrasosEEnviarAlerta` (~linha 4961), `criarNovoFornecedor` (~linha 7291), nova função após `salvarAlerta30Aba` (Task 1)

**Interfaces:**
- Consumes: `_getAlerta30Off()`, `_setAlerta30Off(arr)` (Task 1); `_getAbasExtras()`, `_getTodasAbas()`, `getSS()`, `obterUltimaLinhaDados`, `LINHA_DADOS`, `_usuarioEhAdmin()`, `registrarLog`, `registrarErroSistema`
- Produces: `excluirAbaExtra(params)` com `params = {nome: string, confirmado: boolean}` → JSON string `{ok}` | `{erro}` | `{confirmar: true, usado: number}`

- [ ] **Step 1: Adicionar `excluirAbaExtra`**

Em `Código.gs`, logo após `salvarAlerta30Aba` (inserida na Task 1), adicionar:

```javascript
/** Exclui aba extra (nunca fixa): apaga a sheet e remove dos registros.
 *  params = {nome, confirmado}. Se a aba tem dados e confirmado=false,
 *  retorna {confirmar:true, usado:N} para o frontend pedir confirmação. */
function excluirAbaExtra(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  try {
    var nome = String(params.nome || '').trim();
    if (!nome) return JSON.stringify({ erro: 'Aba não informada.' });

    var extras = _getAbasExtras();
    if (extras.indexOf(nome) === -1)
      return JSON.stringify({ erro: 'Aba "' + nome + '" não é uma aba extra — abas padrão não podem ser excluídas.' });

    var ss = getSS();
    var ws = ss.getSheetByName(nome);
    var usado = ws ? Math.max(0, obterUltimaLinhaDados(ws) - LINHA_DADOS + 1) : 0;
    if (usado > 0 && !params.confirmado)
      return JSON.stringify({ confirmar: true, usado: usado });

    if (ws) ss.deleteSheet(ws);

    extras.splice(extras.indexOf(nome), 1);
    PropertiesService.getScriptProperties().setProperty('cdv_abas_extras', JSON.stringify(extras));

    var off = _getAlerta30Off();
    var idx = off.indexOf(nome);
    if (idx !== -1) { off.splice(idx, 1); _setAlerta30Off(off); }

    registrarLog(ss, 'SISTEMA', 0, 0, '', nome,
      '🗑️ Aba extra excluída: ' + nome + (usado > 0 ? ' (' + usado + ' lançamentos apagados)' : ''));
    return JSON.stringify({ ok: '🗑️ Aba "' + nome + '" excluída.' });
  } catch (e) {
    registrarErroSistema('excluirAbaExtra', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 2: Corrigir varredura do alerta**

Em `verificarAtrasosEEnviarAlerta` (Código.gs:4961), trocar:

```javascript
  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
```

por:

```javascript
  var alertaOff = _getAlerta30Off();
  _getTodasAbas().filter(function(n) { return alertaOff.indexOf(n) === -1; }).forEach(function(nomeAba) {
```

(Corrige bug latente: abas extras nunca entravam no alerta. Agora entram, a menos que desligadas.)

- [ ] **Step 3: Atualizar texto de sucesso de `criarNovoFornecedor`**

Em Código.gs:7291-7295, trocar:

```javascript
    return JSON.stringify({
      ok: '✅ Aba "' + nome + '" criada com sucesso!\n\n' +
          'Para incluir no menu automático, adicione "' + nome +
          '" ao array ABAS_OPERACIONAIS no código e reinstale o sistema.'
    });
```

por:

```javascript
    return JSON.stringify({
      ok: '✅ Aba "' + nome + '" criada com sucesso! ' +
          'Já disponível nos lançamentos e com alerta de +30 dias ativado.'
    });
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node --check "Código.gs"`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "Código.gs"
git commit -m "feat(config): excluirAbaExtra + alerta +30d varre todas as abas respeitando toggle"
```

---

### Task 3: Frontend — tela fornecedor lista abas com switch e exclusão

**Files:**
- Modify: `FormConfiguracoes.html` — HTML da `screen-fornecedor` (linhas ~766-792), hook em `irPara` (~linha 1149), JS após `criarFornecedor` (~linha 1389)

**Interfaces:**
- Consumes (via `google.script.run`): `obterConfigAbas()`, `salvarAlerta30Aba({nome, ligado})`, `excluirAbaExtra({nome, confirmado})` (Tasks 1-2); helpers do form: `showMsg('f', tipo, txt)`, `setLoading('f', bool)`; CSS `.rd-switch`/`.track` do Styles.html injetado
- Produces: funções JS `carregarConfigAbas()`, `toggleAlerta30(nome, chk)`, `excluirAba(nome, usado)` — uso interno do form

- [ ] **Step 1: HTML — bloco de lista dentro da screen-fornecedor**

Em `FormConfiguracoes.html`, dentro de `<div id="screen-fornecedor" class="screen">`, logo após o `<div class="info">…</div>` (linha ~774), inserir:

```html
  <div class="campo">
    <label>Abas de notas — alerta de atraso (+30 dias)</label>
    <div id="ab-lista" style="border:1px solid var(--border-def);border-radius:8px;padding:2px 10px">
      <div style="padding:8px 0;opacity:.6">Carregando abas…</div>
    </div>
  </div>
```

- [ ] **Step 2: JS — carregar e renderizar lista (DOM API, sem innerHTML com nome de aba)**

Em `FormConfiguracoes.html`, logo após a função `criarFornecedor()` (linha ~1389), inserir:

```javascript
// ── Gestão de abas / alerta +30 dias ──────────────────────────
function carregarConfigAbas() {
  var box = document.getElementById('ab-lista');
  box.innerHTML = '<div style="padding:8px 0;opacity:.6">Carregando abas…</div>';
  google.script.run
    .withSuccessHandler(function(resp) {
      var r = JSON.parse(resp);
      if (r.erro) { box.innerHTML = ''; showMsg('f','erro','❌ ' + r.erro); return; }
      box.innerHTML = '';
      r.abas.forEach(function(a) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-def)';

        var nome = document.createElement('strong');
        nome.style.cssText = 'flex:1;font-size:13px';
        nome.textContent = a.nome;
        row.appendChild(nome);

        if (a.fixa) {
          var badge = document.createElement('span');
          badge.style.cssText = 'font-size:10px;opacity:.55;letter-spacing:.4px';
          badge.textContent = 'PADRÃO';
          row.appendChild(badge);
        } else {
          var del = document.createElement('button');
          del.type = 'button';
          del.textContent = '✕';
          del.title = 'Excluir aba';
          del.style.cssText = 'border:none;background:none;cursor:pointer;color:#DC2626;font-size:13px;padding:2px 6px';
          del.onclick = function() { excluirAba(a.nome, a.usado); };
          row.appendChild(del);
        }

        var sw = document.createElement('label');
        sw.className = 'rd-switch';
        sw.title = 'Alerta de +30 dias';
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = a.alerta30;
        chk.onchange = function() { toggleAlerta30(a.nome, chk); };
        var track = document.createElement('span');
        track.className = 'track';
        sw.appendChild(chk); sw.appendChild(track);
        row.appendChild(sw);

        box.appendChild(row);
      });
      if (box.lastChild) box.lastChild.style.borderBottom = 'none';
    })
    .withFailureHandler(function(e) { box.innerHTML=''; showMsg('f','erro','❌ ' + e.message); })
    .obterConfigAbas();
}

function toggleAlerta30(nome, chk) {
  var ligado = chk.checked;
  chk.disabled = true;
  google.script.run
    .withSuccessHandler(function(resp) {
      chk.disabled = false;
      var r = JSON.parse(resp);
      if (r.ok) showMsg('f','ok', r.ok);
      else { chk.checked = !ligado; showMsg('f','erro','❌ ' + (r.erro||'Erro.')); }
    })
    .withFailureHandler(function(e) { chk.disabled=false; chk.checked=!ligado; showMsg('f','erro','❌ '+e.message); })
    .salvarAlerta30Aba({ nome: nome, ligado: ligado });
}

function excluirAba(nome, usado) {
  var aviso = usado > 0
    ? 'A aba "' + nome + '" tem ' + usado + ' lançamento(s). Excluir apaga TODOS os dados dela. Continuar?'
    : 'Excluir a aba "' + nome + '"?';
  if (!confirm(aviso)) return;
  setLoading('f', true);
  google.script.run
    .withSuccessHandler(function(resp) {
      setLoading('f', false);
      var r = JSON.parse(resp);
      if (r.confirmar) {
        // backend viu mais dados do que a tela conhecia — confirma de novo com o número real
        if (confirm('A aba "' + nome + '" tem ' + r.usado + ' lançamento(s). Apagar mesmo assim?')) {
          setLoading('f', true);
          google.script.run
            .withSuccessHandler(function(resp2) {
              setLoading('f', false);
              var r2 = JSON.parse(resp2);
              if (r2.ok) { showMsg('f','ok', r2.ok); carregarConfigAbas(); }
              else showMsg('f','erro','❌ ' + (r2.erro||'Erro.'));
            })
            .withFailureHandler(function(e) { setLoading('f',false); showMsg('f','erro','❌ '+e.message); })
            .excluirAbaExtra({ nome: nome, confirmado: true });
        }
        return;
      }
      if (r.ok) { showMsg('f','ok', r.ok); carregarConfigAbas(); }
      else showMsg('f','erro','❌ ' + (r.erro||'Erro.'));
    })
    .withFailureHandler(function(e) { setLoading('f',false); showMsg('f','erro','❌ '+e.message); })
    .excluirAbaExtra({ nome: nome, confirmado: usado > 0 });
}
```

- [ ] **Step 3: Hooks — carregar lista ao abrir a tela e após criar fornecedor**

Em `irPara` (FormConfiguracoes.html:1149), adicionar junto às outras linhas de tela:

```javascript
    if (tela === 'fornecedor')  carregarConfigAbas();
```

Em `criarFornecedor()`, no success handler (linha ~1384), trocar:

```javascript
      if (r.ok) { showMsg('f','ok', r.ok); document.getElementById('f-nome').value=''; }
```

por:

```javascript
      if (r.ok) { showMsg('f','ok', r.ok); document.getElementById('f-nome').value=''; carregarConfigAbas(); }
```

- [ ] **Step 4: Commit**

```bash
git add FormConfiguracoes.html
git commit -m "feat(config): lista de abas com toggle de alerta +30d e exclusão de aba extra"
```

---

### Task 4: Verificação end-to-end + cache

**Files:** nenhum novo — deploy e teste manual.

**Interfaces:**
- Consumes: skill `deploy-teste` (pull → push → deploy nos 2 IDs → cache), `limparCachePaginas()`

- [ ] **Step 1: Deploy de teste**

Seguir a skill `deploy-teste` do projeto (clasp pull/push/deploy nos 2 IDs + limpeza de cache). NÃO usar `clasp push` sozinho — não atualiza o Web App.

- [ ] **Step 2: Checklist manual no Web App**

1. Configurações → Adicionar Novo Fornecedor: lista mostra Britania, Unilever, Fornecedores Variados (badge PADRÃO) + extras, todos com switch ligado.
2. Desligar switch de uma aba → toast/msg ok; rodar `verificarAtrasosEEnviarAlerta` no editor do Apps Script → aba fora do relatório. Religar → volta.
3. Criar aba extra → aparece na lista com switch ligado e ✕.
4. Excluir aba extra vazia → confirm simples, some da lista e da planilha.
5. Excluir aba extra com dados → confirm com contagem de lançamentos; cancelar não apaga; confirmar apaga.
6. Console do navegador: `google.script.run.withSuccessHandler(console.log).excluirAbaExtra({nome:'Britania',confirmado:true})` → retorna `{erro}` (fixa protegida).
7. Dark mode: lista legível (borda usa `var(--border-def)`, switch é componente v12).

- [ ] **Step 3: Rodar agentes de revisão do projeto**

Antes do commit final: `ui-reviewer` (FormConfiguracoes.html tocado) e `logic-reviewer` (mexe em escrita de planilha/exclusão de aba). Corrigir apontamentos.

- [ ] **Step 4: doc-sync**

Rodar agente `doc-sync` — mudança funcional (novas funções públicas, novo comportamento do alerta) pode desatualizar DOCUMENTACAO.md. Aplicar atualizações apontadas e commitar:

```bash
git add DOCUMENTACAO.md
git commit -m "docs: gestao de abas e toggle de alerta +30d por aba"
```
