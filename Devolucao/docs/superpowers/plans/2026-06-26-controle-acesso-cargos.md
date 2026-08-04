# Controle de Acesso e Permissões por Cargos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o sistema de permissões por e-mail por um sistema de cargos (roles), consolidando as 3 telas separadas de acesso em um único hub com abas em FormConfiguracoes.html, com funções de backend em Código.gs e enforcement nos Forms afetados.

**Architecture:** Backend em Código.gs expõe 7 novas funções via `google.script.run`, armazenando cargos e vínculos email→cargo em PropertiesService. FormConfiguracoes.html recebe um novo hub `screen-acesso-hub` com 3 abas (Acesso, Cargos, Usuários) substituindo os 3 cards e telas separadas. Cada Form afetado chama `obterPermissoesUsuario` no init e aplica RO ou bloqueio de acesso conforme o retorno.

**Tech Stack:** Google Apps Script (GAS), HTML/CSS/JS vanilla, PropertiesService para persistência, `google.script.run` para comunicação frontend→backend.

## Global Constraints

- Sem imports — GAS não usa módulos
- Todas as funções públicas no Código.gs ficam automaticamente disponíveis via `google.script.run`
- PropertiesService é síncrono no backend, assíncrono no frontend (via `google.script.run`)
- Não há framework de testes — verificação é manual no Apps Script editor e no navegador
- Manter padrão de retorno `JSON.stringify({ ok/erro })` em todas as funções backend
- Não remover funções existentes (`verificarAcessoModulo`, `salvarAdminsConfig` etc.) — apenas adicionar novas
- IDs de cargo: `Date.now().toString(36)` (string curta, única por timestamp)
- `_usuarioEhAdmin()` já existe e permanece sem alteração
- `_KEY_READONLY = 'cdv_modo_somente_leitura'` já existe — usar essa chave exata
- Design system: variáveis CSS `var(--navy)`, `var(--surface)`, `var(--border-def)`, `var(--text)`, `var(--r-sm)`, `var(--r)`, `var(--green)`, `var(--red)`, `var(--text-muted)`

---

### Task 1: Backend — Chaves de propriedade e funções CRUD de cargos e usuários

**Files:**
- Modify: `Código.gs` (seção de chaves globais ~linha 87 e seção de administradores ~linha 6103)

**Interfaces:**
- Produces:
  - `obterCargos() → JSON string: { cargos: CargoItem[] } | { erro }`
  - `salvarCargo(id, nome, modulos, somenteLeitura) → JSON string: { ok } | { erro }`
  - `excluirCargo(id) → JSON string: { ok } | { erro }`
  - `obterUsuariosCargos() → JSON string: { usuarios: UsuarioItem[] } | { erro }`
  - `salvarUsuarioCargo(email, cargoId) → JSON string: { ok } | { erro }`
  - `removerUsuarioCargo(email) → JSON string: { ok } | { erro }`
  - `CargoItem = { id: string, nome: string, modulos: string[], somenteLeitura: bool }`
  - `UsuarioItem = { email: string, cargoId: string }`

- [ ] **Step 1: Adicionar constantes de chave logo após `_KEY_ADMINS_CONFIG`**

  Localizar a linha `var _KEY_ADMINS_CONFIG = 'cdv_admins_config';` em Código.gs e adicionar logo abaixo:

  ```javascript
  var _KEY_CARGOS   = 'cdv_cargos';    // JSON: CargoItem[]
  var _KEY_USUARIOS = 'cdv_usuarios';  // JSON: UsuarioItem[]
  ```

