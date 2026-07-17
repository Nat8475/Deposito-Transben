# Notificações Telegram v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o alerta webhook atual (texto puro, WhatsApp+Telegram, só atraso 30d) por um canal só-Telegram com tópicos por categoria, mensagens formatadas em HTML, botões inline de Aprovar/Reprovar no fluxo de aprovação de lançamento, e cobertura de eventos do sistema que hoje não notificam ninguém.

**Architecture:** Um dispatcher central `notificarEvento(categoria, htmlMsg, opts)` em Código.gs concentra todo envio ao Telegram (Bot API `sendMessage`/`editMessageText`/`answerCallbackQuery`/`createForumTopic`). Um novo `doPost(e)` recebe callbacks de botão e replies do grupo, valida por secret na URL, e decide aprovação/reprovação chamando uma versão interna de `processarAprovacao` que não depende de sessão Google (autorização = estar no grupo). WhatsApp/Z-API é removido do backend e da UI.

**Tech Stack:** Google Apps Script (`Código.gs`), HtmlService (`FormConfiguracoes.html`), Telegram Bot API via `UrlFetchApp`, `PropertiesService` para config e estado, `Testes.gs` para testes unitários manuais (rodados no editor Apps Script — não existe execução remota de testes neste projeto).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-16-telegram-notificacoes-design.md`.
- Só Telegram — WhatsApp/Z-API é removido por completo (backend + UI), não fica como opção secundária.
- Autorização de clique/reply no bot é por associação ao grupo — nenhum código verifica `_usuarioEhAdmin()` no caminho do `doPost` (não há sessão Google nesse contexto).
- Reprovar não efetiva na hora — pede motivo por reply, só reprova quando a reply chegar.
- `clasp run` não funciona neste projeto (script não é API executable) — **não há execução remota de testes**. Cada task com lógica pura ganha teste em `Testes.gs`; a verificação real é: (a) revisão do código, (b) `clasp push`, (c) o usuário roda `executarTodosTestes` no editor Apps Script, (d) para o que depende do Telegram de verdade (webhook, botões), teste manual pós-deploy com o bot real.
- Segue convenções do projeto: `_esc()` para escapar texto em HTML, `registrarErroSistema(funcao, msg)` para logar falhas silenciosas, `_usuarioEhAdmin()` já existente para gates administrativos no Web App.
- Cache de páginas: mudança em `FormConfiguracoes.html` exige bump da chave `pg_html_v12t_` (ver `_getPageContent` e `limparCachePaginas` em Código.gs) — feito na Task 7.
- Não editar `Styles.html`/CSS de dark mode — este projeto não toca UI visual, só a aba "WhatsApp/Telegram" existente vira "Telegram".

---

### Task 1: Config Telegram-only + helpers de envio + UI (remove WhatsApp)

**Files:**
- Modify: `Código.gs` — bloco `WEBHOOK — ALERTAS WHATSAPP / TELEGRAM` (funções `obterConfWebhook`, `salvarConfWebhook`, `testarWebhookAlerta`, `_enviarAlertaWebhook`, `_dispararWebhook`, var `_KEY_WEBHOOK_CONF`)
- Modify: `FormConfiguracoes.html` — aba `email-hub-tab-webhook` (HTML ~linhas 473-540, JS `_whToggleUI`/`_carregarWebhook`/`_whConf`/`_salvarWebhook`/`_testarWebhook` ~linhas 2222-2296), botão da aba (~linha 312)
- Test: `Testes.gs`

**Interfaces:**
- Produces: `notificarEvento(categoria, htmlMsg, opts, confOverride)` → retorna `result` do Telegram (objeto com `message_id`) em sucesso, `null` em falha/config inativa. `categoria` ∈ `'aprovacoes'|'transferencias'|'vendas'|'sistema'`. `opts.botoes` é um `inline_keyboard` (array de arrays de `{text, callback_data}`).
- Produces: `_tgApi(token, method, payload)` → chama `https://api.telegram.org/bot<token>/<method>`, retorna JSON já parseado (`{ok, result|description}`).
- Consumes (Tasks seguintes): nenhuma.

- [ ] **Step 1: Remover bloco WhatsApp e migrar config no backend**

Substituir todo o bloco (linhas do comentário `WEBHOOK — ALERTAS WHATSAPP / TELEGRAM` até o fim de `_dispararWebhook`) por:

