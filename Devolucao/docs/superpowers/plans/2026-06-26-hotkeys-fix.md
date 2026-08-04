# Fix Hotkeys Globais + Remover Modo Compacto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir Ctrl+K e Alt+1–6 que param de funcionar quando o foco está dentro de qualquer form (iframe), e remover o botão de modo compacto do topbar.

**Architecture:** Dois eixos independentes: (1) Index.html — refatora o handler de hotkeys em `_cdvHandleKey()` + adiciona listener de `postMessage` + remove densidade; (2) Todos os 14 Form*.html — adiciona um relay de 4 linhas que intercepta Ctrl+K e Alt+1–6 e os reenvia ao Index.html via `window.parent.postMessage`. Sem dependência entre os dois tasks — podem ser revisados separadamente.

**Tech Stack:** Google Apps Script, HTML/CSS/JS vanilla, `postMessage` API, `document.addEventListener`.

## Global Constraints

- GAS: sem `Array.from()`, sem `NodeList.forEach()` — usar for loops ou literais de array
- Nenhuma mudança em `Código.gs`
- O relay usa `window.parent.postMessage({cdvKey:{...}}, '*')` — nome de campo exato: `cdvKey`
- A função receptora em Index.html se chama `_cdvHandleKey(e)` — nome exato
- O relay deve capturar APENAS Ctrl+K e Alt+1–6 — nenhuma outra tecla
- Não modificar lógica interna de nenhum form — apenas adicionar o relay

---

### Task 1: Index.html — refatorar hotkeys + remover modo compacto

**Files:**
- Modify: `Index.html`

**Interfaces:**
- Produces: `_cdvHandleKey(e)` — função global que processa `{ctrlKey, metaKey, altKey, key}`; chamada pelo listener de `keydown` local e pelo listener de `postMessage`

- [ ] **Step 1: Remover CSS do modo compacto (linhas 457–461)**

Localizar e remover o bloco:
```css
/* density toggle */
body.compact table.rt thead th,
body.compact table.rt tbody td { padding:5px 10px; font-size:11.5px }
body.compact .kpi { padding:12px 14px }
body.compact .kpi-v { font-size:26px }
```
Substituir por nada (remover o bloco inteiro incluindo o comentário).

- [ ] **Step 2: Remover o botão `#btn-density` do topbar (linhas 605–607)**

Localizar e remover:
```html
    <button id="btn-density" onclick="window._toggleDensity()" title="Modo compacto"
      style="background:var(--slate-100);border:1px solid var(--border-sub);color:var(--text-muted);border-radius:var(--r-sm);
             padding:5px 10px;cursor:pointer;font-size:13px;transition:background .15s,color .15s,border-color .15s;font-family:var(--font)">⊟</button>
```

- [ ] **Step 3: Substituir o bloco de hotkeys (linhas 1368–1379) pela versão refatorada com postMessage**

Localizar:
```javascript
// ── Hotkeys de navegação global ────────────────────────────
document.addEventListener('keydown', function(e) {
  // Ctrl/⌘+K → command palette
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); cmdOpen(); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (!e.altKey) return;
  var acao = {
    '1': 'Notas',    '2': 'Lancamento', '3': 'Dashboard',
    '4': 'Relatorios','5': 'Auditoria',  '6': 'Configuracoes'
  }[e.key];
  if (acao) { e.preventDefault(); cdvNav(acao); }
});
```