- [ ] **Step 2: Adicionar funções de cargos no final da seção `// ─── ADMINISTRADORES ─────────────────────────────────────────`**

  Localizar `function salvarAdminsConfig(params)` e adicionar após seu bloco de fechamento `}`:

  ```javascript
  // ─── CARGOS ──────────────────────────────────────────────────

  function obterCargos() {
    if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CARGOS) || '[]';
    return JSON.stringify({ cargos: JSON.parse(raw) });
  }

  function salvarCargo(id, nome, modulos, somenteLeitura) {
    if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
    try {
      var props = PropertiesService.getScriptProperties();
      var lista = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
      var novoId = id || Date.now().toString(36);
      var cargo  = {
        id: novoId,
        nome: String(nome || '').trim(),
        modulos: Array.isArray(modulos) ? modulos : [],
        somenteLeitura: !!somenteLeitura
      };
      if (!cargo.nome) return JSON.stringify({ erro: '❌ Nome do cargo é obrigatório.' });
      var idx = lista.map(function(c){ return c.id; }).indexOf(novoId);
      if (idx >= 0) { lista[idx] = cargo; } else { lista.push(cargo); }
      props.setProperty(_KEY_CARGOS, JSON.stringify(lista));
      return JSON.stringify({ ok: '✅ Cargo salvo.', id: novoId });
    } catch(e) { return JSON.stringify({ erro: e.toString() }); }
  }

  function excluirCargo(id) {
    if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
    try {
      var props    = PropertiesService.getScriptProperties();
      var usuarios = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
      var em_uso   = usuarios.filter(function(u){ return u.cargoId === id; });
      if (em_uso.length) {
        return JSON.stringify({ erro: '⚠️ Cargo em uso por ' + em_uso.length + ' usuário(s). Remova os vínculos antes de excluir.' });
      }
      var lista = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
      lista = lista.filter(function(c){ return c.id !== id; });
      props.setProperty(_KEY_CARGOS, JSON.stringify(lista));
      return JSON.stringify({ ok: '✅ Cargo excluído.' });
    } catch(e) { return JSON.stringify({ erro: e.toString() }); }
  }

  // ─── USUÁRIOS ─────────────────────────────────────────────────

  function obterUsuariosCargos() {
    if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_USUARIOS) || '[]';
    return JSON.stringify({ usuarios: JSON.parse(raw) });
  }

  function salvarUsuarioCargo(email, cargoId) {
    if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
    try {
      var emailNorm = String(email || '').trim().toLowerCase();
      if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
        return JSON.stringify({ erro: '❌ E-mail inválido.' });
      }
      var props = PropertiesService.getScriptProperties();
      // Verificar se cargoId existe
      var cargos = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
      if (!cargos.some(function(c){ return c.id === cargoId; })) {
        return JSON.stringify({ erro: '❌ Cargo não encontrado.' });
      }
      var lista = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
      var idx = lista.map(function(u){ return u.email; }).indexOf(emailNorm);
      if (idx >= 0) { lista[idx].cargoId = cargoId; } else { lista.push({ email: emailNorm, cargoId: cargoId }); }
      props.setProperty(_KEY_USUARIOS, JSON.stringify(lista));
      return JSON.stringify({ ok: '✅ Usuário vinculado.' });
    } catch(e) { return JSON.stringify({ erro: e.toString() }); }
  }

  function removerUsuarioCargo(email) {
    if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
    try {
      var emailNorm = String(email || '').trim().toLowerCase();
      var props = PropertiesService.getScriptProperties();
      var lista = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
      lista = lista.filter(function(u){ return u.email !== emailNorm; });
      props.setProperty(_KEY_USUARIOS, JSON.stringify(lista));
      return JSON.stringify({ ok: '✅ Vínculo removido.' });
    } catch(e) { return JSON.stringify({ erro: e.toString() }); }
  }
  ```

- [ ] **Step 3: Verificar no Apps Script Editor**

  - Abrir Apps Script editor → executar `obterCargos` manualmente
  - Resultado esperado: `{"cargos":[]}`
  - Executar `salvarCargo('', 'Teste', ['notas'], false)` → `{"ok":"✅ Cargo salvo.","id":"<id>"}`
  - Executar `obterCargos()` → lista com o cargo criado
  - Executar `excluirCargo('<id>')` → `{"ok":"✅ Cargo excluído."}`

- [ ] **Step 4: Commit**

  ```bash
  git add "Código.gs"
  git commit -m "feat(backend): adicionar CRUD de cargos e vínculos email→cargo"
  ```

---

### Task 2: Backend — `obterPermissoesUsuario`

**Files:**
- Modify: `Código.gs` (logo após as funções de Task 1)

**Interfaces:**
- Consumes:
  - `_usuarioEhAdmin()` — já existe
  - `_KEY_READONLY = 'cdv_modo_somente_leitura'` — já existe
  - `_KEY_CARGOS`, `_KEY_USUARIOS` — definidos em Task 1
- Produces:
  - `obterPermissoesUsuario(email?) → JSON string: { admin: bool, modulos: string[], somenteLeitura: bool }`
  - `modulos` é sempre um array de strings de `['notas','lancamento','email','frete','configuracoes','auditoria']`

- [ ] **Step 1: Adicionar `obterPermissoesUsuario` logo após `removerUsuarioCargo`**

  ```javascript
  // ─── RESOLUÇÃO DE PERMISSÕES ──────────────────────────────────

  var _TODOS_MODULOS = ['notas','lancamento','email','frete','configuracoes','auditoria'];

  function obterPermissoesUsuario(email) {
    try {
      var emailNorm = String(email || Session.getActiveUser().getEmail() || '').trim().toLowerCase();

      // 1. Admin tem acesso total
      if (_usuarioEhAdmin()) {
        return JSON.stringify({ admin: true, modulos: _TODOS_MODULOS, somenteLeitura: false });
      }

      var props = PropertiesService.getScriptProperties();

      // 2. RO global ativado — todos ficam em leitura, exceto admins (já tratado acima)
      if (props.getProperty(_KEY_READONLY) === 'true') {
        return JSON.stringify({ admin: false, modulos: _TODOS_MODULOS, somenteLeitura: true });
      }

      // 3. Usuário tem cargo vinculado?
      var usuarios = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
      var vinculo  = null;
      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].email === emailNorm) { vinculo = usuarios[i]; break; }
      }
      if (vinculo) {
        var cargos = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
        for (var j = 0; j < cargos.length; j++) {
          if (cargos[j].id === vinculo.cargoId) {
            return JSON.stringify({
              admin: false,
              modulos: cargos[j].modulos || [],
              somenteLeitura: !!cargos[j].somenteLeitura
            });
          }
        }
      }

      // 4. Sem cargo — visualizador padrão (todos os módulos, somente leitura)
      return JSON.stringify({ admin: false, modulos: _TODOS_MODULOS, somenteLeitura: true });
    } catch(e) {
      return JSON.stringify({ admin: false, modulos: [], somenteLeitura: true });
    }
  }
  ```