```js
// ════════════════════════════════════════════════════════════
//   WEBHOOK — NOTIFICAÇÕES TELEGRAM
// ════════════════════════════════════════════════════════════

function obterConfWebhook() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF) || '{}';
    var conf = JSON.parse(raw);
    delete conf.webhookSecret;
    return JSON.stringify({ conf: conf });
  } catch(e) { return JSON.stringify({ conf: {} }); }
}

function salvarConfWebhook(conf) {
  try {
    if (!conf || typeof conf !== 'object') return JSON.stringify({ erro: 'Configuração inválida.' });
    var anterior = {};
    try { anterior = JSON.parse(PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF) || '{}'); } catch(_) {}
    var payload = {
      ativo: !!conf.ativo,
      telegram: {
        token:  String((conf.telegram && conf.telegram.token)  || ''),
        chatId: String((conf.telegram && conf.telegram.chatId) || '')
      },
      topicos: anterior.topicos || {},
      webhookSecret: anterior.webhookSecret || Utilities.getUuid()
    };
    PropertiesService.getScriptProperties().setProperty(_KEY_WEBHOOK_CONF, JSON.stringify(payload));
    return JSON.stringify({ ok: '✅ Configuração de Telegram salva.' });
  } catch(e) {
    registrarErroSistema('salvarConfWebhook', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

function testarWebhookAlerta(conf) {
  try {
    var msg = '🔔 <b>Teste do sistema de alertas</b> — Devoluções Transben\n' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var resultado = notificarEvento('sistema', msg, null, conf);
    if (!resultado) return JSON.stringify({ erro: '⚠️ Falha ao enviar — confira token, Chat ID e se as notificações estão ativas.' });
    return JSON.stringify({ ok: '✅ Mensagem de teste enviada com sucesso.' });
  } catch(e) {
    registrarErroSistema('testarWebhookAlerta', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

/* Chamada HTTP genérica à Bot API do Telegram. Retorna o JSON já parseado. */
function _tgApi(token, method, payload) {
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return JSON.parse(resp.getContentText());
  } catch(e) {
    return { ok: false, description: e.message || e.toString() };
  }
}

/* Dispatcher central de notificações. categoria escolhe o tópico do grupo.
   confOverride permite testar uma config ainda não salva (usado por testarWebhookAlerta). */
function notificarEvento(categoria, htmlMsg, opts, confOverride) {
  try {
    var conf = confOverride;
    if (!conf) {
      var raw = PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF) || '{}';
      conf = JSON.parse(raw);
    }
    if (!conf || !conf.ativo) return null;
    var tg     = conf.telegram || {};
    var token  = (tg.token  || '').trim();
    var chatId = (tg.chatId || '').trim();
    if (!token || !chatId) return null;

    var payload = { chat_id: chatId, text: htmlMsg, parse_mode: 'HTML' };
    var threadId = conf.topicos && conf.topicos[categoria];
    if (threadId) payload.message_thread_id = Number(threadId);
    if (opts && opts.botoes) payload.reply_markup = { inline_keyboard: opts.botoes };

    var body = _tgApi(token, 'sendMessage', payload);
    if (!body.ok) {
      registrarErroSistema('notificarEvento', categoria + ': ' + (body.description || 'erro'));
      return null;
    }
    return body.result;
  } catch(e) {
    registrarErroSistema('notificarEvento', e.message || e.toString());
    return null;
  }
}

/* Compat: chamado pelo alerta de atraso — Task 6 migra para notificarEvento direto. */
function _enviarAlertaWebhook(msg) {
  notificarEvento('sistema', msg);
}
```

- [ ] **Step 2: Adicionar teste de `notificarEvento` com config inativa (não deve chamar rede)**

`Testes.gs` — adicionar função e registrar no array `funcs` de `executarTodosTestes`:

```js
function testeNotificarEventoInativo() {
  var chaveAnterior = PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF);
  try {
    PropertiesService.getScriptProperties().setProperty(_KEY_WEBHOOK_CONF, JSON.stringify({ ativo: false }));
    var r = notificarEvento('sistema', 'teste');
    _assertEquals(r, null, 'notificarEvento deve retornar null quando config está inativa');
    return 'ok';
  } finally {
    if (chaveAnterior === null) PropertiesService.getScriptProperties().deleteProperty(_KEY_WEBHOOK_CONF);
    else PropertiesService.getScriptProperties().setProperty(_KEY_WEBHOOK_CONF, chaveAnterior);
  }
}
```

Adicionar `testeNotificarEventoInativo` ao array `funcs` em `executarTodosTestes` (logo após `testeSLAFornecedores`).

- [ ] **Step 3: Verificação manual do teste**

Não há execução remota — pedir ao usuário: abrir o editor Apps Script, rodar `executarTodosTestes`, confirmar `[OK] testeNotificarEventoInativo` no Logger. (Este passo se repete — daqui em diante "rodar os testes" significa isso.)

- [ ] **Step 4: Migrar HTML da aba (remove seletor de canal e bloco WhatsApp)**

Em `FormConfiguracoes.html`, trocar o botão da aba (linha ~312):
```html
<button class="tab-btn" data-tab="webhook" onclick="mudarTab('email-hub','webhook',this);_carregarWebhook()">📲 Telegram</button>
```

Substituir todo o bloco `<div id="email-hub-tab-webhook" ...>` (linhas ~474-540) por:

```html
<!-- Aba: Telegram -->
<div id="email-hub-tab-webhook" class="tab-pane">
  <div class="info" style="margin-bottom:12px">
    Envie notificações do sistema (aprovações, transferências, vendas, alertas) para um grupo do <strong>Telegram</strong>, organizadas por tópico.
  </div>

  <div class="sec-linha" style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <label class="toggle-lbl" for="wh-ativo" style="font-weight:600;font-size:13px">Notificações ativas</label>
    <input type="checkbox" id="wh-ativo"
           style="width:18px;height:18px;accent-color:var(--navy);cursor:pointer">
  </div>

  <div class="secao-email" style="margin-bottom:10px">
    <div class="sec-titulo">🤖 Telegram — Bot</div>
    <div class="form-group">
      <label class="campo-label">Bot Token</label>
      <input type="password" id="wh-tg-token" class="campo-inp" placeholder="1234567890:ABC...">
      <div class="info" style="margin-top:4px">Obtenha em @BotFather no Telegram.</div>
    </div>
    <div class="form-group" style="margin-top:8px">
      <label class="campo-label">Chat ID do grupo</label>
      <input type="text" id="wh-tg-chat" class="campo-inp" placeholder="-100987654321">
      <div class="info" style="margin-top:4px">ID do grupo/supergrupo. Use @userinfobot ou @RawDataBot para descobrir.</div>
    </div>
  </div>

  <div class="secao-email" style="margin-bottom:10px">
    <div class="sec-titulo">🗂️ Tópicos</div>
    <div class="info" style="margin-bottom:8px">Cria 4 tópicos no grupo (Aprovações, Transferências, Vendas/Lançamentos, Sistema/Alertas) e guarda os IDs. Requer supergrupo com tópicos habilitados e o bot como admin.</div>
    <div id="wh-topicos-status" style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Nenhum tópico criado ainda.</div>
    <button class="btn-sec" onclick="_criarTopicosWebhook()">🗂️ Criar tópicos</button>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
    <button class="btn-salvar" onclick="_salvarWebhook()">💾 Salvar</button>
    <button class="btn-sec" onclick="_testarWebhook()">📤 Testar agora</button>
  </div>
  <div class="msg" id="wh-msg" style="margin-top:10px"></div>
</div>
```

- [ ] **Step 5: Migrar JS da aba**