Substituir por:
```javascript
// ── Hotkeys de navegação global ────────────────────────────
function _cdvHandleKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    if (e.preventDefault) e.preventDefault();
    cmdOpen(); return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    var acao = {
      '1': 'Notas',    '2': 'Lancamento', '3': 'Dashboard',
      '4': 'Relatorios','5': 'Auditoria',  '6': 'Configuracoes'
    }[e.key];
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

- [ ] **Step 4: Remover a IIFE `_toggleDensity` (linhas 1544–1555)**

Localizar e remover o bloco inteiro:
```javascript
// ── Toggle density ──────────────────────────────────────────
(function() {
  var _DEN = 'cdv_density';
  function applyDensity(compact) {
    document.body.classList.toggle('compact', !!compact);
    var btn = document.getElementById('btn-density');
    if (btn) btn.title = compact ? 'Modo confortável' : 'Modo compacto';
    try { localStorage.setItem(_DEN, compact ? '1' : '0'); } catch(_) {}
  }
  try { if (localStorage.getItem(_DEN) === '1') applyDensity(true); } catch(_) {}
  window._toggleDensity = function() { applyDensity(!document.body.classList.contains('compact')); };
})();
```

- [ ] **Step 5: Verificação manual**

1. Abrir o sistema no browser
2. Clicar dentro de qualquer form para mover o foco ao iframe
3. Pressionar Ctrl+K → command palette deve abrir
4. Pressionar Alt+2 → deve navegar para "Lançar / Excluir"
5. Confirmar que o botão ⊟ sumiu do topbar

- [ ] **Step 6: Commit**

```bash
git add Index.html
git commit -m "fix(index): hotkeys via postMessage + remover modo compacto"
```

---

### Task 2: Form*.html (×14) — adicionar relay de hotkeys

**Files:**
- Modify: `FormTransferencias.html`, `FormDashboard.html`, `FormRelatorios.html`, `FormBackup.html`, `FormExportarPDF.html`, `FormVenda.html`, `FormNotas.html`, `FormLancamento.html`, `FormEmailDevolucao.html`, `FormProgramarFrete.html`, `FormAuditoria.html`, `FormConfiguracoes.html`, `FormBusca.html`, `FormReabertura.html`

**Interfaces:**
- Consumes: `window.parent.postMessage({cdvKey:{ctrlKey, metaKey, altKey, key}}, '*')` — recebido pelo listener adicionado em Task 1
- Produces: relay transparente; não expõe nenhuma função pública

**Relay a adicionar (exatamente este snippet):**

```javascript
// relay hotkeys → Index.html
document.addEventListener('keydown', function(e) {
  var ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'k') { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:false,key:'k'}}, '*'); } catch(_) {} return; }
  if (e.altKey && !ctrl && '123456'.indexOf(e.key) >= 0) { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:false,metaKey:false,altKey:true,key:e.key}}, '*'); } catch(_) {} }
});
```

**Regra de inserção (igual para todos os 14 arquivos):**
- Inserir **após** a linha que contém `cdv_dark_mode` (a IIFE de dark mode ou o `initDark()` em FormNotas.html)
- Para FormBackup.html (sem linha `cdv_dark_mode`): inserir antes do `</script>` final do bloco principal (linha 364)

- [ ] **Step 1: Adicionar relay em FormTransferencias.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após:
```javascript
// relay hotkeys → Index.html
document.addEventListener('keydown', function(e) {
  var ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'k') { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:false,key:'k'}}, '*'); } catch(_) {} return; }
  if (e.altKey && !ctrl && '123456'.indexOf(e.key) >= 0) { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:false,metaKey:false,altKey:true,key:e.key}}, '*'); } catch(_) {} }
});
```

- [ ] **Step 2: Adicionar relay em FormDashboard.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay do Step 1.

- [ ] **Step 3: Adicionar relay em FormRelatorios.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 4: Adicionar relay em FormBackup.html**

FormBackup.html não tem `cdv_dark_mode`. Localizar a linha `</script>` próxima à linha 364 (última linha antes de `</body>`) e inserir o relay antes dela:
```javascript
// relay hotkeys → Index.html
document.addEventListener('keydown', function(e) {
  var ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'k') { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:false,key:'k'}}, '*'); } catch(_) {} return; }
  if (e.altKey && !ctrl && '123456'.indexOf(e.key) >= 0) { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:false,metaKey:false,altKey:true,key:e.key}}, '*'); } catch(_) {} }
});
</script>
```
(substitui o `</script>` final pelo relay + `</script>`)

- [ ] **Step 5: Adicionar relay em FormExportarPDF.html**

Localizar:
```javascript
(function(){ try{ if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 6: Adicionar relay em FormVenda.html**

Localizar:
```javascript
(function(){ try{ if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 7: Adicionar relay em FormNotas.html**

FormNotas.html usa `initDark()` em vez da IIFE. Localizar:
```javascript
initDark();
```
(linha ~2817, início do bloco `// ── Init ───`)
Adicionar o relay imediatamente após `initDark();`.

- [ ] **Step 8: Adicionar relay em FormLancamento.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 9: Adicionar relay em FormEmailDevolucao.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 10: Adicionar relay em FormProgramarFrete.html**

Localizar:
```javascript
(function(){ try{ if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 11: Adicionar relay em FormAuditoria.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 12: Adicionar relay em FormConfiguracoes.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 13: Adicionar relay em FormBusca.html**

Localizar:
```javascript
(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 14: Adicionar relay em FormReabertura.html**

Localizar:
```javascript
  (function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
```
Adicionar imediatamente após o mesmo relay.

- [ ] **Step 15: Verificação**

Confirmar que todos os 14 arquivos contêm o texto `cdvKey` (exceto FormBackup que tem a variante `</script>`):

```bash
grep -l "cdvKey" FormTransferencias.html FormDashboard.html FormRelatorios.html FormExportarPDF.html FormVenda.html FormNotas.html FormLancamento.html FormEmailDevolucao.html FormProgramarFrete.html FormAuditoria.html FormConfiguracoes.html FormBusca.html FormReabertura.html FormBackup.html
```
Esperado: todos os 14 arquivos listados.

- [ ] **Step 16: Commit**

```bash
git add FormTransferencias.html FormDashboard.html FormRelatorios.html FormBackup.html FormExportarPDF.html FormVenda.html FormNotas.html FormLancamento.html FormEmailDevolucao.html FormProgramarFrete.html FormAuditoria.html FormConfiguracoes.html FormBusca.html FormReabertura.html
git commit -m "fix(forms): relay de hotkeys globais via postMessage para todos os forms"
```

---

## Self-Review

**Spec coverage:**
- ✅ Fix hotkeys iframe → Task 1 (receptor) + Task 2 (relay em 14 arquivos)
- ✅ Remover botão density → Task 1 Step 2
- ✅ Remover CSS compact → Task 1 Step 1
- ✅ Remover IIFE _toggleDensity → Task 1 Step 4
- ✅ `_cdvHandleKey` exposta como função nomeada → Task 1 Step 3
- ✅ Listener `message` em Index.html → Task 1 Step 3
- ✅ FormBackup.html (sem dark mode IIFE) tratado separadamente → Task 2 Step 4
- ✅ FormNotas.html (dark mode diferente) tratado separadamente → Task 2 Step 7

**Placeholder scan:** Nenhum TBD/TODO.

**Type consistency:** `cdvKey` usado consistentemente em relay (Task 2) e receptor (Task 1). `_cdvHandleKey(e)` recebe objeto com `{ctrlKey, metaKey, altKey, key}` — relay envia exatamente esses campos.