- [ ] **Step 2: Verificar no Apps Script Editor**

  - Executar `obterPermissoesUsuario('')` (sem email) como admin → `{"admin":true,"modulos":[...],"somenteLeitura":false}`
  - Ativar modo RO (`salvarModoSomenteLeitura(true)`) e executar com e-mail de não-admin → `{"admin":false,"modulos":[...],"somenteLeitura":true}`
  - Desativar RO, criar cargo com `salvarCargo('', 'Auditor', ['notas'], true)`, vincular com `salvarUsuarioCargo('teste@x.com', '<id>')`, executar `obterPermissoesUsuario('teste@x.com')` → `{"admin":false,"modulos":["notas"],"somenteLeitura":true}`
  - Limpar dados de teste

- [ ] **Step 3: Commit**

  ```bash
  git add "Código.gs"
  git commit -m "feat(backend): adicionar obterPermissoesUsuario com lógica admin > RO global > cargo > visualizador"
  ```

---

### Task 3: FormConfiguracoes — Hub estrutural e aba Acesso

**Files:**
- Modify: `FormConfiguracoes.html`

**Interfaces:**
- Consumes: `obterAdminsConfig()`, `salvarAdminsConfig(params)`, `obterModoSomenteLeitura()`, `salvarModoSomenteLeitura(ativo)` — já existem
- Produces: `screen-acesso-hub` com tab-bar, aba `acesso-hub-tab-acesso` funcional

- [ ] **Step 1: Substituir os 3 cards no `screen-sel` por 1 card**

  Localizar e remover os três blocos:
  ```html
  <div class="sel-card" onclick="irPara('acesso')">...</div>
  <div class="sel-card" onclick="irPara('readonly')">...</div>
  <div class="sel-card" onclick="irPara('permissoes')">...</div>
  ```

  Substituir pelos 3 juntos com 1 único card:
  ```html
  <div class="sel-card" onclick="irPara('acesso-hub')">
    <div class="icone-box">🔐</div>
    <div class="txt">
      <strong>Controle de Acesso e Permissões</strong>
      <span>Administradores, cargos, usuários e modo leitura</span>
    </div>
  </div>
  ```

- [ ] **Step 2: Remover as 3 telas antigas**

  Remover completamente:
  - `<div id="screen-acesso" class="screen">...</div>` (tela 7 — Controle de Acesso)
  - `<div id="screen-readonly" class="screen">...</div>` (Modo Somente-Leitura)
  - `<div id="screen-permissoes" class="screen">...</div>` (Permissões por Módulo)

- [ ] **Step 3: Adicionar `screen-acesso-hub` com 3 abas + aba Acesso preenchida**

  Adicionar após a última tela removida:

  ```html
  <!-- ════ TELA — CONTROLE DE ACESSO E PERMISSÕES (hub) ════ -->
  <div id="screen-acesso-hub" class="screen">
    <div class="titulo">
      <button class="back" onclick="voltar()">← Voltar</button>
      🔐 Controle de Acesso e Permissões <span class="badge">SEGURANÇA</span>
    </div>
    <div class="tab-bar">
      <button class="tab-btn ativa" data-tab="acesso" onclick="mudarTab('acesso-hub','acesso',this)">🔐 Acesso</button>
      <button class="tab-btn" data-tab="cargos" onclick="mudarTab('acesso-hub','cargos',this);_carregarCargos()">🏷️ Cargos</button>
      <button class="tab-btn" data-tab="usuarios" onclick="mudarTab('acesso-hub','usuarios',this);_carregarUsuarios()">👤 Usuários</button>
    </div>

    <!-- Aba: Acesso -->
    <div id="acesso-hub-tab-acesso" class="tab-pane ativo">
      <!-- Seção: Administradores -->
      <div class="secao-email">
        <div class="sec-titulo">👑 Dono da planilha (acesso permanente)</div>
        <div id="acesso-dono" class="tags-box">⏳ Carregando...</div>
      </div>
      <div class="secao-email">
        <div class="sec-titulo">🔐 Administradores adicionais</div>
        <div class="tags-box" id="tags-admin"></div>
        <div class="linha2">
          <div class="campo" style="margin-bottom:0">
            <input type="email" id="inp-admin" placeholder="responsavel@empresa.com.br"
                   onkeydown="if(event.key==='Enter') addAdmin()">
          </div>
          <div><button class="btn-sec" onclick="addAdmin()">+ Adicionar</button></div>
        </div>
      </div>
      <div class="botoes">
        <button class="btn-principal" id="ac-btn" onclick="salvarAdmins()">💾 Salvar Administradores</button>
      </div>
      <div class="spinner" id="ac-spin"><div class="spin-ring"></div>Salvando...</div>
      <div class="msg" id="ac-msg"></div>

      <!-- Seção: Modo Somente-Leitura Global -->
      <div style="margin-top:18px">
        <div class="secao-email">
          <div class="sec-titulo">🔒 Modo Somente-Leitura Global</div>
          <div class="info" style="margin-bottom:10px">
            Quando ativado, todos os cargos ficam em modo leitura.
            <strong>Admins mantêm acesso pleno.</strong>
          </div>
          <div style="background:var(--surface);border:1.5px solid var(--border-def);border-radius:var(--r);
                      padding:14px 16px;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px">
                🔒 Modo somente-leitura
              </div>
              <div style="font-size:11px;color:var(--text-muted)" id="ro-status-txt">Verificando...</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="ro-toggle" onchange="alterarModoRO(this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="msg" id="ro-msg"></div>
        </div>
      </div>
    </div>

    <!-- Aba: Cargos (HTML preenchido em Task 4) -->
    <div id="acesso-hub-tab-cargos" class="tab-pane">
      <div id="cargos-content">⏳ Carregando...</div>
    </div>

    <!-- Aba: Usuários (HTML preenchido em Task 5) -->
    <div id="acesso-hub-tab-usuarios" class="tab-pane">
      <div id="usuarios-content">⏳ Carregando...</div>
    </div>
  </div>
  ```