Substituir o bloco `// ── WhatsApp / Telegram webhook ──` até o fim de `_testarWebhook()` (linhas ~2221-2296) por:

```js
// ── Telegram webhook ──────────────────────────────────────
function _carregarWebhook() {
  var msg = document.getElementById('wh-msg');
  msg.style.display = 'none';
  google.script.run
    .withSuccessHandler(function(resp) {
      try {
        var r = JSON.parse(resp);
        if (r.erro) return;
        var c = r.conf || {};
        document.getElementById('wh-ativo').checked   = !!c.ativo;
        document.getElementById('wh-tg-token').value  = (c.telegram && c.telegram.token)  || '';
        document.getElementById('wh-tg-chat').value   = (c.telegram && c.telegram.chatId) || '';
        var t = c.topicos || {};
        var status = document.getElementById('wh-topicos-status');
        if (t.aprovacoes || t.transferencias || t.vendas || t.sistema) {
          status.textContent = '✅ Aprovações: ' + (t.aprovacoes||'—') +
            ' · Transferências: ' + (t.transferencias||'—') +
            ' · Vendas: ' + (t.vendas||'—') +
            ' · Sistema: ' + (t.sistema||'—');
        } else {
          status.textContent = 'Nenhum tópico criado ainda.';
        }
      } catch(_) {}
    })
    .withFailureHandler(function(){})
    .obterConfWebhook();
}

function _whConf() {
  return {
    ativo: document.getElementById('wh-ativo').checked,
    telegram: {
      token:  (document.getElementById('wh-tg-token').value || '').trim(),
      chatId: (document.getElementById('wh-tg-chat').value  || '').trim()
    }
  };
}

function _salvarWebhook() {
  var msg = document.getElementById('wh-msg');
  msg.style.display = 'none';
  google.script.run
    .withSuccessHandler(function(resp) {
      var r = JSON.parse(resp);
      mostrarMsg('wh-msg', r.ok || ('❌ ' + (r.erro || 'Erro')), r.ok ? 'ok' : 'erro');
    })
    .withFailureHandler(function(e) {
      mostrarMsg('wh-msg', '❌ Falha: ' + (e.message || e), 'erro');
    })
    .salvarConfWebhook(_whConf());
}

function _testarWebhook() {
  var msg = document.getElementById('wh-msg');
  mostrarMsg('wh-msg', '⏳ Enviando mensagem de teste...', 'ok');
  google.script.run
    .withSuccessHandler(function(resp) {
      var r = JSON.parse(resp);
      mostrarMsg('wh-msg', r.ok || ('❌ ' + (r.erro || 'Erro')), r.ok ? 'ok' : 'erro');
    })
    .withFailureHandler(function(e) {
      mostrarMsg('wh-msg', '❌ Falha: ' + (e.message || e), 'erro');
    })
    .testarWebhookAlerta(_whConf());
}

function _criarTopicosWebhook() {
  mostrarMsg('wh-msg', '⏳ Criando tópicos...', 'ok');
  google.script.run
    .withSuccessHandler(function(resp) {
      var r = JSON.parse(resp);
      mostrarMsg('wh-msg', r.ok || ('❌ ' + (r.erro || 'Erro')), r.ok ? 'ok' : 'erro');
      if (r.ok) _carregarWebhook();
    })
    .withFailureHandler(function(e) {
      mostrarMsg('wh-msg', '❌ Falha: ' + (e.message || e), 'erro');
    })
    .criarTopicosWebhook(_whConf());
}
```

(`criarTopicosWebhook` no backend é implementado na Task 2 — a UI já pode chamá-la porque `google.script.run` só falha em runtime, não em "compilação".)

- [ ] **Step 6: Commit**

```bash
git add Código.gs FormConfiguracoes.html Testes.gs
git commit -m "feat(telegram): substitui webhook WhatsApp/Telegram por canal só-Telegram com dispatcher central"
```

---

### Task 2: Criação automática de tópicos

**Files:**
- Modify: `Código.gs` — mesmo bloco da Task 1
- Test: `Testes.gs`

**Interfaces:**
- Consumes: `_tgApi(token, method, payload)` (Task 1).
- Produces: `criarTopicosWebhook(conf)` → `JSON.stringify({ok}|{erro})`, salva `topicos` em `_KEY_WEBHOOK_CONF`.

- [ ] **Step 1: Implementar `criarTopicosWebhook`**

Adicionar em `Código.gs`, logo após `notificarEvento`:

```js
function criarTopicosWebhook(conf) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var token  = String((conf && conf.telegram && conf.telegram.token)  || '').trim();
    var chatId = String((conf && conf.telegram && conf.telegram.chatId) || '').trim();
    if (!token || !chatId) return JSON.stringify({ erro: 'Informe token e Chat ID antes de criar os tópicos.' });

    var nomes = {
      aprovacoes:     '🔔 Aprovações',
      transferencias: '🔄 Transferências',
      vendas:         '💰 Vendas/Lançamentos',
      sistema:        '⚙️ Sistema/Alertas'
    };
    var topicos = {};
    var erros = [];
    Object.keys(nomes).forEach(function(chave) {
      var body = _tgApi(token, 'createForumTopic', { chat_id: chatId, name: nomes[chave] });
      if (body.ok && body.result && body.result.message_thread_id) {
        topicos[chave] = String(body.result.message_thread_id);
      } else {
        erros.push(chave + ': ' + (body.description || 'erro desconhecido'));
      }
    });

    if (Object.keys(topicos).length) {
      var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF) || '{}';
      var atual = JSON.parse(raw);
      atual.topicos = topicos;
      if (!atual.telegram || !atual.telegram.token) atual.telegram = { token: token, chatId: chatId };
      if (!atual.webhookSecret) atual.webhookSecret = Utilities.getUuid();
      PropertiesService.getScriptProperties().setProperty(_KEY_WEBHOOK_CONF, JSON.stringify(atual));
    }

    if (erros.length) return JSON.stringify({ erro: '⚠️ Alguns tópicos falharam: ' + erros.join(' | ') });
    return JSON.stringify({ ok: '✅ 4 tópicos criados e salvos.' });
  } catch(e) {
    registrarErroSistema('criarTopicosWebhook', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
```

