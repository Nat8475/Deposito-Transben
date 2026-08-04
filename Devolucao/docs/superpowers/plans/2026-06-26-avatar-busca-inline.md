# Avatar do Usuário + Busca Inline no Topbar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir as iniciais coloridas do usuário logado no topbar do Index.html e adicionar busca inline de NF que carrega FormBusca com auto-search via postMessage, removendo FormBusca da sidebar.

**Architecture:** Três alterações independentes: (1) `getEmailUsuario()` no backend GAS, (2) topbar HTML + JS no Index.html com avatar e busca inline, (3) postMessage listener no FormBusca.html. A comunicação entre `_tbSearchKey` (global) e `loadPage` (dentro do IIFE) usa `window._pendingBuscaTermo`.

**Tech Stack:** Google Apps Script (GAS), HTML/CSS/JS vanilla, `google.script.run` para chamadas backend, `postMessage` para comunicação entre Index.html e iframe do FormBusca.

## Global Constraints

- GAS: sem `Array.from()`, sem `NodeList.forEach()` — usar `for` loops ou `Array.prototype.slice.call()`
- Sem novas dependências externas
- CSS: usar variáveis do design system (`var(--slate-100)`, `var(--border-sub)`, `var(--text-muted)`, `var(--r-sm)`, `var(--input-bg)`, `var(--text-str)`, `var(--font)`)
- Funções chamadas via `onclick` no HTML devem ser globais (`window.xxx`) ou definidas fora do IIFE principal
- `window.cdvBuscar` deve ser exposto de dentro do IIFE (onde `cdvNav` e `loadPage` vivem)
- `window._pendingBuscaTermo` é o canal de comunicação entre o código global e o IIFE

---

### Task 1: Código.gs — `getEmailUsuario()`

**Files:**
- Modify: `Código.gs` (adicionar função ao final, próximo a `ping()`)

**Interfaces:**
- Produces: `getEmailUsuario() → string` — retorna o email do usuário ativo da sessão GAS ou `''` em caso de erro

- [ ] **Step 1: Localizar `ping()` em Código.gs**

A função `ping()` está em torno da linha 6188:
```javascript
function ping() {
  return JSON.stringify({ ok: true, ts: new Date().toISOString(), usuario: Session.getActiveUser().getEmail() });
}
```

- [ ] **Step 2: Adicionar `getEmailUsuario()` logo após `ping()`**

```javascript
function getEmailUsuario() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch(_) { return ''; }
}
```

- [ ] **Step 3: Verificar manualmente**

Abrir o GAS, executar `getEmailUsuario()` no editor. Deve retornar o email da conta logada (ex: `datandarosa@gmail.com`).

- [ ] **Step 4: Commit**

```bash
git add "Código.gs"
git commit -m "feat(backend): adicionar getEmailUsuario para o avatar do topbar"
```

---

### Task 2: Index.html — topbar HTML + JS (avatar + busca inline + remoção de Busca do nav)

**Files:**
- Modify: `Index.html`

**Interfaces:**
- Consumes: `getEmailUsuario()` do Task 1 (via `google.script.run`)
- Consumes: `window.cdvNav` (já exposto no IIFE em linha ~954)
- Produces: `window.cdvBuscar(termo)` — navega para FormBusca com auto-search
- Produces: `window._tbSearchOpen/Close/Key` — controlam o expand/collapse do campo de busca
- Produces: `window._pendingBuscaTermo` — canal de comunicação (lido por `loadPage` no IIFE)

**Contexto importante sobre o código existente:**
- IIFE principal: linhas 804–1291 (`(function () { ... })();`)
- `loadPage(p)`: linha ~984 — tem **duas** atribuições de `frm.onload` (cache hit e cache miss)
- `init()`: linha ~1197 — onde ficam as chamadas de init (badge, URL, etc.)
- `window.cdvNav`: linha ~954 — já exposto
- `META` object: linha 813, entrada `Busca` na linha 818
- `NAV` array: linha 832, entrada `Busca` na linha 840
- Topbar `<header id="tb">`: linha 592, fecha em linha 611 (`</header>`)
- Código global (fora do IIFE): começa na linha 1293

- [ ] **Step 1: Remover `Busca` do objeto `META` (linha 818)**

Localizar no IIFE (dentro de `var META = { ... }`):
```javascript
    Busca         : { t: 'Buscar NF / Fornecedor',   s: 'Pesquise lançamentos ativos e o histórico arquivado' },
```
Remover essa linha inteira.