- [ ] **Step 4: Atualizar o roteamento em `irPara` e `mudarTab`**

  Localizar no JS de FormConfiguracoes.html as linhas que lidam com `acesso`, `readonly`, `permissoes`:

  ```javascript
  // Localizar e substituir:
  if (tela === 'permissoes') carregarPermissoes();
  // ...
  if (tela === 'acesso')     carregarAdminsConfig();
  if (tela === 'readonly')   carregarModoRO();
  ```

  Substituir por:
  ```javascript
  if (tela === 'acesso-hub') { mudarTab('acesso-hub','acesso'); carregarAdminsConfig(); carregarModoRO(); }
  ```

  Adicionar também em `mudarTab`:
  ```javascript
  if (hub === 'acesso-hub' && aba === 'acesso') { carregarAdminsConfig(); carregarModoRO(); }
  ```

- [ ] **Step 5: Verificar no navegador**

  - Abrir FormConfiguracoes → card "Controle de Acesso e Permissões" aparece substituindo os 3 antigos
  - Clicar → abre hub com 3 abas (Acesso, Cargos, Usuários)
  - Aba Acesso: admins carregam, toggle RO aparece e funciona
  - Abas Cargos e Usuários: mostram "⏳ Carregando..." (serão preenchidas nas próximas tasks)

- [ ] **Step 6: Commit**

  ```bash
  git add "FormConfiguracoes.html"
  git commit -m "feat(config): consolidar acesso/readonly/permissoes em screen-acesso-hub com 3 abas"
  ```

---

### Task 4: FormConfiguracoes — Aba Cargos (HTML + JS)

**Files:**
- Modify: `FormConfiguracoes.html`

**Interfaces:**
- Consumes: `obterCargos()`, `salvarCargo(id, nome, modulos, somenteLeitura)`, `excluirCargo(id)` — Task 1
- Produces: aba Cargos funcional com form de criação, lista de cargos, edição inline, exclusão com aviso

- [ ] **Step 1: Substituir o placeholder da aba Cargos pelo HTML completo**

  Localizar `<div id="acesso-hub-tab-cargos" class="tab-pane">` e substituir seu conteúdo:

  ```html
  <div id="acesso-hub-tab-cargos" class="tab-pane">
    <!-- Form de criação / edição -->
    <div class="secao-email" id="cargo-form-wrap">
      <div class="sec-titulo" id="cargo-form-titulo">➕ Novo Cargo</div>
      <div class="campo">
        <label>Nome do cargo</label>
        <input type="text" id="cargo-nome" placeholder="Ex: Auditor, Operador, Visualizador">
        <input type="hidden" id="cargo-edit-id" value="">
      </div>
      <div class="campo">
        <label>Módulos permitidos</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;cursor:pointer">
            <input type="checkbox" class="cargo-mod" value="notas"> Notas Lançadas
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;cursor:pointer">
            <input type="checkbox" class="cargo-mod" value="lancamento"> Lançamento
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;cursor:pointer">
            <input type="checkbox" class="cargo-mod" value="email"> E-mail de Devolução
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;cursor:pointer">
            <input type="checkbox" class="cargo-mod" value="frete"> Programar Frete
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;cursor:pointer">
            <input type="checkbox" class="cargo-mod" value="configuracoes"> Configurações
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;cursor:pointer">
            <input type="checkbox" class="cargo-mod" value="auditoria"> Auditoria
          </label>
        </div>
      </div>
      <div class="campo">
        <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer">
          <input type="checkbox" id="cargo-ro"> <strong>Somente leitura</strong>
          <span style="font-size:11px;color:var(--text-muted)">(pode ver, não pode criar/editar/enviar)</span>
        </label>
      </div>
      <div class="botoes">
        <button class="btn-principal" id="cargo-btn-salvar" onclick="_salvarCargo()">✅ Criar Cargo</button>
        <button class="btn-cancel" id="cargo-btn-cancel" style="display:none" onclick="_cancelarEdicaoCargo()">✖ Cancelar</button>
      </div>
      <div class="msg" id="cargo-msg"></div>
    </div>

    <!-- Lista de cargos -->
    <div id="cargos-lista" style="margin-top:4px"></div>

    <!-- Aviso padrão -->
    <div class="info" style="margin-top:12px">
      💡 Usuários sem cargo atribuído operam como <strong>Visualizador</strong> — acesso a todos os módulos, somente leitura.
    </div>
  </div>
  ```