- [ ] **Step 2: Teste de guarda de acesso**

`Testes.gs`:
```js
function testeCriarTopicosSemCredenciais() {
  var r = JSON.parse(criarTopicosWebhook({ telegram: { token: '', chatId: '' } }));
  _assertContains(r, 'erro', 'sem token/chatId deve retornar erro');
  return 'ok';
}
```
Adicionar ao array `funcs`. (Este teste só valida a guarda local — não chama a rede porque falha antes do `_tgApi`. Cobertura de rede real é o teste manual pós-deploy da Task 7.)

- [ ] **Step 3: Rodar os testes** (ver Task 1 Step 3)

- [ ] **Step 4: Commit**

```bash
git add Código.gs Testes.gs
git commit -m "feat(telegram): cria tópicos do grupo automaticamente via createForumTopic"
```

---

### Task 3: `doPost` — recepção de updates do Telegram

**Files:**
- Modify: `Código.gs` — logo antes de `doGet` (~linha 8549, buscar `function doGet(e)`)
- Test: `Testes.gs`

**Interfaces:**
- Produces: `doPost(e)`, `_tgSecretValido(conf, secretRecebido)`, `_tgProcessarCallback(conf, callback)` (corpo vazio — Tasks 4/5 preenchem), `_tgProcessarReply(conf, message)` (corpo vazio — Task 5 preenche).
- Consumes: nada ainda (dispatcher fica pronto pra próximas tasks plugarem lógica).

- [ ] **Step 1: Implementar `doPost` e validação de secret**

Adicionar em `Código.gs`, imediatamente antes de `function doGet(e) {`:

```js
/* Valida se o secret recebido na URL do webhook bate com o configurado. */
function _tgSecretValido(conf, secretRecebido) {
  var esperado = (conf && conf.webhookSecret) || '';
  return !!esperado && secretRecebido === esperado;
}

function doPost(e) {
  try {
    var conf = JSON.parse(PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF) || '{}');
    var secretRecebido = (e.parameter && e.parameter.secret) || '';
    if (!_tgSecretValido(conf, secretRecebido)) {
      return ContentService.createTextOutput('');
    }
    var update = JSON.parse(e.postData.contents);
    if (update.callback_query) {
      _tgProcessarCallback(conf, update.callback_query);
    } else if (update.message && update.message.reply_to_message) {
      _tgProcessarReply(conf, update.message);
    }
    return ContentService.createTextOutput('');
  } catch(err) {
    registrarErroSistema('doPost', err.message || err.toString());
    return ContentService.createTextOutput('');
  }
}

/* Preenchido na Task 4 (aprovar) e Task 5 (reprovar). */
function _tgProcessarCallback(conf, callback) {}

/* Preenchido na Task 5. */
function _tgProcessarReply(conf, message) {}
```

- [ ] **Step 2: Teste de validação de secret**

`Testes.gs`:
```js
function testeTgSecretValido() {
  _assertEquals(_tgSecretValido({ webhookSecret: 'abc' }, 'abc'), true,  'secret correto deve validar');
  _assertEquals(_tgSecretValido({ webhookSecret: 'abc' }, 'xyz'), false, 'secret errado não deve validar');
  _assertEquals(_tgSecretValido({}, ''), false, 'sem secret configurado não deve validar');
  return 'ok';
}
```
Adicionar ao array `funcs`.

- [ ] **Step 3: Rodar os testes**

- [ ] **Step 4: Commit**

```bash
git add Código.gs Testes.gs
git commit -m "feat(telegram): adiciona doPost com validação de secret para receber updates do bot"
```

---

### Task 4: Aprovação por botão (✅ Aprovar)

**Files:**
- Modify: `Código.gs` — `_notificarAprovadores` (~linha 7252), `processarAprovacao` (~linha 7300), `_tgProcessarCallback` (Task 3)
- Test: `Testes.gs`

**Interfaces:**
- Consumes: `notificarEvento`, `_tgApi`, `_esc`, `_fmtVal`, `_gravarLancamento(dados)` (já existente).
- Produces: `_processarAprovacaoInterno(id, aprovado, justificativa, revisorLabel)` — versão de `processarAprovacao` sem gate `_usuarioEhAdmin()`, usada tanto pelo Web App (via `processarAprovacao`) quanto pelo `doPost`. `_tgNomeUsuario(from)` → formata identificação do usuário do Telegram (`@username` ou primeiro nome).

- [ ] **Step 1: Extrair `_processarAprovacaoInterno` de `processarAprovacao`**

Substituir a função `processarAprovacao` inteira (linhas ~7300-7343) por:

```js
function processarAprovacao(id, aprovado, justificativa) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var revisor = Session.getActiveUser().getEmail() || 'aprovador';
  return _processarAprovacaoInterno(id, aprovado, justificativa, revisor);
}

/* Mesma lógica de antes, mas recebe o identificador do revisor em vez de
   ler Session.getActiveUser() — permite ser chamada pelo doPost do Telegram,
   onde não existe sessão Google (autorização lá é: estar no grupo). */
function _processarAprovacaoInterno(id, aprovado, justificativa, revisorLabel) {
  try {
    var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACOES_PEND) || '[]';
    var lista = JSON.parse(raw);
    var idx   = -1;
    for (var i = 0; i < lista.length; i++) { if (lista[i].id === id) { idx = i; break; } }
    if (idx === -1) return JSON.stringify({ erro: 'Aprovação não encontrada.' });
    var item = lista[idx];
    lista.splice(idx, 1);
    PropertiesService.getScriptProperties().setProperty(_KEY_APROVACOES_PEND, JSON.stringify(lista));

    if (aprovado) {
      _gravarLancamento(item.dados);
      notificarEvento('aprovacoes', '✅ <b>Lançamento aprovado</b> — NF ' + _esc(String(item.dados.nf||'?')) +
        ' por ' + _esc(revisorLabel));
      return JSON.stringify({ ok: '✅ Lançamento aprovado e gravado.' });
    } else {
      try {
        var bodyRep =
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F1F4F9" style="background:#F1F4F9;padding:20px 8px"><tr><td align="center">' +
          '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:Arial,Helvetica,sans-serif">' +
          '<tr><td bgcolor="#0B1526" style="background:linear-gradient(135deg,#0B1526,#1E3A5F);border-radius:10px 10px 0 0;padding:18px 22px">' +
            '<div style="font-size:8.5px;font-weight:bold;color:#9CC1FF;letter-spacing:2px">TRANSBEN · CONTROLE DE DEVOLUÇÕES</div>' +
            '<div style="color:#fff;font-size:16px;font-weight:bold;margin-top:9px">Lançamento não aprovado</div>' +
          '</td></tr>' +
          '<tr><td bgcolor="#DC2626" style="background:#DC2626;color:#fff;font-size:10px;font-weight:bold;letter-spacing:1px;text-align:center;padding:5px">REPROVADO — NF ' + _esc(String(item.dados.nf||'?')).toUpperCase() + (item.dados.fornecedor ? ' · ' + _esc(String(item.dados.fornecedor)).toUpperCase() : '') + '</td></tr>' +
          '<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:20px 22px">' +
            '<p style="margin:0 0 14px;font-size:13px;color:#344256;line-height:1.6">Seu lançamento foi analisado e <b style="color:#DC2626">reprovado</b> por <b>' + _esc(revisorLabel) + '</b>.</p>' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FEF2F2" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;border-collapse:separate"><tr><td style="padding:12px 16px">' +
              '<div style="font-size:9.5px;font-weight:bold;color:#991B1B;letter-spacing:1px;margin-bottom:4px">JUSTIFICATIVA</div>' +
              '<div style="color:#7F1D1D;font-size:12.5px;line-height:1.6">' + _esc(justificativa||'—') + '</div>' +
            '</td></tr></table>' +
            '<p style="margin:14px 0 0;font-size:12px;color:#5B7186;text-align:center">Corrija os dados apontados e reenvie pelo Lançar Devolução.</p>' +
          '</td></tr>' +
          '<tr><td bgcolor="#F1F4F9" style="background:#F1F4F9;border-radius:0 0 10px 10px;padding:11px 22px" align="center">' +
            '<div style="font-size:10px;color:#8A9BB0">E-mail automático do <b style="color:#5B7186">Controle de Devoluções · Transben</b>.</div>' +
          '</td></tr>' +
          '</table></td></tr></table>';
        MailApp.sendEmail({ to: item.usuario, subject: '❌ Lançamento reprovado — NF '+(item.dados.nf||'?'),
          htmlBody: bodyRep });
      } catch(_){}
      notificarEvento('aprovacoes', '❌ <b>Lançamento reprovado</b> — NF ' + _esc(String(item.dados.nf||'?')) +
        ' por ' + _esc(revisorLabel) + '\nMotivo: ' + _esc(justificativa||'—'));
      return JSON.stringify({ ok: '✅ Lançamento reprovado. Solicitante notificado.' });
    }
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}
```

- [ ] **Step 2: Notificar Telegram ao criar a aprovação pendente (com botões)**

Em `_notificarAprovadores` (~linha 7252), manter todo o corpo de e-mail existente e adicionar, ao final da função (depois do `MailApp.sendEmail(...)` e antes do fechamento do `try`), a chamada Telegram. A função hoje termina assim:

```js
    MailApp.sendEmail({ to: aprovadores.join(','), subject: assunto, htmlBody: body });
  } catch(_){}
}
```

Trocar por:

```js
    MailApp.sendEmail({ to: aprovadores.join(','), subject: assunto, htmlBody: body });
  } catch(_){}
  _tgNotificarAprovacaoPendente(id, dados);
}

function _tgNotificarAprovacaoPendente(id, dados) {
  try {
    var usuario  = Session.getActiveUser().getEmail();
    var valorTot = (parseFloat(dados.qtd) || 0) * (parseFloat(dados.valorUnit) || 0);
    var msg = '🔔 <b>Lançamento aguardando aprovação</b>\n' +
      'NF/NFD: <code>' + _esc(String(dados.nf||'—')) + '</code>' + (dados.nfd ? ' · ' + _esc(String(dados.nfd)) : '') + '\n' +
      'Fornecedor: <b>' + _esc(String(dados.fornecedor || dados.abaSelecao || '—')) + '</b>\n' +
      'Tipo/Motivo: ' + _esc(String(dados.tipo||'—')) + ' — ' + _esc(String(dados.motivo||'—')) + '\n' +
      'Qtd/Valor: ' + _esc(String(dados.qtd||'—')) + ' cxs · R$ ' + _fmtVal(valorTot) + '\n' +
      'Submetido por: ' + _esc(usuario);
    var botoes = [[
      { text: '✅ Aprovar',  callback_data: 'aprov:' + id + ':sim' },
      { text: '❌ Reprovar', callback_data: 'aprov:' + id + ':nao' }
    ]];
    notificarEvento('aprovacoes', msg, { botoes: botoes });
  } catch(e) { registrarErroSistema('_tgNotificarAprovacaoPendente', e.message || e.toString()); }
}
```

- [ ] **Step 3: Implementar `_tgProcessarCallback` (ramo "sim") e `_tgNomeUsuario`**

Em `Código.gs`, substituir o corpo vazio de `_tgProcessarCallback` (Task 3) por:

```js
function _tgProcessarCallback(conf, callback) {
  var data = String(callback.data || '');
  var partes = data.split(':'); // ['aprov', id, 'sim'|'nao']
  if (partes[0] !== 'aprov' || partes.length !== 3) return;
  var id      = partes[1];
  var decisao = partes[2];
  var chatId    = callback.message.chat.id;
  var messageId = callback.message.message_id;
  var token     = conf.telegram.token;

  if (decisao === 'sim') {
    var resp = JSON.parse(_processarAprovacaoInterno(id, true, null, _tgNomeUsuario(callback.from)));
    var texto = resp.ok
      ? '✅ <b>Aprovado</b> por ' + _esc(_tgNomeUsuario(callback.from))
      : '⚠️ ' + _esc(resp.erro || 'Erro ao processar.');
    _tgApi(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text: texto, parse_mode: 'HTML' });
    _tgApi(token, 'answerCallbackQuery', { callback_query_id: callback.id });
  } else if (decisao === 'nao') {
    // implementado na Task 5
  }
}

function _tgNomeUsuario(from) {
  if (!from) return 'alguém';
  if (from.username) return '@' + from.username;
  return String(from.first_name || 'alguém');
}
```

- [ ] **Step 4: Teste de `_tgNomeUsuario`**

`Testes.gs`:
```js
function testeTgNomeUsuario() {
  _assertEquals(_tgNomeUsuario({ username: 'joaosilva' }), '@joaosilva', 'deve preferir username');
  _assertEquals(_tgNomeUsuario({ first_name: 'João' }), 'João', 'sem username usa first_name');
  _assertEquals(_tgNomeUsuario(null), 'alguém', 'sem from usa fallback');
  return 'ok';
}
```
Adicionar ao array `funcs`.

- [ ] **Step 5: Rodar os testes**

- [ ] **Step 6: Commit**

```bash
git add Código.gs Testes.gs
git commit -m "feat(telegram): botão Aprovar no Telegram grava o lançamento e edita a mensagem"
```

---

### Task 5: Reprovação por botão + motivo via reply

**Files:**
- Modify: `Código.gs` — `_tgProcessarCallback` (ramo "nao"), `_tgProcessarReply`, novas funções de estado
- Test: `Testes.gs`

**Interfaces:**
- Consumes: `_processarAprovacaoInterno`, `_tgApi`, `_tgNomeUsuario`, `_esc` (Task 4).
- Produces: `_tgSalvarPendenteMotivo(aprovacaoId, chatId, messageId)`, `_tgAcharPendenteMotivo(replyToMessageId)` → `{item, lista, idx}` ou `null`, `_tgRemoverPendenteMotivo(lista, idx)`. Nova chave `_KEY_APROV_AGUARDANDO_MOTIVO`.

- [ ] **Step 1: Declarar a nova chave de propriedade**

Em `Código.gs`, junto das outras declarações de `_KEY_*` (perto de `_KEY_APROVACOES_PEND`, ~linha 7350), adicionar:

```js
var _KEY_APROV_AGUARDANDO_MOTIVO = 'cdv_aprov_aguardando_motivo'; // JSON: [{ aprovacaoId, chatId, messageId }]
```

- [ ] **Step 2: Implementar helpers de estado "aguardando motivo"**

Adicionar logo abaixo de `_tgNomeUsuario` (Task 4):

```js
function _tgSalvarPendenteMotivo(aprovacaoId, chatId, messageId) {
  var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_APROV_AGUARDANDO_MOTIVO) || '[]';
  var lista = JSON.parse(raw).filter(function(p){ return p.aprovacaoId !== aprovacaoId; });
  lista.push({ aprovacaoId: aprovacaoId, chatId: chatId, messageId: messageId });
  PropertiesService.getScriptProperties().setProperty(_KEY_APROV_AGUARDANDO_MOTIVO, JSON.stringify(lista));
}

function _tgAcharPendenteMotivo(replyToMessageId) {
  var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_APROV_AGUARDANDO_MOTIVO) || '[]';
  var lista = JSON.parse(raw);
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].messageId) === String(replyToMessageId)) return { item: lista[i], lista: lista, idx: i };
  }
  return null;
}

function _tgRemoverPendenteMotivo(lista, idx) {
  lista.splice(idx, 1);
  PropertiesService.getScriptProperties().setProperty(_KEY_APROV_AGUARDANDO_MOTIVO, JSON.stringify(lista));
}
```

- [ ] **Step 3: Completar ramo "nao" de `_tgProcessarCallback`**

Trocar o comentário `// implementado na Task 5` (Task 4, Step 3) por:

```js
    var textoPedido = '✍️ <b>Responda esta mensagem</b> com o motivo da reprovação.';
    _tgApi(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text: textoPedido, parse_mode: 'HTML' });
    _tgApi(token, 'answerCallbackQuery', { callback_query_id: callback.id });
    _tgSalvarPendenteMotivo(id, chatId, messageId);
```

- [ ] **Step 4: Implementar `_tgProcessarReply`**

Substituir o corpo vazio de `_tgProcessarReply` (Task 3) por:

```js
function _tgProcessarReply(conf, message) {
  var achado = _tgAcharPendenteMotivo(message.reply_to_message.message_id);
  if (!achado) return;
  var motivo = String(message.text || '').trim();
  if (!motivo) return;

  var revisorLabel = _tgNomeUsuario(message.from);
  var resp  = JSON.parse(_processarAprovacaoInterno(achado.item.aprovacaoId, false, motivo, revisorLabel));
  var texto = resp.ok
    ? '❌ <b>Reprovado</b> por ' + _esc(revisorLabel) + '\nMotivo: ' + _esc(motivo)
    : '⚠️ ' + _esc(resp.erro || 'Erro ao processar.');

  _tgApi(conf.telegram.token, 'editMessageText', {
    chat_id: achado.item.chatId, message_id: achado.item.messageId, text: texto, parse_mode: 'HTML'
  });
  _tgRemoverPendenteMotivo(achado.lista, achado.idx);
}
```

- [ ] **Step 5: Testes de matching do "aguardando motivo"**