- [ ] **Step 2: Remover `Busca` do array `NAV` (linha ~840)**

Localizar dentro de `{ s: 'Lançamentos', items: [ ... ] }`:
```javascript
      { p: 'Busca',       i: '◯', l: 'Buscar NF / Fornecedor' },
```
Remover essa linha inteira.

- [ ] **Step 3: Adicionar `_cdvBuscaAutoSearch` como função privada no IIFE**

Localizar a função `showErr` (linha ~1039) e adicionar **antes** dela:

```javascript
  /* ── auto-search ao carregar FormBusca via busca inline ── */
  function _cdvBuscaAutoSearch(frm, p) {
    if (!window._pendingBuscaTermo || p !== 'Busca') return;
    var t = window._pendingBuscaTermo;
    window._pendingBuscaTermo = null;
    setTimeout(function() {
      try { frm.contentWindow.postMessage({ cdvAutoSearch: t }, '*'); } catch(_) {}
    }, 120);
  }
```

- [ ] **Step 4: Modificar `loadPage` — path do cache (primeira atribuição de `frm.onload`)**

Localizar dentro de `loadPage`:
```javascript
  if (_pageCache[p]) {
    var frm = document.getElementById('pgf');
    frm.srcdoc = _pageCache[p];
    frm.onload = function () { show('pgf'); };
    show('pgf');
    return;
  }
```

Substituir **apenas a linha do `frm.onload`**:
```javascript
    frm.onload = function () { show('pgf'); _cdvBuscaAutoSearch(frm, p); };
```

- [ ] **Step 5: Modificar `loadPage` — path do cache miss (segunda atribuição de `frm.onload`)**

Localizar dentro do `withSuccessHandler` de `loadPage`:
```javascript
          _pageCache[p] = injectPolyfill(d.html);
          var frm = document.getElementById('pgf');
          frm.srcdoc = _pageCache[p];
          frm.onload = function () { show('pgf'); };
```

Substituir **apenas a linha do `frm.onload`**:
```javascript
          frm.onload = function () { show('pgf'); _cdvBuscaAutoSearch(frm, p); };
```

- [ ] **Step 6: Expor `window.cdvBuscar` no IIFE (perto de `window.cdvNav`)**

Localizar `window.cdvNav = function (p) {` (linha ~954) e adicionar logo após o bloco:

```javascript
  window.cdvBuscar = function(termo) {
    window._pendingBuscaTermo = termo;
    window.cdvNav('Busca');
  };
```

- [ ] **Step 7: Adicionar chamada de init do avatar em `init()`**

Localizar a função `init()` no IIFE. Dentro dela, após o bloco `/* badge de transferências */` (que termina com `.obterBadgeCount();` e `} catch (_) {}`), adicionar:

```javascript
    /* avatar — email do usuário logado */
    try {
      google.script.run
        .withSuccessHandler(function(email) {
          var el = document.getElementById('tb-avatar');
          if (!el) return;
          if (!email) { el.textContent = '?'; return; }
          var cols = ['#1C45D0','#0891B2','#059669','#D97706','#DC2626','#7C3AED','#0E7490','#374151'];
          var user = String(email).split('@')[0];
          var parts = user.split(/[._]/);
          var ini = parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : user.substring(0, 2).toUpperCase() || '?';
          var h = 5381;
          for (var i = 0; i < email.length; i++) { h = ((h << 5) + h) + email.charCodeAt(i); h = h & h; }
          el.style.background = cols[Math.abs(h) % cols.length];
          el.textContent = ini;
          el.title = email;
        })
        .withFailureHandler(function() {})
        .getEmailUsuario();
    } catch(_) {}
```

- [ ] **Step 8: Adicionar HTML do botão de busca + avatar no topbar**

Localizar no HTML (linha ~608-611):
```html
    <button id="btn-dark-idx" onclick="window._toggleDarkIdx()" title="Alternar modo escuro"
      style="background:var(--slate-100);border:1px solid var(--border-sub);color:var(--text-muted);border-radius:var(--r-sm);
             padding:5px 10px;cursor:pointer;font-size:13px;transition:background .15s,color .15s,border-color .15s;font-family:var(--font)">🌙</button>
  </header>
```