- [ ] **Step 2: Adicionar variáveis e funções JS de cargos**

  Localizar a seção de JS (antes do fechamento `</script>`) e adicionar:

  ```javascript
  // ════ CARGOS ══════════════════════════════════════════════════
  var _cargosLocal = [];
  var _MOD_LABELS  = { notas:'Notas', lancamento:'Lançamento', email:'E-mail', frete:'Frete', configuracoes:'Config', auditoria:'Auditoria' };

  function _carregarCargos() {
    document.getElementById('cargos-lista').innerHTML = '<div style="color:var(--text-muted);font-size:11px">Carregando...</div>';
    google.script.run
      .withSuccessHandler(function(resp) {
        var r = JSON.parse(resp);
        if (r.erro) { document.getElementById('cargos-lista').innerHTML = '<div style="color:var(--red);font-size:12px">❌ '+esc(r.erro)+'</div>'; return; }
        _cargosLocal = r.cargos || [];
        _renderCargos();
      })
      .withFailureHandler(function(e) { document.getElementById('cargos-lista').innerHTML = '<div style="color:var(--red);font-size:12px">❌ '+e.message+'</div>'; })
      .obterCargos();
  }

  function _renderCargos() {
    var el = document.getElementById('cargos-lista');
    if (!_cargosLocal.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Nenhum cargo criado ainda.</div>';
      return;
    }
    el.innerHTML = _cargosLocal.map(function(c) {
      var badges = c.modulos.map(function(m) {
        return '<span style="background:var(--navy-50);color:var(--navy);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">'+esc(_MOD_LABELS[m]||m)+'</span>';
      }).join(' ');
      var roIcon = c.somenteLeitura ? ' <span style="font-size:11px;color:var(--text-muted)">🔒 RO</span>' : '';
      return '<div style="background:var(--surface);border:1px solid var(--border-def);border-radius:var(--r);padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<strong style="font-size:13px;color:var(--text);flex:1;min-width:80px">'+esc(c.nome)+roIcon+'</strong>'
        + '<div style="display:flex;gap:4px;flex-wrap:wrap;flex:2">'+badges+'</div>'
        + '<div style="display:flex;gap:4px;flex-shrink:0">'
        + '<button class="btn-acao" onclick="_iniciarEdicaoCargo(\''+esc(c.id)+'\')">✏️ Editar</button>'
        + '<button class="btn-acao" style="color:var(--red);border-color:var(--red)" onclick="_excluirCargo(\''+esc(c.id)+'\',\''+esc(c.nome)+'\')">🗑️ Excluir</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function _salvarCargo() {
    var nome = (document.getElementById('cargo-nome').value || '').trim();
    var id   = document.getElementById('cargo-edit-id').value || '';
    var mods = Array.from(document.querySelectorAll('.cargo-mod:checked')).map(function(cb){ return cb.value; });
    var ro   = document.getElementById('cargo-ro').checked;
    if (!nome) { showMsg('cargo','erro','❌ Informe o nome do cargo.'); return; }
    document.getElementById('cargo-btn-salvar').disabled = true;
    google.script.run
      .withSuccessHandler(function(resp) {
        var r = JSON.parse(resp);
        document.getElementById('cargo-btn-salvar').disabled = false;
        showMsg('cargo', r.ok ? 'ok' : 'erro', r.ok || r.erro);
        if (r.ok) { _limparFormCargo(); _carregarCargos(); }
      })
      .withFailureHandler(function(e) { document.getElementById('cargo-btn-salvar').disabled = false; showMsg('cargo','erro','❌ '+e.message); })
      .salvarCargo(id, nome, mods, ro);
  }

  function _iniciarEdicaoCargo(id) {
    var cargo = _cargosLocal.filter(function(c){ return c.id === id; })[0];
    if (!cargo) return;
    document.getElementById('cargo-nome').value    = cargo.nome;
    document.getElementById('cargo-edit-id').value = cargo.id;
    document.getElementById('cargo-ro').checked    = !!cargo.somenteLeitura;
    document.querySelectorAll('.cargo-mod').forEach(function(cb){ cb.checked = cargo.modulos.indexOf(cb.value) !== -1; });
    document.getElementById('cargo-form-titulo').textContent = '✏️ Editar Cargo';
    document.getElementById('cargo-btn-salvar').textContent  = '💾 Salvar Alterações';
    document.getElementById('cargo-btn-cancel').style.display = '';
    document.getElementById('cargo-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _cancelarEdicaoCargo() {
    _limparFormCargo();
  }

  function _limparFormCargo() {
    document.getElementById('cargo-nome').value    = '';
    document.getElementById('cargo-edit-id').value = '';
    document.getElementById('cargo-ro').checked    = false;
    document.querySelectorAll('.cargo-mod').forEach(function(cb){ cb.checked = false; });
    document.getElementById('cargo-form-titulo').textContent  = '➕ Novo Cargo';
    document.getElementById('cargo-btn-salvar').textContent   = '✅ Criar Cargo';
    document.getElementById('cargo-btn-cancel').style.display = 'none';
    document.getElementById('cargo-msg').style.display        = 'none';
  }

  function _excluirCargo(id, nome) {
    if (!confirm('Excluir o cargo "' + nome + '"?\n\nCertifique-se de que não há usuários vinculados a ele.')) return;
    google.script.run
      .withSuccessHandler(function(resp) {
        var r = JSON.parse(resp);
        showMsg('cargo', r.ok ? 'ok' : 'erro', r.ok || r.erro);
        if (r.ok) _carregarCargos();
      })
      .withFailureHandler(function(e) { showMsg('cargo','erro','❌ '+e.message); })
      .excluirCargo(id);
  }
  ```

- [ ] **Step 3: Verificar no navegador**

  - Abrir aba Cargos → formulário aparece
  - Criar cargo "Auditor" com Notas + Auditoria + RO = true → aparece na lista com badges e 🔒
  - Clicar ✏️ Editar → form preenche com dados do cargo, título muda para "✏️ Editar Cargo"
  - Clicar Cancelar → form limpa
  - Clicar 🗑️ Excluir → confirmar → cargo some da lista

