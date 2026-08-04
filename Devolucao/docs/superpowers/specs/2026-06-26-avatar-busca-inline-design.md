# Design: Avatar do Usuário + Busca Inline no Topbar

**Data:** 2026-06-26
**Status:** Aprovado
**Escopo:** Index.html + FormBusca.html

---

## Contexto

O topbar atual (`#tb`) contém: título/subtítulo, logo Transben, botão Ctrl+K (command palette), botão densidade, botão dark mode. Não há identificação visual do usuário logado. A busca de NF/Fornecedor existe como página separada (`FormBusca`, módulo `Busca`) na sidebar, seção "Lançamentos", chamando `executarBusca(termo)` no backend.

---

## Objetivo

1. Exibir as iniciais do usuário logado num círculo colorido no canto direito do topbar
2. Adicionar busca inline de NF no topbar: ícone → expand input → Enter → carrega FormBusca com busca auto-executada
3. Remover FormBusca da sidebar (item de navegação), sem deletar o arquivo

---

## O que NÃO muda

- Command palette (Ctrl+K) permanece exatamente como está
- `executarBusca(termo)` no backend — sem alterações
- FormBusca.html — layout e lógica preservados (apenas adiciona listener de postMessage)
- Botões existentes no topbar (density, dark mode)
- Logo Transben

---

## Componente 1 — Avatar

### Posição

Último elemento do `#tb` (após o botão dark mode), separado por `gap` existente.

### Aparência

- Círculo `div` de 32×32px, `border-radius: 50%`
- Cor de fundo: derivada do hash do email (ver algoritmo abaixo)
- Texto: iniciais em branco, `font-weight: 700`, `font-size: 12px`
- `title` (tooltip): email completo

### Iniciais

Extrair do username (parte antes do `@`):
- Se username contém `.` ou `_`: usar primeira letra de cada parte, máximo 2 (ex: `nata.rosa` → `NR`, `joao.pedro.silva` → `JP`)
- Se não contém separador: usar os dois primeiros caracteres (ex: `nataniel` → `NA`)
- Sempre maiúsculas

### Paleta de cores (8 cores)

Índice = `hashSimples(email) % 8`

```
0: bg #1C45D0, text #fff  (navy)
1: bg #0891B2, text #fff  (teal)
2: bg #059669, text #fff  (green)
3: bg #D97706, text #fff  (amber)
4: bg #DC2626, text #fff  (red)
5: bg #7C3AED, text #fff  (purple)
6: bg #0E7490, text #fff  (cyan-dark)
7: bg #374151, text #fff  (slate)
```

### Algoritmo hash (djb2 simplificado)

```javascript
function _hashEmail(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & h; // converte para int32
  }
  return Math.abs(h);
}
```

### Carregamento

No init do Index.html, chamar `google.script.run.withSuccessHandler(_onEmailCarregado).getEmailUsuario()`.

`getEmailUsuario()` — função nova em Código.gs:
```javascript
function getEmailUsuario() {
  return Session.getActiveUser().getEmail();
}
```

`_onEmailCarregado(email)` — popula o avatar com iniciais e cor. Se falhar (sem email), mostra `?` com cor slate.

### HTML do avatar

```html
<div id="tb-avatar"
     style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;
            justify-content:center;font:700 12px/1 var(--font);color:#fff;
            flex-shrink:0;cursor:default;user-select:none;background:#374151"
     title="">??</div>
```

---

## Componente 2 — Busca Inline

### Posição

Entre o botão dark mode e o avatar, no `#tb`.

### Estado recolhido

Botão ícone `⌕` estilizado igual aos outros botões do topbar:
```html
<button id="tb-search-btn" onclick="_tbSearchOpen()" title="Buscar NF (Enter)"
  style="background:var(--slate-100);border:1px solid var(--border-sub);
         color:var(--text-muted);border-radius:var(--r-sm);
         padding:5px 10px;cursor:pointer;font-size:13px;
         transition:background .15s,color .15s,border-color .15s;
         font-family:var(--font)">⌕</button>
```