Substituir por (mantém o botão dark mode, adiciona search + avatar antes de `</header>`):
```html
    <button id="btn-dark-idx" onclick="window._toggleDarkIdx()" title="Alternar modo escuro"
      style="background:var(--slate-100);border:1px solid var(--border-sub);color:var(--text-muted);border-radius:var(--r-sm);
             padding:5px 10px;cursor:pointer;font-size:13px;transition:background .15s,color .15s,border-color .15s;font-family:var(--font)">🌙</button>
    <button id="tb-search-btn" onclick="window._tbSearchOpen()" title="Buscar NF"
      style="background:var(--slate-100);border:1px solid var(--border-sub);color:var(--text-muted);border-radius:var(--r-sm);
             padding:5px 10px;cursor:pointer;font-size:15px;transition:background .15s,color .15s,border-color .15s;font-family:var(--font)">⌕</button>
    <div id="tb-search-wrap" style="display:none;align-items:center;gap:4px">
      <input id="tb-search-inp" type="text" placeholder="Buscar NF…"
        style="width:200px;padding:5px 10px;border:1px solid var(--border-sub);
               border-radius:var(--r-sm);font:13px var(--font);
               background:var(--input-bg);color:var(--text-str);outline:none"
        onkeydown="window._tbSearchKey(event)">
      <button onclick="window._tbSearchClose()" title="Fechar"
        style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:4px 6px">✕</button>
    </div>
    <div id="tb-avatar"
         style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;
                justify-content:center;font:700 12px/1 var(--font);color:#fff;
                flex-shrink:0;cursor:default;user-select:none;background:#374151"
         title="">??</div>
  </header>
```

- [ ] **Step 9: Adicionar funções globais de busca inline (após o IIFE, linha ~1292)**

Após a linha `})();` que fecha o IIFE principal (linha ~1291) e antes do bloco `// ── Hotkeys de navegação global`, adicionar:

```javascript
// ── Busca inline no topbar ─────────────────────────────
window._pendingBuscaTermo = null;
window._tbSearchOpen = function() {
  document.getElementById('tb-search-btn').style.display = 'none';
  document.getElementById('tb-search-wrap').style.display = 'flex';
  document.getElementById('tb-search-inp').focus();
};
window._tbSearchClose = function() {
  document.getElementById('tb-search-wrap').style.display = 'none';
  document.getElementById('tb-search-btn').style.display = '';
  document.getElementById('tb-search-inp').value = '';
};
window._tbSearchKey = function(e) {
  if (e.key === 'Escape') { window._tbSearchClose(); return; }
  if (e.key === 'Enter') {
    var termo = document.getElementById('tb-search-inp').value.trim();
    if (!termo) return;
    window._tbSearchClose();
    window.cdvBuscar(termo);
  }
};
```

- [ ] **Step 10: Verificar manualmente**

1. Abrir o sistema — o avatar deve aparecer no canto direito do topbar com as iniciais coloridas e tooltip com o email
2. A entrada "Buscar NF / Fornecedor" NÃO deve mais aparecer na sidebar
3. Clicar em ⌕ — o campo de busca deve expandir
4. Pressionar Esc — deve recolher
5. Digitar `123456` e Enter — deve navegar para FormBusca com `123456` já preenchido e a busca executada automaticamente

- [ ] **Step 11: Commit**

```bash
git add Index.html
git commit -m "feat(topbar): avatar com iniciais coloridas e busca inline de NF"
```

---

### Task 3: FormBusca.html — listener de postMessage

**Files:**
- Modify: `FormBusca.html`

**Interfaces:**
- Consumes: `postMessage({ cdvAutoSearch: string })` enviado por `_cdvBuscaAutoSearch` em Index.html (Task 2)
- O listener deve chamar `buscar()` (já existe em FormBusca.html) após preencher `#termo`

- [ ] **Step 1: Localizar o `</script>` final em FormBusca.html**

O arquivo termina com uma IIFE de dark mode e depois `</script>`. Localizar a linha:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```

- [ ] **Step 2: Adicionar listener de postMessage antes do `</script>`**

```javascript
window.addEventListener('message', function(e) {
  if (!e.data || !e.data.cdvAutoSearch) return;
  var inp = document.getElementById('termo');
  if (!inp) return;
  inp.value = String(e.data.cdvAutoSearch);
  buscar();
});
```

- [ ] **Step 3: Verificar manualmente**

1. No sistema, clicar em ⌕ no topbar
2. Digitar um número de NF existente e pressionar Enter
3. FormBusca deve abrir e a busca deve ser executada automaticamente com o número digitado
4. Verificar que o campo `#termo` está preenchido e os resultados aparecem

- [ ] **Step 4: Commit**

```bash
git add FormBusca.html
git commit -m "feat(busca): auto-executar busca via postMessage ao abrir pelo topbar"
```