- [ ] **Step 4: Commit**

  ```bash
  git add "FormConfiguracoes.html"
  git commit -m "feat(config): aba Cargos com CRUD de roles, módulos e flag somente-leitura"
  ```

---

### Task 5: FormConfiguracoes — Aba Usuários (HTML + JS)

**Files:**
- Modify: `FormConfiguracoes.html`

**Interfaces:**
- Consumes:
  - `obterUsuariosCargos()` → `{ usuarios: UsuarioItem[] }` — Task 1
  - `salvarUsuarioCargo(email, cargoId)` → `{ ok } | { erro }` — Task 1
  - `removerUsuarioCargo(email)` → `{ ok } | { erro }` — Task 1
  - `_cargosLocal` — populado por `_carregarCargos()` (Task 4)
  - `obterCargos()` — Task 1 (chamado independentemente para popular o dropdown)
- Produces: aba Usuários funcional com form de vínculo, lista de usuários com badges coloridos por cargo

- [ ] **Step 1: Substituir o placeholder da aba Usuários pelo HTML completo**

  Localizar `<div id="acesso-hub-tab-usuarios" class="tab-pane">` e substituir conteúdo:

  ```html
  <div id="acesso-hub-tab-usuarios" class="tab-pane">
    <div class="secao-email">
      <div class="sec-titulo">👤 Vincular Usuário a Cargo</div>
      <div class="linha2">
        <div class="campo" style="margin-bottom:0;flex:2">
          <input type="email" id="usr-email" placeholder="usuario@empresa.com.br"
                 onkeydown="if(event.key==='Enter') _adicionarUsuario()">
        </div>
        <div class="campo" style="margin-bottom:0;flex:1">
          <select id="usr-cargo-sel" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-def);border-radius:var(--r-sm);font-size:12px;background:var(--input-bg);color:var(--text)">
            <option value="">— Selecionar cargo —</option>
          </select>
        </div>
        <div style="flex-shrink:0;padding-top:1px">
          <button class="btn-sec" onclick="_adicionarUsuario()">+ Adicionar</button>
        </div>
      </div>
      <div class="msg" id="usr-msg" style="margin-top:8px"></div>
    </div>

    <div id="usuarios-lista" style="margin-top:4px"></div>

    <div class="info" style="margin-top:12px">
      💡 Usuários não listados aqui operam como <strong>Visualizador</strong> (somente leitura) por padrão.
    </div>
  </div>
  ```

- [ ] **Step 2: Adicionar variáveis e funções JS de usuários**

  Adicionar após o bloco de funções de cargos (Task 4):

  ```javascript
  // ════ USUÁRIOS ═════════════════════════════════════════════════
  var _usuariosLocal = [];
  var _CARGO_COLORS  = ['#DBEAFE','#DCFCE7','#FEF9C3','#FAE8FF','#FFEDD5','#CFFAFE','#FFE4E6','#F1F5F9'];
  var _CARGO_TEXT_COLORS = ['#1E40AF','#166534','#854D0E','#6B21A8','#9A3412','#0E7490','#9F1239','#334155'];

  function _carregarUsuarios() {
    document.getElementById('usuarios-lista').innerHTML = '<div style="color:var(--text-muted);font-size:11px">Carregando...</div>';
    // Carregar cargos para o dropdown (se ainda não carregados)
    google.script.run
      .withSuccessHandler(function(resp) {
        var r = JSON.parse(resp);
        if (!r.erro) {
          _cargosLocal = r.cargos || [];
          _renderCargoDropdown();
        }
      })
      .obterCargos();

    google.script.run
      .withSuccessHandler(function(resp) {
        var r = JSON.parse(resp);
        if (r.erro) { document.getElementById('usuarios-lista').innerHTML = '<div style="color:var(--red);font-size:12px">❌ '+esc(r.erro)+'</div>'; return; }
        _usuariosLocal = r.usuarios || [];
        _renderUsuarios();
      })
      .withFailureHandler(function(e) { document.getElementById('usuarios-lista').innerHTML = '<div style="color:var(--red);font-size:12px">❌ '+e.message+'</div>'; })
      .obterUsuariosCargos();
  }

  function _renderCargoDropdown() {
    var sel = document.getElementById('usr-cargo-sel');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Selecionar cargo —</option>'
      + _cargosLocal.map(function(c) {
          return '<option value="'+esc(c.id)+'">'+esc(c.nome)+(c.somenteLeitura?' 🔒':'')+'</option>';
        }).join('');
  }

  function _renderUsuarios() {
    var el = document.getElementById('usuarios-lista');
    if (!_usuariosLocal.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Nenhum usuário vinculado.</div>';
      return;
    }
    el.innerHTML = _usuariosLocal.map(function(u, i) {
      var cargo = _cargosLocal.filter(function(c){ return c.id === u.cargoId; })[0];
      var cargoNome = cargo ? cargo.nome : '(cargo removido)';
      var ci   = _cargosLocal.indexOf(cargo);
      var colorIdx = ci >= 0 ? ci % _CARGO_COLORS.length : _CARGO_COLORS.length - 1;
      var badge = '<span style="background:'+_CARGO_COLORS[colorIdx]+';color:'+_CARGO_TEXT_COLORS[colorIdx]+';border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700">'+esc(cargoNome)+'</span>';
      return '<div style="background:var(--surface);border:1px solid var(--border-def);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px">'
        + '<span style="font-size:12px;color:var(--text);flex:1">'+esc(u.email)+'</span>'
        + badge
        + '<button class="btn-acao" style="color:var(--red);border-color:var(--red);flex-shrink:0" onclick="_removerUsuario(\''+esc(u.email)+'\')">🗑️</button>'
        + '</div>';
    }).join('');
  }

  function _adicionarUsuario() {
    var email   = (document.getElementById('usr-email').value || '').trim().toLowerCase();
    var cargoId = document.getElementById('usr-cargo-sel').value;
    if (!email) { showMsg('usr','erro','❌ Informe o e-mail.'); return; }
    if (!cargoId) { showMsg('usr','erro','❌ Selecione um cargo.'); return; }
    google.script.run
      .withSuccessHandler(function(resp) {
        var r = JSON.parse(resp);
        showMsg('usr', r.ok ? 'ok' : 'erro', r.ok || r.erro);
        if (r.ok) {
          document.getElementById('usr-email').value = '';
          document.getElementById('usr-cargo-sel').value = '';
          _carregarUsuarios();
        }
      })
      .withFailureHandler(function(e) { showMsg('usr','erro','❌ '+e.message); })
      .salvarUsuarioCargo(email, cargoId);
  }

  function _removerUsuario(email) {
    if (!confirm('Remover vínculo de "' + email + '"?\nEle passará a operar como Visualizador.')) return;
    google.script.run
      .withSuccessHandler(function(resp) {
        var r = JSON.parse(resp);
        showMsg('usr', r.ok ? 'ok' : 'erro', r.ok || r.erro);
        if (r.ok) _carregarUsuarios();
      })
      .withFailureHandler(function(e) { showMsg('usr','erro','❌ '+e.message); })
      .removerUsuarioCargo(email);
  }
  ```