`Testes.gs`:
```js
function testeTgPendenteMotivo() {
  var chaveAnterior = PropertiesService.getScriptProperties().getProperty(_KEY_APROV_AGUARDANDO_MOTIVO);
  try {
    PropertiesService.getScriptProperties().deleteProperty(_KEY_APROV_AGUARDANDO_MOTIVO);
    _tgSalvarPendenteMotivo('ap_1', '-100123', 555);
    var achado = _tgAcharPendenteMotivo(555);
    _assert(achado != null, 'deve achar pendente pelo messageId');
    _assertEquals(achado.item.aprovacaoId, 'ap_1', 'aprovacaoId deve bater');

    var naoAchado = _tgAcharPendenteMotivo(999);
    _assertEquals(naoAchado, null, 'messageId sem correspondência deve retornar null');

    _tgRemoverPendenteMotivo(achado.lista, achado.idx);
    _assertEquals(_tgAcharPendenteMotivo(555), null, 'após remover, não deve mais achar');
    return 'ok';
  } finally {
    if (chaveAnterior === null) PropertiesService.getScriptProperties().deleteProperty(_KEY_APROV_AGUARDANDO_MOTIVO);
    else PropertiesService.getScriptProperties().setProperty(_KEY_APROV_AGUARDANDO_MOTIVO, chaveAnterior);
  }
}
```
Adicionar ao array `funcs`.

- [ ] **Step 6: Rodar os testes**

- [ ] **Step 7: Commit**

```bash
git add Código.gs Testes.gs
git commit -m "feat(telegram): reprovação pelo Telegram pede motivo por reply antes de efetivar"
```

---

### Task 6: Log completo — migrar e cobrir eventos do sistema

**Files:**
- Modify: `Código.gs` — alerta de atraso, backup, transferências vencidas, `darBaixaTransferencia`, `cancelarTransferencia`, `reagendarTransferencia`, `executarBaixaVenda`, `submeterParaAprovacao`

**Interfaces:**
- Consumes: `notificarEvento` (Task 1).
- Produces: nenhuma nova — só novos call-sites.

- [ ] **Step 1: Migrar alerta de atraso para chamada direta**

Localizar (buscar `_enviarAlertaWebhook('⚠️ ' + linhas.length`):
```js
  _enviarAlertaWebhook('⚠️ ' + linhas.length + ' devolução(ões) em atraso crítico (+30 dias) — ' + dataStr
    + '\nTotal: R$ ' + _fmtVal(valTotal)
    + '\nAcesse o sistema para detalhes.');
```
Substituir por:
```js
  notificarEvento('sistema', '⚠️ <b>' + linhas.length + ' devolução(ões) em atraso crítico</b> (+30 dias) — ' + dataStr +
    '\nTotal: R$ ' + _fmtVal(valTotal) +
    '\nMais antigo: NF ' + _esc(String(maisAntigo.nfd || maisAntigo.nf)) + ' — ' + maisAntigo.dias + ' dias');
```
Remover a função `_enviarAlertaWebhook` (Task 1, shim de compatibilidade) já que não há mais call sites — buscar `_enviarAlertaWebhook` em todo o arquivo para confirmar que só sobra a definição, e apagá-la.

- [ ] **Step 2: Notificar backup realizado**

Localizar (buscar `'💾 Backup realizado em '`):
```js
  registrarLog(ss, 'SISTEMA', 0, 0, '', totalLinhas + ' linhas', '💾 Backup realizado em ' + dataStr);
```
Adicionar logo depois:
```js
  notificarEvento('sistema', '💾 <b>Backup realizado</b> — ' + dataStr + '\n' + totalLinhas + ' linha(s) salvas.');
```

- [ ] **Step 3: Notificar transferências vencidas**

Localizar (buscar `'📧 Alerta de transferências vencidas enviado'`):
```js
    registrarLog(ss, 'SISTEMA', 0, 0, '', vencidas.length + ' vencidas',
      '📧 Alerta de transferências vencidas enviado para ' + dest.to + ' — ' + vencidas.length + ' item(ns)');
```
Adicionar logo depois:
```js
    notificarEvento('transferencias', '⚠️ <b>' + vencidas.length + ' transferência(s) vencida(s)</b>\n' +
      vencidas.slice(0, 10).map(function(v) {
        return '• ' + _esc(String(v.nfd || v.nf)) + ' — ' + _esc(v.forn) + ' — vencido em ' + _esc(v.agend);
      }).join('\n') +
      (vencidas.length > 10 ? '\n… e mais ' + (vencidas.length - 10) + '.' : ''));
```

- [ ] **Step 4: Notificar baixa de transferência**

Em `darBaixaTransferencia`, localizar (buscar `'✅ Item devolvido via Transferências'`):
```js
    registrarLog(ss, abaOrigem, destOrig, COL_STATUS, 'Em Transferência', 'Devolvido',
      '✅ Item devolvido via Transferências — ' + nfLabel);
```
Adicionar logo depois:
```js
    notificarEvento('transferencias', '✅ <b>Baixa de transferência confirmada</b>\n' +
      nfLabel + ' → ' + _esc(abaOrigem) + (urlComprovante ? '\n📎 Comprovante anexado' : ''));
```

- [ ] **Step 5: Notificar cancelamento de transferência**

Em `cancelarTransferencia`, localizar (buscar `'↩️ Item retornou após cancelamento'`):
```js
    registrarLog(ss, abaOrigem, destOrig, COL_STATUS, 'Em Transferência', 'Pendente',
      '↩️ Item retornou após cancelamento de transferência — ' + nfLabel);
```
Adicionar logo depois:
```js
    notificarEvento('transferencias', '❌ <b>Transferência cancelada</b>\n' +
      nfLabel + ' — Motivo: ' + _esc(obs));
```

- [ ] **Step 6: Notificar reagendamento de transferência**

Em `reagendarTransferencia`, localizar (buscar `'📅 Reagendamento —'`):
```js
    registrarLog(ss, ABA_TRANSFERENCIAS, linhaTransf, TRANSF_COL_DATA_AGEND,
      dataAntStr, novaDataStr,
      '📅 Reagendamento — ' + nfLabel + ': ' + dataAntStr + ' → ' + novaDataStr + ' — ' + usuario);
```
Adicionar logo depois:
```js
    notificarEvento('transferencias', '📅 <b>Transferência reagendada</b>\n' +
      nfLabel + ': ' + dataAntStr + ' → ' + novaDataStr);
```

- [ ] **Step 7: Notificar venda executada**