### Estado expandido

O botão é ocultado (`display:none`) e um wrapper `#tb-search-wrap` com input aparece no lugar:

```html
<div id="tb-search-wrap" style="display:none;align-items:center;gap:4px">
  <input id="tb-search-inp" type="text" placeholder="Buscar NF…"
    style="width:200px;padding:5px 10px;border:1px solid var(--border-sub);
           border-radius:var(--r-sm);font:13px var(--font);
           background:var(--input-bg);color:var(--text-str);
           transition:width .2s var(--ease);outline:none"
    onkeydown="_tbSearchKey(event)">
  <button onclick="_tbSearchClose()" title="Fechar"
    style="background:transparent;border:none;color:var(--text-muted);
           cursor:pointer;font-size:14px;padding:4px 6px">✕</button>
</div>
```

### Comportamento

```javascript
function _tbSearchOpen() {
  document.getElementById('tb-search-btn').style.display = 'none';
  var wrap = document.getElementById('tb-search-wrap');
  wrap.style.display = 'flex';
  document.getElementById('tb-search-inp').focus();
}

function _tbSearchClose() {
  document.getElementById('tb-search-wrap').style.display = 'none';
  document.getElementById('tb-search-btn').style.display = '';
  document.getElementById('tb-search-inp').value = '';
}

function _tbSearchKey(e) {
  if (e.key === 'Escape') { _tbSearchClose(); return; }
  if (e.key === 'Enter') {
    var termo = document.getElementById('tb-search-inp').value.trim();
    if (!termo) return;
    _tbSearchClose();
    // Navega para FormBusca e dispara busca automática
    window._pendingBuscaTermo = termo;
    loadPage('Busca');
  }
}
```

### Auto-search em FormBusca

Após `loadPage('Busca')`, o iframe `#pgf` dispara `onload`. Aproveitar esse evento para enviar `postMessage`:

```javascript
// Dentro de loadPage, após frm.srcdoc = ...:
frm.onload = function() {
  show('pgf');
  if (window._pendingBuscaTermo) {
    setTimeout(function() {
      frm.contentWindow.postMessage({ cdvAutoSearch: window._pendingBuscaTermo }, '*');
      window._pendingBuscaTermo = null;
    }, 120); // aguarda scripts do iframe inicializarem
  }
};
```

### Listener em FormBusca.html

Adicionar antes do `</script>` final:

```javascript
window.addEventListener('message', function(e) {
  if (!e.data || !e.data.cdvAutoSearch) return;
  var inp = document.getElementById('termo');
  if (inp) {
    inp.value = e.data.cdvAutoSearch;
    buscar();
  }
});
```

---

## Remoção do FormBusca da sidebar

Em Index.html, no array `NAV`:
- Remover `{ p: 'Busca', i: '◯', l: 'Buscar NF / Fornecedor' }` da seção "Lançamentos"

No objeto `META`:
- Remover a entrada `Busca: { t: 'Buscar NF / Fornecedor', s: '...' }`

FormBusca.html permanece no disco (ainda é carregável via `loadPage('Busca')`).

---

## Arquivos modificados

| Arquivo | Mudanças |
|---|---|
| `Index.html` | Topbar HTML (avatar + search btn/wrap), JS (_tbSearch*, _onEmailCarregado, _hashEmail, init email fetch, postMessage no onload de loadPage), remover NAV entry + META entry |
| `FormBusca.html` | Adicionar listener `window.addEventListener('message', ...)` |
| `Código.gs` | Adicionar `getEmailUsuario()` |

---

## Fora do Escopo

- Avatar clicável (dropdown com menu do usuário)
- Busca de fornecedor pela busca inline (campo aceita qualquer termo, mas o caso de uso principal é NF)
- Animação de width no expand (toggle simples display:none/flex é suficiente)