- [ ] **Step 3: Verificar no navegador**

  - Abrir aba Usuários → dropdown lista os cargos criados
  - Vincular um e-mail a um cargo → aparece na lista com badge colorido
  - Remover → some da lista com confirm
  - Abrir aba Cargos, excluir cargo com usuário vinculado → erro "⚠️ Cargo em uso por 1 usuário(s)"

- [ ] **Step 4: Commit**

  ```bash
  git add "FormConfiguracoes.html"
  git commit -m "feat(config): aba Usuários com vínculo email→cargo, lista com badges coloridos"
  ```

---

### Task 6: Enforcement nos Forms

**Files:**
- Modify: `FormNotas.html`, `FormLancamento.html`, `FormEmailDevolucao.html`, `FormProgramarFrete.html`, `FormAuditoria.html`

**Interfaces:**
- Consumes: `obterPermissoesUsuario()` → `{ admin: bool, modulos: string[], somenteLeitura: bool }` — Task 2
- Produces: cada form aplica RO ou bloqueio de acesso com base nas permissões do usuário logado

**Padrão a aplicar em cada form:**

O snippet abaixo é o padrão de enforcement. `NOME_MODULO` é o ID do módulo (`notas`, `lancamento`, `email`, `frete`, `auditoria`). Cada form já tem um `init()` — adicionar a chamada ao final do `init()`.

```javascript
// Snippet padrão de enforcement (adaptar NOME_MODULO em cada form)
function _aplicarPermissoes(perm) {
  if (!perm) return;
  // Verificar acesso ao módulo
  if (!perm.admin && perm.modulos.indexOf('NOME_MODULO') === -1) {
    document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;gap:12px;font-family:inherit">'
      + '<div style="font-size:36px">🔒</div>'
      + '<div style="font-size:16px;font-weight:700;color:#07162A">Acesso Negado</div>'
      + '<div style="font-size:13px;color:#53708C;text-align:center;max-width:300px">Você não tem permissão para acessar este módulo. Contate o administrador.</div>'
      + '</div>';
    return;
  }
  // Aplicar modo somente leitura
  if (perm.somenteLeitura) aplicarModoRO(true);
}
```

- [ ] **Step 1: Atualizar FormNotas.html**

  FormNotas já tem `_modoRO` e `aplicarModoRO()` e chama `verificarAcessoModulo('notas')`. Localizar o bloco no final do arquivo:

  ```javascript
  google.script.run
    .withSuccessHandler(function(r){ try { aplicarModoRO(JSON.parse(r).ativo); } catch(_){} })
    .obterModoSomenteLeitura();
  google.script.run
    .withSuccessHandler(function(r){ try { var p=JSON.parse(r); if(p.somenteLeitura) aplicarModoRO(true); } catch(_){} })
    .verificarAcessoModulo('notas');
  ```

  Substituir por:

  ```javascript
  google.script.run
    .withSuccessHandler(function(r){
      try {
        var p = JSON.parse(r);
        if (!p.admin && p.modulos.indexOf('notas') === -1) {
          document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;gap:12px;font-family:inherit">'
            + '<div style="font-size:36px">🔒</div>'
            + '<div style="font-size:16px;font-weight:700;color:#07162A">Acesso Negado</div>'
            + '<div style="font-size:13px;color:#53708C;text-align:center;max-width:300px">Você não tem permissão para acessar este módulo. Contate o administrador.</div>'
            + '</div>';
          return;
        }
        if (p.somenteLeitura) aplicarModoRO(true);
      } catch(_){}
    })
    .obterPermissoesUsuario('');
  ```