Em `executarBaixaVenda`, localizar (buscar `_atualizarMetricasDashboard(ss);` — é a única ocorrência dentro dessa função, logo depois do loop `porAba`):
```js
  try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
  _atualizarMetricasDashboard(ss);

  if (!ID_PASTA_DESTINO_VENDA || ID_PASTA_DESTINO_VENDA.startsWith('INSIRA'))
```
Inserir a notificação entre as duas linhas:
```js
  try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
  _atualizarMetricasDashboard(ss);

  notificarEvento('vendas', '🛒 <b>Venda registrada</b> — ' + nfsOk.length + ' item(ns)\n' +
    nfsOk.slice(0, 10).map(function(n){ return '• ' + _esc(n); }).join('\n') +
    (nfsOk.length > 10 ? '\n… e mais ' + (nfsOk.length - 10) + '.' : ''));

  if (!ID_PASTA_DESTINO_VENDA || ID_PASTA_DESTINO_VENDA.startsWith('INSIRA'))
```

- [ ] **Step 8: Notificar lançamento gravado direto (aprovação desativada)**

`_gravarLancamento` (chamada por `salvarLancamentoForm`) retorna `JSON.stringify({ ok: '...' })` em sucesso ou lança exceção (`throw new Error(...)`) em falha — nunca retorna `{erro}`. Uma exceção lançada aqui propaga por `salvarLancamentoForm` → `submeterParaAprovacao` e vira `withFailureHandler` no frontend, então o código abaixo só roda quando a gravação realmente deu certo. `salvarLancamentoForm` também pode retornar `{ aviso: '...' }` sem lançar (NF duplicada, nada foi gravado) — por isso o `if` checa especificamente `respObj.ok`.

Em `submeterParaAprovacao`, trocar:
```js
function submeterParaAprovacao(dadosLancamento) {
  var ativo = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACAO_ATIVA) === '1';
  if (!ativo) {
    return salvarLancamentoForm(dadosLancamento); // aprovação desligada — salva direto
  }
```
Por:
```js
function submeterParaAprovacao(dadosLancamento) {
  var ativo = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACAO_ATIVA) === '1';
  if (!ativo) {
    var resp = salvarLancamentoForm(dadosLancamento); // aprovação desligada — salva direto
    var respObj = JSON.parse(resp);
    if (respObj.ok) {
      notificarEvento('vendas', '📝 <b>Novo lançamento</b> — NF ' + _esc(String(dadosLancamento.nf||'?')) +
        ' — ' + _esc(String(dadosLancamento.fornecedor || dadosLancamento.abaSelecao || '—')));
    }
    return resp;
  }
```

- [ ] **Step 9: Rodar os testes** (regressão — nenhum teste novo de lógica pura aqui, é só instrumentação de call-sites já cobertos por `testeSaudeSistema`/`testeSandboxGravacaoLeitura` existentes)

- [ ] **Step 10: Commit**

```bash
git add Código.gs
git commit -m "feat(telegram): notifica transferências, vendas e lançamentos diretos; migra alerta de atraso"
```

---

### Task 7: Cache bump + passo de deploy (setWebhook)

**Files:**
- Modify: `Código.gs` — `_getPageContent` e `limparCachePaginas` (chave `pg_html_v12t_`)
- Modify: skill `deploy-teste` (adicionar passo de `setWebhook`)

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Bump da chave de cache de páginas**

Buscar as duas ocorrências de `pg_html_v12t_` em `Código.gs` e trocar para `pg_html_v12u_` (bump de letra, seguindo o padrão já usado no histórico do projeto — v12n → v12t → v12u).

- [ ] **Step 2: Documentar o passo de `setWebhook` na skill de deploy**

Abrir `.claude/skills/deploy-teste/SKILL.md` (ou arquivo equivalente da skill `deploy-teste` referenciada em `CLAUDE.md`). Adicionar, como passo final do fluxo (só necessário na primeira vez que o Telegram é configurado, ou se o token/URL do Web App mudar):

```
## Registrar webhook do Telegram (só quando token/URL mudam)

Depois de publicar o Web App e salvar token+Chat ID na aba Telegram de Configurações:

1. Pegar a URL do Web App publicado e o `webhookSecret` salvo (visível só via
   `PropertiesService` — se precisar, ler com `Logger.log(PropertiesService.getScriptProperties().getProperty('cdv_webhook_conf'))`
   no editor Apps Script).
2. Chamar (uma vez, no navegador ou via `curl`):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_WEBAPP>?secret=<SECRET>`
3. Confirmar resposta `{"ok":true,"result":true,...}`.
```

- [ ] **Step 3: Commit**

```bash
git add Código.gs .claude/skills/deploy-teste/SKILL.md
git commit -m "chore(telegram): bump cache de páginas e documenta registro do webhook no deploy"
```

- [ ] **Step 4: Verificação manual end-to-end (pós-deploy, com bot real)**

Não automatizável — pedir ao usuário, depois do deploy completo (`clasp push` + publicar + `setWebhook`):
1. Salvar token/Chat ID na aba Telegram, clicar "Criar tópicos", confirmar os 4 tópicos aparecem no grupo.
2. Clicar "Testar agora", confirmar mensagem chega no tópico Sistema/Alertas.
3. Criar um lançamento com aprovação ativa, confirmar mensagem com botões chega no tópico Aprovações.
4. Clicar "✅ Aprovar", confirmar mensagem edita para "Aprovado" e o lançamento aparece na planilha.
5. Repetir um lançamento, clicar "❌ Reprovar", responder (reply) com um motivo, confirmar mensagem edita para "Reprovado" com o motivo e o solicitante recebe e-mail.

---

## Ordem de execução

Tasks 1→7 em sequência — cada uma depende da anterior (Task 1 é a fundação de tudo; Task 4 depende do `doPost` da Task 3; Task 5 depende do fluxo de aprovar da Task 4; Task 6 só migra call-sites, pode rodar a qualquer momento depois da Task 1, mas fica melhor por último para não competir com o `doPost` ainda incompleto).
