# Design: Fix Hotkeys Globais + Remoção Modo Compacto

**Data:** 2026-06-26
**Status:** Aprovado
**Escopo:** Index.html + todos os Form*.html (14 arquivos)

---

## Contexto

O Index.html serve como shell da web app. Os forms são carregados em `<iframe id="pgf">`. Quando o usuário interage com qualquer form, o foco do teclado fica dentro do iframe — eventos `keydown` não chegam ao `document.addEventListener` do Index.html. Resultado: Ctrl+K e Alt+1–6 param de funcionar assim que o usuário clica em qualquer form.

Adicionalmente, o botão `#btn-density` (modo compacto) foi avaliado como desnecessário e deve ser removido.

---

## O que NÃO muda

- Comportamento do Ctrl+K (abre o command palette `cmdOpen()`)
- Comportamento do Alt+1–6 (navega para módulos via `cdvNav()`)
- Lógica interna de qualquer form
- `Código.gs`

---

## Fix 1 — Relay via postMessage

### Index.html — receptor

Refatorar o handler de hotkeys existente (linhas 1368–1379) em uma função reutilizável `_cdvHandleKey(e)` que recebe um objeto com `{ctrlKey, metaKey, altKey, key}`. Adicionar um listener de `message` que chama `_cdvHandleKey` quando recebe `{cdvKey: ...}` de qualquer form filho.

```javascript
// Substitui o bloco atual (linhas 1368-1379):
function _cdvHandleKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    if (e.preventDefault) e.preventDefault();
    cmdOpen(); return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    var acao = { '1':'Notas','2':'Lancamento','3':'Dashboard',
                 '4':'Relatorios','5':'Auditoria','6':'Configuracoes' }[e.key];
    if (acao) { if (e.preventDefault) e.preventDefault(); cdvNav(acao); }
  }
}
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  _cdvHandleKey(e);
});
window.addEventListener('message', function(e) {
  if (e.data && e.data.cdvKey) _cdvHandleKey(e.data.cdvKey);
});
```

### Todos os Form*.html — relay

Adicionar no final do bloco `<script>` (antes do `</script>` final, após o IIFE de dark mode):

```javascript
// relay de hotkeys para o Index.html pai
document.addEventListener('keydown', function(e) {
  var ctrl = e.ctrlKey || e.metaKey;
  var isK  = ctrl && e.key === 'k';
  var isAlt = e.altKey && !ctrl && '123456'.indexOf(e.key) >= 0;
  if (!isK && !isAlt) return;
  e.preventDefault();
  try { window.parent.postMessage({cdvKey:{ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,key:e.key}}, '*'); } catch(_) {}
});
```

**Arquivos a modificar:**
- FormTransferencias.html
- FormDashboard.html
- FormRelatorios.html
- FormBackup.html
- FormExportarPDF.html
- FormVenda.html
- FormNotas.html
- FormLancamento.html
- FormEmailDevolucao.html
- FormProgramarFrete.html
- FormAuditoria.html
- FormConfiguracoes.html
- FormBusca.html
- FormReabertura.html

---

## Fix 2 — HTML malformado no botão Ctrl+K

**Linha 604 de Index.html:**

Atual (bugado):
```html
<span>◯<\span><span style="font-size:10px;opacity:.7">Ctrl+K</span>
```

Correto:
```html
<span>◯</span><span style="font-size:10px;opacity:.7">Ctrl+K</span>
```

---

## Fix 3 — Remover modo compacto

### Index.html — 3 remoções:

**a) Botão no topbar (linha ~605–607):**
```html
<button id="btn-density" onclick="window._toggleDensity()" title="Modo compacto"
  style="...">⊟</button>
```
→ Remover bloco inteiro.

**b) CSS `.compact` (linhas ~457–461):**
```css
/* density toggle */
body.compact table.rt thead th,
body.compact table.rt tbody td { padding:5px 10px; font-size:11.5px }
body.compact .kpi { padding:12px 14px }
body.compact .kpi-v { font-size:26px }
```
→ Remover bloco inteiro.

**c) IIFE `_toggleDensity` (linhas ~1544–1555):**
```javascript
// ── Toggle density ──────────────────────────────────────────
(function() {
  var _DEN = 'cdv_density';
  function applyDensity(compact) { ... }
  try { if (localStorage.getItem(_DEN) === '1') applyDensity(true); } catch(_) {}
  window._toggleDensity = function() { ... };
})();
```
→ Remover bloco inteiro.

---

## Arquivos modificados

| Arquivo | Mudanças |
|---|---|
| `Index.html` | Refatora handler hotkeys → `_cdvHandleKey` + `message` listener; corrige `<\span>`; remove botão density + CSS compact + IIFE `_toggleDensity` |
| `Form*.html` (×14) | Adiciona relay de 6 linhas no final do `<script>` |

---

## Fora do Escopo

- Novos atalhos de teclado além dos já existentes (Ctrl+K, Alt+1–6)
- Modificação do command palette
- Qualquer mudança de backend