- [ ] **Step 2: Adicionar enforcement em FormLancamento.html**

  FormLancamento não tem `_modoRO` nem `aplicarModoRO`. Adicionar antes do fechamento `</script>`:

  ```javascript
  // ── Enforcement de permissões ───────────────────────────────
  var _modoRO_lanc = false;
  function aplicarModoRO(ativo) {
    _modoRO_lanc = ativo;
    if (!ativo) return;
    var banner = document.createElement('div');
    banner.style.cssText = 'background:#FFF7E0;border:1px solid #FCD34D;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400E;margin-bottom:10px;display:flex;align-items:center;gap:8px';
    banner.innerHTML = '🔒 <strong>Modo somente leitura</strong> — você não tem permissão para realizar alterações.';
    document.body.insertBefore(banner, document.body.firstChild);
    document.querySelectorAll('button:not(.btn-cancel):not(.back)').forEach(function(b){ b.disabled = true; });
  }
  try {
    google.script.run
      .withSuccessHandler(function(r){
        try {
          var p = JSON.parse(r);
          if (!p.admin && p.modulos.indexOf('lancamento') === -1) {
            document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;gap:12px;font-family:inherit">'
              + '<div style="font-size:36px">🔒</div>'
              + '<div style="font-size:16px;font-weight:700;color:#07162A">Acesso Negado</div>'
              + '<div style="font-size:13px;color:#53708C;text-align:center;max-width:300px">Você não tem permissão para acessar este módulo. Contate o administrador.</div>'
              + '</div>';
            return;
          }
          if (p.somenteLeitura) aplicarModoRO(true);
        } catch(_){}
      })
      .obterPermissoesUsuario('');
  } catch(_) {}
  ```

- [ ] **Step 3: Adicionar enforcement em FormEmailDevolucao.html**

  Mesmo padrão, módulo `'email'`:

  ```javascript
  // ── Enforcement de permissões ───────────────────────────────
  try {
    google.script.run
      .withSuccessHandler(function(r){
        try {
          var p = JSON.parse(r);
          if (!p.admin && p.modulos.indexOf('email') === -1) {
            document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;gap:12px;font-family:inherit">'
              + '<div style="font-size:36px">🔒</div>'
              + '<div style="font-size:16px;font-weight:700;color:#07162A">Acesso Negado</div>'
              + '<div style="font-size:13px;color:#53708C;text-align:center;max-width:300px">Você não tem permissão para acessar este módulo. Contate o administrador.</div>'
              + '</div>';
            return;
          }
          if (p.somenteLeitura) {
            var banner = document.createElement('div');
            banner.style.cssText = 'background:#FFF7E0;border:1px solid #FCD34D;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400E;margin-bottom:10px;display:flex;align-items:center;gap:8px';
            banner.innerHTML = '🔒 <strong>Modo somente leitura</strong> — você não tem permissão para realizar alterações.';
            document.body.insertBefore(banner, document.body.firstChild);
            document.querySelectorAll('button:not(.btn-cancel):not(.back)').forEach(function(b){ b.disabled = true; });
          }
        } catch(_){}
      })
      .obterPermissoesUsuario('');
  } catch(_) {}
  ```

- [ ] **Step 4: Adicionar enforcement em FormProgramarFrete.html**

  Mesmo padrão, módulo `'frete'` (substituir `'email'` por `'frete'` no snippet do Step 3).

- [ ] **Step 5: Adicionar enforcement em FormAuditoria.html**

  Mesmo padrão, módulo `'auditoria'` (substituir `'email'` por `'auditoria'` no snippet do Step 3).

- [ ] **Step 6: Verificar nos Forms**

  - Criar cargo "Teste" com apenas módulo `notas`
  - Vincular seu próprio e-mail ao cargo (temporariamente)
  - Abrir FormLancamento → deve aparecer tela "Acesso Negado"
  - Abrir FormNotas → deve carregar normalmente
  - Remover vínculo após teste

- [ ] **Step 7: Commit**

  ```bash
  git add "FormNotas.html" "FormLancamento.html" "FormEmailDevolucao.html" "FormProgramarFrete.html" "FormAuditoria.html"
  git commit -m "feat(forms): enforcement de permissões via obterPermissoesUsuario em todos os módulos"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Consolidar 3 telas em hub `screen-acesso-hub` com 3 abas → Tasks 3, 4, 5
- ✅ Criar/editar/excluir cargos com módulos e flag RO → Task 4
- ✅ Vincular emails a cargos → Task 5
- ✅ Admin como conceito separado (dono + lista) → mantido em Task 3 (aba Acesso)
- ✅ RO global que bloqueia todos exceto admins → mantido em Task 3, lógica em Task 2
- ✅ Usuário sem cargo = Visualizador → Task 2 (passo 4 da lógica) + aviso no HTML
- ✅ Enforcement nos forms afetados → Task 6
- ✅ Funções backend com auth check `_usuarioEhAdmin()` → Tasks 1, 2

**Tipos consistentes entre tasks:**
- `CargoItem.id` gerado como `Date.now().toString(36)` — usado em Tasks 1, 4, 5 ✅
- `salvarCargo(id, nome, modulos, somenteLeitura)` — assinatura consistente entre Task 1 (backend) e Task 4 (chamada frontend) ✅
- `obterPermissoesUsuario('')` — string vazia como argumento para usar email da sessão atual ✅

**Placeholders:** nenhum — todo código está completo.
