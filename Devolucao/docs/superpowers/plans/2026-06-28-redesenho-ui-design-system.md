# Redesenho UI — Design System v11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `Styles.html` como hub central do design system e migrar os 15 arquivos HTML para eliminiar CSS duplicado, adicionando animações expressivas, hover states com glow, ripple em botões, transições de modal/toast e navegação fluida.

**Architecture:** Novo arquivo `Styles.html` (parcial GAS sem `<!DOCTYPE>`) incluído via `<?= include('Styles') ?>` em cada form. Cada form mantém apenas overrides genuinamente locais no seu próprio `<style>`. O block `<style id="cdv-v10">` idêntico em todos os 14 forms é o principal alvo de remoção.

**Tech Stack:** HTML puro + CSS in-line + JavaScript vanilla, servido via Google Apps Script HtmlService. Sem npm/webpack/bundler. Deploy via clasp (`clasp push`) ou upload manual no GAS Script Editor.

## Global Constraints

- Paleta de cores inalterada: `--navy:#1C45D0`, `--ink:#06101E`, `--red:#DC2626`, `--green:#16A34A`, `--amber:#D97706`, `--teal:#0891B2`
- Fonte inalterada: Plus Jakarta Sans + JetBrains Mono (via Google Fonts link em cada form)
- Sem mudança de markup HTML (só CSS, exceto `data-kpi-val` em KPIs e `<?= include('Styles') ?>` no head)
- Sem alteração em lógica JS dos forms (arquivos `.gs` intocados)
- Dark mode deve funcionar em todos os forms após migração
- Cada form deve passar por verificação visual antes de commitar

---

## Files

| Ação | Arquivo | Responsabilidade após migração |
|---|---|---|
| **Criar** | `Styles.html` | Hub: tokens, keyframes, componentes base, JS utilities |
| **Modificar** | `Index.html` | Shell (sidebar, topbar) + include Styles.html + sidebar indicator + page fade |
| **Modificar** | `FormDashboard.html` | Include Styles.html + remover cdv-v10 + overrides locais |
| **Modificar** | `FormBusca.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormAuditoria.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormBackup.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormLancamento.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormReabertura.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormEmailDevolucao.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormProgramarFrete.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormRelatorios.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormExportarPDF.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormVenda.html` | Include Styles.html + remover cdv-v10 |
| **Modificar** | `FormConfiguracoes.html` | Include Styles.html + remover cdv-v10 + overrides locais |
| **Modificar** | `FormNotas.html` | Include Styles.html + remover cdv-v10 + overrides locais (mais complexo) |
| **Modificar** | `FormTransferencias.html` | Include Styles.html + remover cdv-v10 + overrides locais (mais complexo) |

---

## Task 1: Criar Styles.html

**Files:**
- Create: `Styles.html`

**Interfaces:**
- Produces: `<?= include('Styles') ?>` — inclui todo o CSS base + JS utilities
- Produces: funções globais `showToast(msg, type, duration)`, `initRipple(scope)`, `initKpiCounters()`, `closeModalAnimated(el)`

- [ ] **Step 1: Criar o arquivo Styles.html com o conteúdo completo**

Criar `Styles.html` na raiz do projeto (`c:\Users\datan\OneDrive\Desktop\Planilha 2\Styles.html`) com o seguinte conteúdo exato:

```html
<style id="cdv-styles">
/* ══════════════════════════════════════════════════
   DESIGN SYSTEM v11 — Styles.html (parcial GAS)
   Incluído via <?= include('Styles') ?> em cada form
══════════════════════════════════════════════════ */

/* === TOKENS === */
:root {
  /* fonts */
  --font : 'Plus Jakarta Sans', system-ui, sans-serif;
  --mono : 'JetBrains Mono', monospace;

  /* brand */
  --ink        : #06101E;
  --navy       : #1C45D0;
  --navy-800   : #1535A5;
  --navy-d     : #142DB8;
  --teal       : #0891B2;
  --red        : #DC2626;
  --green      : #16A34A;
  --amber      : #D97706;
  --brand-amber: #E8A020;
  --brand-red  : #DC2626;

  /* surfaces */
  --bg        : #ECF1FA;
  --surface   : #FFFFFF;
  --input-bg  : #F4F7FE;
  --slate-100 : #ECF1FA;
  --navy-50   : #EDF3FF;
  --green-bg  : #EDFCF2;
  --red-bg    : #FFF1F1;
  --amber-bg  : #FFF7E0;

  /* borders */
  --border    : #DDE6F4;
  --border-def: #BACADE;

  /* text */
  --text      : #07162A;
  --text-body : #29394F;
  --text-muted: #53708C;
  --text-faint: #8AA3BF;
  --text-sm   : var(--text-muted);
  --c-hdr     : var(--navy);

  /* radius */
  --r    : 12px;
  --r-sm : 9px;
  --r-xs : 5px;
  --r-md : 13px;
  --r-lg : 18px;

  /* shadows */
  --sh    : 0 2px 8px rgba(6,14,30,.08), 0 1px 3px rgba(6,14,30,.05);
  --sh-xs : 0 1px 3px rgba(6,14,30,.06), 0 1px 2px rgba(6,14,30,.04);
  --sh-sm : 0 2px 8px rgba(6,14,30,.08), 0 1px 3px rgba(6,14,30,.05);
  --sh-md : 0 6px 22px rgba(6,14,30,.10), 0 2px 6px rgba(6,14,30,.06);
  --sh-lg : 0 16px 44px rgba(6,14,30,.14), 0 6px 12px rgba(6,14,30,.08);

  /* ease */
  --ease        : cubic-bezier(.4,0,.2,1);
  --ease-spring : cubic-bezier(.34,1.56,.64,1);
  --ease-smooth : cubic-bezier(.25,.46,.45,.94);
  --ease-bounce : cubic-bezier(.68,-0.55,.27,1.55);

  /* durations */
  --dur-fast  : 120ms;
  --dur-base  : 200ms;
  --dur-slow  : 320ms;
  --dur-enter : 260ms;

  /* glow (novas adições v11) */
  --glow-navy  : 0 0 0 3px rgba(28,69,208,.22), 0 4px 20px rgba(28,69,208,.28);
  --glow-green : 0 0 0 3px rgba(22,163,74,.20),  0 4px 18px rgba(22,163,74,.24);
  --glow-red   : 0 0 0 3px rgba(220,38,38,.18),  0 4px 18px rgba(220,38,38,.22);
  --glow-amber : 0 0 0 3px rgba(217,119,6,.18),  0 4px 18px rgba(217,119,6,.22);
  --glow-cyan  : 0 0 0 3px rgba(8,145,178,.18),  0 4px 18px rgba(8,145,178,.22);
  --sh-navy    : 0 4px 22px rgba(28,69,208,.32), 0 2px 8px rgba(28,69,208,.18);

  /* gradients */
  --grad-primary : linear-gradient(135deg, #2D5CE8 0%, #1C45D0 60%, #142FA0 100%);
  --grad-hero    : linear-gradient(135deg, #06101E 0%, #1C3070 100%);
}

/* === DARK MODE === */
body.dark {
  --bg        : #060C19;
  --surface   : #0B1522;
  --input-bg  : #060C19;
  --border    : #172740;
  --border-def: #1D3154;
  --text      : #E6EDF9;
  --text-body : #95AFCC;
  --text-muted: #567090;
  --text-faint: #2E4562;
  --navy-50   : #112036;
  --green-bg  : #022C1A;
  --red-bg    : #2D0A0A;
  --amber-bg  : #1F1100;
  --glow-navy : 0 0 0 3px rgba(45,92,232,.28), 0 4px 22px rgba(45,92,232,.35);
  --sh-navy   : 0 4px 22px rgba(45,92,232,.40), 0 2px 8px rgba(45,92,232,.25);
}
body { background:var(--bg); color:var(--text); font-family:var(--font); transition:background .22s,color .22s }

/* === KEYFRAMES === */
@keyframes fadeUp      { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn      { from{opacity:0} to{opacity:1} }
@keyframes scaleIn     { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
@keyframes shimmer     { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes spin        { to{transform:rotate(360deg)} }
@keyframes pulseDot    { 0%,100%{box-shadow:0 0 0 0 currentColor;opacity:.9} 60%{box-shadow:0 0 0 5px transparent;opacity:0} }
@keyframes slideUp     { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
@keyframes kpiIn       { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes ripple      { from{transform:scale(0);opacity:.35} to{transform:scale(4);opacity:0} }
@keyframes popIn       { from{opacity:0;transform:scale(.92) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
@keyframes popOut      { from{opacity:1;transform:scale(1) translateY(0)} to{opacity:0;transform:scale(.94) translateY(4px)} }
@keyframes slideRight  { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
@keyframes slideOutRight { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(20px)} }
@keyframes rowIn       { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
@keyframes drainBar    { from{width:100%} to{width:0} }
@keyframes shineBeam   { from{transform:skewX(-20deg) translateX(-100%)} to{transform:skewX(-20deg) translateX(900%)} }

/* === SCROLLBAR === */
::-webkit-scrollbar { width:7px;height:7px }
::-webkit-scrollbar-thumb { background:var(--border-def);border-radius:8px }
::-webkit-scrollbar-thumb:hover { background:var(--text-faint) }

/* === BOTÕES — sistema unificado === */
.btn,.bsm {
  display:inline-flex;align-items:center;gap:6px;
  padding:0 14px;height:34px;
  border-radius:var(--r-sm);border:none;cursor:pointer;
  font:600 12px/1 var(--font);font-family:var(--font);
  text-decoration:none;white-space:nowrap;
  transition:transform var(--dur-fast) var(--ease),
             box-shadow var(--dur-base) var(--ease-smooth),
             filter var(--dur-base),
             background var(--dur-base),
             opacity var(--dur-fast);
  position:relative;overflow:hidden;
}
.btn:active   { transform:translateY(0) scale(.97) !important;transition-duration:var(--dur-fast) }
.btn:focus-visible { outline:2px solid var(--navy);outline-offset:2px }
.btn:disabled,.bsm:disabled { opacity:.45;cursor:not-allowed;pointer-events:none }
/* ripple pseudo-element */
.btn::after {
  content:'';position:absolute;border-radius:50%;
  width:100px;height:100px;background:rgba(255,255,255,.25);
  transform:scale(0);opacity:0;pointer-events:none;
  left:var(--rx,50%);top:var(--ry,50%);translate:-50% -50%;
}
.btn.rippling::after { animation:ripple 500ms var(--ease-smooth) forwards }
/* tamanhos */
.btn-lg  { height:40px;padding:0 20px;font-size:13px }
.btn-sm  { height:28px;padding:0 10px;font-size:11px }
.btn-xs  { height:24px;padding:0 8px;font-size:10.5px }
.btn-blk { width:100%;justify-content:center }

/* variantes */
.btn-pri,.bprim,.btn-prim,.btn-primary {
  background:var(--grad-primary);color:#fff;
  box-shadow:0 2px 10px rgba(28,69,208,.25);
}
.btn-pri:hover,.bprim:hover,.btn-prim:hover,.btn-primary:hover {
  transform:translateY(-1px);box-shadow:var(--sh-navy);filter:brightness(1.06);
}

.btn-sec,.btn-gray,.bgray,.btn-outline {
  background:var(--surface);border:1px solid var(--border-def);color:var(--text-body);
}
.btn-sec:hover,.btn-gray:hover,.bgray:hover,.btn-outline:hover {
  background:var(--slate-100);border-color:var(--navy);
}

.btn-succ,.bgreen,.btn-green,.btn-success {
  background:var(--green);color:#fff;box-shadow:0 2px 8px rgba(22,163,74,.20);
}
.btn-succ:hover,.bgreen:hover,.btn-green:hover,.btn-success:hover {
  transform:translateY(-1px);filter:brightness(1.06);box-shadow:var(--glow-green);
}

.btn-danger,.bred,.btn-red {
  background:var(--red);color:#fff;box-shadow:0 2px 8px rgba(220,38,38,.20);
}
.btn-danger:hover,.bred:hover,.btn-red:hover {
  transform:translateY(-1px);filter:brightness(1.06);box-shadow:var(--glow-red);
}

.btn-orange,.bamber,.btn-amber {
  background:var(--amber);color:#fff;box-shadow:0 2px 8px rgba(217,119,6,.20);
}
.btn-orange:hover,.bamber:hover,.btn-amber:hover {
  transform:translateY(-1px);filter:brightness(1.06);box-shadow:var(--glow-amber);
}

.btn-cyan,.bcyan,.btn-teal {
  background:var(--teal);color:#fff;box-shadow:0 2px 8px rgba(8,145,178,.20);
}
.btn-cyan:hover,.bcyan:hover,.btn-teal:hover {
  transform:translateY(-1px);filter:brightness(1.06);box-shadow:var(--glow-cyan);
}

.btn-ghost,.btn-gho {
  background:transparent;color:var(--text-muted);border:none;
}
.btn-ghost:hover,.btn-gho:hover { background:var(--slate-100);color:var(--text-body) }

/* botões no header escuro (pg-top / pghdr) */
.btn-hdr { background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.25) }
.btn-hdr:hover { background:rgba(255,255,255,.26) }

/* === INPUTS === */
input:not([type=checkbox]):not([type=radio]):not([type=range]),
select, textarea {
  font-family:var(--font);
  transition:border-color var(--dur-base),
             box-shadow var(--dur-base),
             background var(--dur-base),
             transform var(--dur-fast);
}
input:not([type=checkbox]):not([type=radio]):hover:not(:focus),
select:hover:not(:focus) {
  background:var(--surface);
}
input:not([type=checkbox]):not([type=radio]):focus,
select:focus, textarea:focus {
  border-color:var(--navy) !important;
  box-shadow:0 0 0 3px rgba(28,69,208,.14),0 1px 4px rgba(28,69,208,.10) !important;
  background:var(--surface) !important;
  transform:translateY(-0.5px);
  outline:none !important;
}

/* === TABELAS === */
thead th {
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
}
tbody tr {
  transition:background var(--dur-fast);
  position:relative;
}
/* border esquerda deslizante no hover */
tbody tr::before {
  content:'';position:absolute;left:0;top:0;bottom:0;
  width:3px;background:var(--navy);
  transform:scaleY(0);transform-origin:center;
  transition:transform var(--dur-base) var(--ease-spring);
  pointer-events:none;z-index:1;
}
tbody tr:hover::before { transform:scaleY(1) }
/* badge brightens on row hover */
tbody tr:hover .bdg,
tbody tr:hover .badge { filter:brightness(1.05) saturate(1.1) }

/* skeleton */
.sk {
  background:linear-gradient(90deg,var(--slate-100) 25%,var(--surface) 50%,var(--slate-100) 75%);
  background-size:600px 100%;animation:shimmer 1.1s infinite;border-radius:6px;
}
.sk-row td { padding:10px !important }

/* === MODAIS === */
.overlay,.ov {
  backdrop-filter:blur(4px);
  -webkit-backdrop-filter:blur(4px);
  animation:fadeIn var(--dur-base) var(--ease);
}
.modal-box,.mb { animation:popIn var(--dur-enter) var(--ease-spring) }

/* === TOASTS === */
#toast-root {
  position:fixed;bottom:24px;right:24px;z-index:9998;
  display:flex;flex-direction:column;gap:8px;pointer-events:none;
}
.tst {
  display:flex;align-items:center;gap:10px;
  padding:11px 16px;border-radius:var(--r-sm);
  font:500 12.5px/1.4 var(--font);color:#fff;
  box-shadow:var(--sh-lg);pointer-events:all;
  animation:slideRight var(--dur-enter) var(--ease-spring);
  max-width:340px;position:relative;overflow:hidden;
}
.tst.out { animation:slideOutRight var(--dur-base) var(--ease-smooth) forwards }
.tst::after {
  content:'';position:absolute;bottom:0;left:0;
  height:3px;background:rgba(255,255,255,.35);
  animation:drainBar linear forwards;
  animation-duration:var(--toast-duration,4s);
}
.tst-ok   { background:#059669 }
.tst-err  { background:#DC2626 }
.tst-warn { background:#D97706 }
.tst-info { background:#0891B2 }

/* === FILTER BAR === */
.filter-bar,.filts {
  transition:max-height var(--dur-slow) var(--ease-smooth),
             padding var(--dur-slow) var(--ease-smooth),
             opacity var(--dur-base);
}
.filter-bar.minimizado {
  max-height:0;padding-top:0;padding-bottom:0;
  border-bottom:none;opacity:0;overflow:hidden;
}

/* === SPINNER === */
.spin-ring,.spin-sm {
  display:inline-block;width:18px;height:18px;border-radius:50%;
  border:2px solid var(--border-def);border-top-color:var(--navy);
  animation:spin .7s linear infinite;vertical-align:middle;
}
</style>
<script>
/* ── countUp: anima número KPI de 0 até o valor ── */
function countUp(el, to, duration) {
  duration = duration || 600;
  var start = performance.now();
  var suffix = el.dataset.suffix || '';
  function tick(now) {
    var p = Math.min((now - start) / duration, 1);
    var ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = Math.round(to * ease) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function initKpiCounters() {
  document.querySelectorAll('[data-kpi-val]').forEach(function(el) {
    countUp(el, parseInt(el.dataset.kpiVal, 10));
  });
}

/* ── initRipple: adiciona efeito ripple nos botões primários ── */
function initRipple(scope) {
  var sel = '.btn-pri,.bprim,.btn-prim,.btn-primary,.btn-succ,.bgreen,.btn-danger,.bred,.btn-orange,.bcyan';
  (scope || document).querySelectorAll(sel).forEach(function(btn) {
    if (btn._ripple) return;
    btn._ripple = true;
    btn.addEventListener('click', function(e) {
      var r = btn.getBoundingClientRect();
      btn.style.setProperty('--rx', (e.clientX - r.left) + 'px');
      btn.style.setProperty('--ry', (e.clientY - r.top) + 'px');
      btn.classList.remove('rippling');
      void btn.offsetWidth; // reflow
      btn.classList.add('rippling');
      setTimeout(function() { btn.classList.remove('rippling'); }, 500);
    });
  });
}

/* ── showToast: sistema centralizado de notificações ── */
function showToast(msg, type, duration) {
  type = type || 'ok';
  duration = duration || 4000;
  var root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  var t = document.createElement('div');
  t.className = 'tst tst-' + type;
  t.style.setProperty('--toast-duration', (duration / 1000) + 's');
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(function() {
    t.classList.add('out');
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, duration);
}

/* ── closeModalAnimated: fecha modal com animação popOut ── */
function closeModalAnimated(el) {
  var box = el.querySelector ? el.querySelector('.modal-box,.mb') : null;
  if (box) {
    box.style.animation = 'popOut var(--dur-base) var(--ease-smooth) forwards';
    setTimeout(function() {
      el.style.display = 'none';
      box.style.animation = '';
    }, 220);
  } else {
    el.style.display = 'none';
  }
}

/* ── Auto-init ao carregar ── */
document.addEventListener('DOMContentLoaded', function() {
  initRipple();
});
</script>
```

- [ ] **Step 2: Verificar o arquivo foi criado corretamente**

```powershell
(Get-Content "Styles.html" | Measure-Object -Line).Lines
```
Esperado: ~220 linhas. Verificar que o arquivo começa com `<style id="cdv-styles">` e termina com `</script>`.

- [ ] **Step 3: Commitar Styles.html**

```powershell
git add Styles.html
git commit -m "feat(ui): criar Styles.html — hub central do Design System v11"
```

---

## Task 2: Atualizar Index.html

**Context:** `Index.html` é o shell (sidebar + topbar + iframe). Já tem seu próprio design system completo (tokens v10 com nomes diferentes: `--bg-app`, `--white`, `--text-str`). Não migrar os tokens do Index.html para Styles.html — eles coexistem. O `Styles.html` é incluído para habilitar as funções JS globais (showToast, initRipple, etc.) que o Index.html pode usar.

**Files:**
- Modify: `Index.html`

**Interfaces:**
- Consumes: `Styles.html` via `<?= include('Styles') ?>`
- Produces: sidebar com indicador deslizante `#sb-indicator`, page fade ao trocar de form, dark mode toggle com rotação de ícone

- [ ] **Step 1: Adicionar `<?= include('Styles') ?>` no head do Index.html**

Ler o `<head>` do Index.html. Adicionar imediatamente antes de `</head>`:
```html
  <?= include('Styles') ?>
</head>
```

- [ ] **Step 2: Adicionar elemento `#sb-indicator` no nav da sidebar**

Dentro de `#nav` (div de navegação da sidebar), adicionar como primeiro filho:
```html
<div id="sb-indicator" style="position:absolute;left:0;width:3px;border-radius:0 2px 2px 0;background:var(--sb-active-line);transition:top var(--dur-slow,320ms) cubic-bezier(.25,.46,.45,.94),height var(--dur-base,200ms) cubic-bezier(.25,.46,.45,.94);pointer-events:none;"></div>
```

- [ ] **Step 3: Enriquecer hover dos itens de nav `.ni`**

Localizar o CSS de `.ni` e `.nic` no Index.html. Substituir (ou adicionar após):
```css
.ni  { transition:background var(--dur-fast,.12s), color var(--dur-fast,.12s) }
.nic { transition:transform var(--dur-base,.2s) var(--ease-spring) }
.ni:hover .nic { transform:scale(1.12) }
.ni.on   .nic  { transform:translateX(1px) }
```

- [ ] **Step 4: Adicionar glow no brand icon e hover na `.sbr`**

Localizar `.sbi-ic` no CSS do Index.html e adicionar/ajustar:
```css
.sbi-ic {
  box-shadow:0 4px 16px rgba(37,87,214,.50);
  transition:transform var(--dur-base,.2s) var(--ease-spring), box-shadow var(--dur-base,.2s);
}
.sbr:hover .sbi-ic { transform:translateY(-1px);box-shadow:0 6px 20px rgba(37,87,214,.65) }
```

- [ ] **Step 5: Animação no toggle de collapse `#tog`**

Localizar `#tog` no CSS e adicionar:
```css
#tog svg,#tog i { transition:transform var(--dur-slow,.32s) var(--ease-spring) }
html.col #tog svg,html.col #tog i { transform:rotate(180deg) }
```

- [ ] **Step 6: Adicionar o JS do sidebar indicator e page fade**

Localizar o bloco `<script>` principal do Index.html. Adicionar as funções abaixo (antes do `</script>` de fechamento):

```javascript
// ── Sidebar indicator deslizante ──
function updateSbIndicator() {
  var ind = document.getElementById('sb-indicator');
  var active = document.querySelector('.ni.on');
  if (!ind || !active) return;
  var navRect = document.getElementById('nav').getBoundingClientRect();
  var itemRect = active.getBoundingClientRect();
  ind.style.top    = (itemRect.top - navRect.top + document.getElementById('nav').scrollTop) + 'px';
  ind.style.height = itemRect.height + 'px';
}

// ── Page fade ao trocar de form ──
function navTo(name, title, sub) {
  var pgf = document.getElementById('pgf');
  var ldg = document.getElementById('ldg');
  // fade out
  pgf.style.transition = 'opacity 0.18s ease';
  pgf.style.opacity = '0';
  if (ldg) { ldg.style.display = 'flex'; }
  setTimeout(function() {
    // a lógica existente de carregamento vai aqui — substitui apenas o início da função
    // NÃO alterar a lógica de google.script.run ou carregamento de URL existente
    // apenas envolver com fade: ao final do onload do iframe, setar opacity:1
  }, 180);
}
```

**Importante:** Integrar `updateSbIndicator()` na função existente que ativa itens de nav (buscar a função que adiciona classe `on` aos `.ni`). Chamar `updateSbIndicator()` após setar a classe `on`. Também chamar `updateSbIndicator()` no `DOMContentLoaded`.

Para o page fade: localizar onde o `<iframe id="pgf">` tem seu `src` alterado. Antes de alterar o `src`, fazer `pgf.style.opacity = '0'`. No `pgf.onload`, fazer `pgf.style.opacity = '1'` e `pgf.style.transition = 'opacity 0.22s ease'`.

- [ ] **Step 6b: Dark mode toggle — rotação de ícone**

Localizar o botão de dark mode no Index.html (procurar por `btn-dark-toggle` ou `dark-toggle` ou o botão que chama a função de toggle de tema). Adicionar ao CSS do Index.html:
```css
.btn-dark-toggle i,
.btn-dark-toggle svg { transition:transform var(--dur-slow,.32s) var(--ease-spring) }
body.dark .btn-dark-toggle i,
body.dark .btn-dark-toggle svg { transform:rotate(180deg) }
```

- [ ] **Step 6c: KPI cards do hub — hover mais expressivo**

Localizar a regra `.kpi:hover` no CSS do Index.html. Atualizar/adicionar:
```css
.kpi:hover { box-shadow:var(--sh-lg);transform:translateY(-3px);border-color:var(--border-def) }
.kpi::before { transition:height var(--dur-base,.2s) var(--ease-smooth) }
.kpi:hover::before { height:4px }
```

- [ ] **Step 7: Verificar Index.html abrindo no browser (local)**

Abrir `Index.html` no browser. Verificar:
- [ ] Sidebar indicator aparece ao lado do item ativo
- [ ] Hover nos ícones de nav faz scale(1.12)
- [ ] Brand icon tem glow azul
- [ ] Toggle de collapse gira o ícone

- [ ] **Step 8: Commitar**

```powershell
git add Index.html
git commit -m "feat(ui): Index.html — sidebar indicator, page fade, micro-animações de nav"
```

---

## Task 3: Migrar FormDashboard.html

**Context:** FormDashboard tem abas de fornecedor (`.forn-tab`), cards, tabelas e um KPI strip. Tem o bloco `<style id="cdv-v10">` (identificado na linha ~176) que é o alvo de remoção. A forma de identificar o bloco: buscar `<style id="cdv-v10">` e remover tudo até o `</style>` correspondente.

**Files:**
- Modify: `FormDashboard.html`

**Interfaces:**
- Consumes: `Styles.html` (tokens, botões, tabela, spinner)
- Keeps local: `.forn-tab`, `.forn-tabs`, `.card`, `.card-h`, estilos de KPI do dashboard

- [ ] **Step 1: Ler o arquivo completo para mapear o bloco a remover**

Ler `FormDashboard.html` completo. Identificar:
- Linha de início do `<style id="cdv-v10">`
- Linha de fim (`</style>` correspondente)
- Quais classes do bloco local (antes de cdv-v10) duplicam botões/inputs já cobertos pelo Styles.html

- [ ] **Step 2: Adicionar include no `<head>`**

Adicionar `<?= include('Styles') ?>` antes de `</head>`.

- [ ] **Step 3: Remover o bloco `<style id="cdv-v10">` completo**

Remover o bloco inteiro — tokens, dark mode, keyframes e base styles que estão nele. Esses agora vêm de `Styles.html`.

- [ ] **Step 4: Remover CSS de botões duplicados do bloco local**

No bloco `<style>` local (que fica antes do cdv-v10), remover quaisquer regras de `.btn`, `.bprim`, `.bsm`, `.bgreen`, `.bred`, `.bcyan`, `.bgray` que agora são cobertas por Styles.html. Manter apenas CSS local único do Dashboard.

- [ ] **Step 5: Enriquecer `.forn-tab` com hover e active expression**

No bloco local, atualizar `.forn-tab` para:
```css
.forn-tab {
  transition:box-shadow var(--dur-base) var(--ease),
             border-color var(--dur-base) var(--ease),
             background var(--dur-base) var(--ease),
             color var(--dur-base) var(--ease);
}
.forn-tab.on {
  box-shadow:0 2px 10px rgba(28,69,208,.25);
}
/* transição de conteúdo ao trocar de aba (aplicar via JS: adicionar/remover classe) */
.forn-content { transition:opacity var(--dur-base) var(--ease) }
.forn-content.switching { opacity:0 }
```

- [ ] **Step 6: Verificar dark mode**

Com o arquivo aberto no browser, adicionar `class="dark"` ao `<body>` manualmente e verificar que cores dark funcionam (vêm de Styles.html agora).

- [ ] **Step 7: Commitar**

```powershell
git add FormDashboard.html
git commit -m "feat(ui): FormDashboard — migrar para Styles.html, enriquecer forn-tabs"
```

---

## Task 4: Migrar FormBusca, FormAuditoria, FormBackup

**Context:** Três forms simples com pouco CSS local. FormAuditoria já tem animações próprias expressivas (`.shineBeam`, `.enterScreen`, `.exitScreen`) — preservar essas animações no bloco local. O `<style id="cdv-v10">` está em:
- FormBusca.html ~linha 68
- FormAuditoria.html ~linha 111 (antes dele tem `<style>` local com animações — MANTER)
- FormBackup.html ~linha 63

**Files:**
- Modify: `FormBusca.html`, `FormAuditoria.html`, `FormBackup.html`

**Interfaces:**
- Consumes: `Styles.html`
- FormAuditoria keeps local: `@keyframes shineBeam`, `@keyframes enterScreen`, `@keyframes exitScreen`, `.screen.ativo`, `.screen.saindo`, `.sel-card` com hover expressivo (já bom — não remover)

- [ ] **Step 1: Para cada um dos 3 forms — adicionar include**

Em `FormBusca.html`, `FormAuditoria.html`, `FormBackup.html`, adicionar `<?= include('Styles') ?>` antes de `</head>`.

- [ ] **Step 2: Remover `<style id="cdv-v10">` de cada form**

Remover o bloco completo em cada um dos 3 arquivos.

- [ ] **Step 3: Em FormAuditoria — garantir que animações locais foram preservadas**

Ler o bloco `<style>` local do FormAuditoria. Confirmar que `@keyframes shineBeam`, `@keyframes enterScreen`, `@keyframes exitScreen` estão presentes (são locais, não estavam no cdv-v10). Confirmar que `.sel-card:hover` com `translateY(-2px)` e box-shadow expressivo foi preservado.

- [ ] **Step 4: Verificar dark mode nos 3 forms**

Abrir cada um no browser com `body.dark` e verificar que as cores dark funcionam.

- [ ] **Step 5: Commitar**

```powershell
git add FormBusca.html FormAuditoria.html FormBackup.html
git commit -m "feat(ui): migrar FormBusca, FormAuditoria, FormBackup para Styles.html"
```

---

## Task 5: Migrar FormLancamento e FormReabertura

**Context:** FormLancamento é um form de lançamento de NF com telas múltiplas (`.screen.ativo`), cards de seleção, campos de formulário complexos, e `.sel-card` com hover. FormReabertura é mais simples. Ambos têm `<style id="cdv-v10">` no meio do arquivo.

**Files:**
- Modify: `FormLancamento.html`, `FormReabertura.html`

- [ ] **Step 1: Ler cada arquivo completamente antes de editar**

Ler `FormLancamento.html` e `FormReabertura.html` na íntegra. Mapear:
- Linha do `<style id="cdv-v10">` em cada
- Classes locais que duplicam botões do Styles.html
- Classes locais únicas a preservar

- [ ] **Step 2: Adicionar include nos dois forms**

```html
<?= include('Styles') ?>
</head>
```

- [ ] **Step 3: Remover cdv-v10 de ambos**

Remover o bloco `<style id="cdv-v10">...</style>` de cada arquivo.

- [ ] **Step 4: Remover regras de botão duplicadas do bloco local**

Em ambos os forms, no bloco `<style>` local, remover regras que duplicam Styles.html:
- `.btn`, `.bsm`, `.bprim`, `.bgreen`, `.bred`, `.bcyan`, `.bgray` e variantes
- Regras de `input:focus`, `select:focus` com box-shadow navy (Styles.html cobre)

Manter: `.titulo`, `.sel-card`, `.sel-grid`, `.screen`, campos específicos do form.

- [ ] **Step 5: Enriquecer `.sel-card` com hover expressivo**

No bloco local de FormLancamento, garantir que `.sel-card:hover` tem:
```css
.sel-card:hover {
  border-color:var(--navy);
  box-shadow:0 6px 22px rgba(28,69,208,.13), 0 2px 6px rgba(28,69,208,.07);
  transform:translateY(-2px);
}
.sel-card:active { transform:translateY(0);box-shadow:none }
```

- [ ] **Step 6: Verificar dark mode e visual nos 2 forms**

Abrir cada form no browser. Verificar dark mode, botões, inputs.

- [ ] **Step 7: Commitar**

```powershell
git add FormLancamento.html FormReabertura.html
git commit -m "feat(ui): migrar FormLancamento, FormReabertura para Styles.html"
```

---

## Task 6: Migrar FormEmailDevolucao e FormProgramarFrete

**Context:** FormEmailDevolucao tem UI de e-mail com destinatários, pré-fill via localStorage, e botões de ação específicos. FormProgramarFrete tem lógica de programação de frete com bulk. Ambos têm cdv-v10.

**Files:**
- Modify: `FormEmailDevolucao.html`, `FormProgramarFrete.html`

- [ ] **Step 1: Ler ambos os arquivos completamente**

Identificar em cada: linha do cdv-v10, classes locais de botão a remover, classes únicas a preservar.

- [ ] **Step 2: Adicionar `<?= include('Styles') ?>` no head de ambos**

- [ ] **Step 3: Remover cdv-v10 de ambos**

- [ ] **Step 4: Remover CSS de botão duplicado dos blocos locais**

Mesma estratégia das tasks anteriores: remover `.bprim`, `.bgreen`, `.bred`, `.bcyan`, `.bgray`, regras de input focus — manter CSS local único.

- [ ] **Step 5: Verificar dark mode e visual nos 2 forms**

- [ ] **Step 6: Commitar**

```powershell
git add FormEmailDevolucao.html FormProgramarFrete.html
git commit -m "feat(ui): migrar FormEmailDevolucao, FormProgramarFrete para Styles.html"
```

---

## Task 7: Migrar FormRelatorios e FormExportarPDF

**Context:** Dois forms de saída/relatório. Relativamente simples em termos de CSS local. FormExportarPDF tem UI de seleção de campos para PDF.

**Files:**
- Modify: `FormRelatorios.html`, `FormExportarPDF.html`

- [ ] **Step 1: Ler ambos os arquivos completamente**

- [ ] **Step 2: Adicionar include e remover cdv-v10 de ambos**

Mesmo padrão das tasks anteriores.

- [ ] **Step 3: Remover CSS de botão duplicado dos blocos locais**

- [ ] **Step 4: Verificar dark mode e commitar**

```powershell
git add FormRelatorios.html FormExportarPDF.html
git commit -m "feat(ui): migrar FormRelatorios, FormExportarPDF para Styles.html"
```

---

## Task 8: Migrar FormVenda e FormConfiguracoes

**Context:** FormVenda tem UI de pesquisa e visualização de vendas. FormConfiguracoes tem a estrutura de hubs com abas (mencionada na memória do projeto como `mudarTab()`) — CSS mais complexo com tabs aninhadas. Ambos têm cdv-v10.

**Files:**
- Modify: `FormVenda.html`, `FormConfiguracoes.html`

- [ ] **Step 1: Ler ambos os arquivos COMPLETAMENTE antes de qualquer edição**

FormConfiguracoes em especial — ler tudo antes de editar. Verificar a estrutura de `.hub-tab`, `.hub-content`, `.aba-tab`, `.aba-content` (ou como estiverem nomeados).

- [ ] **Step 2: Adicionar include no head de ambos**

- [ ] **Step 3: Remover cdv-v10 de ambos**

- [ ] **Step 4: Remover CSS de botão duplicado dos blocos locais**

- [ ] **Step 5: Em FormConfiguracoes — enriquecer as tabs com transição**

No bloco local de FormConfiguracoes, adicionar transição ao conteúdo das abas:
```css
/* Tabs de hub — conteúdo faz fade ao trocar */
.tab-content,.aba-content,.hub-pane { 
  transition:opacity var(--dur-base) var(--ease);
}
```

- [ ] **Step 6: Verificar dark mode nos 2 forms**

- [ ] **Step 7: Commitar**

```powershell
git add FormVenda.html FormConfiguracoes.html
git commit -m "feat(ui): migrar FormVenda, FormConfiguracoes para Styles.html"
```

---

## Task 9: Migrar FormNotas.html (complexo)

**Context:** O form mais complexo do projeto. Tem: KPI strip clicável, filter bar minimizável, bulk action bar, tabela paginada com context menu, modal de detalhe grande, undo bar, prioridade dots, toolbar-topo, density classes. cdv-v10 fica em ~linha 304. Tem tokens locais de badge (`--c-pend`, `--c-dev`, `--c-tr`, `--c-venda`, `--c-alert`) no início do arquivo — PRESERVAR.

**Files:**
- Modify: `FormNotas.html`

**Interfaces:**
- Keeps local: `--c-pend`, `--c-dev`, `--c-tr`, `--c-venda`, `--c-alert` e seus dark mode overrides; `.kpi-strip`, `.kpi-card`, `.bulk-bar`, `.undo-bar`, `.toolbar-topo`, `.context-menu` / `#ctx-menu`, `.paginacao`, `.prio-dot`, density classes

- [ ] **Step 1: Ler FormNotas.html COMPLETAMENTE (arquivo longo)**

Ler em múltiplos blocos se necessário. Mapear:
- Tokens de status no topo (linhas 1-30): `--c-pend`, `--c-dev`, etc. — **PRESERVAR**
- Dark mode overrides desses tokens — **PRESERVAR**
- Linha do cdv-v10
- Classes duplicadas a remover no bloco local pós-cdv-v10

- [ ] **Step 2: Adicionar `<?= include('Styles') ?>` no head**

Adicionar antes de `</head>`, APÓS o `<link>` de fontes.

- [ ] **Step 3: Remover o bloco `<style id="cdv-v10">`**

Remover apenas o bloco `<style id="cdv-v10">...</style>`. Não tocar nos outros blocos `<style>`.

- [ ] **Step 4: No bloco local, remover CSS duplicado de botões e inputs**

Remover: `.btn-sm` (se for alias genérico), `.btn-hdr`, `.btn-prim`, `.btn-succ`, `.btn-danger`, `.btn-orange`, `.btn-gray`, `.btn-teal` — esses vêm de Styles.html agora.

**MANTER obrigatoriamente:** `.kpi-strip`, `.kpi-card`, `.kpi-lbl`, `.kpi-val`, `.kpi-sub`, `.kpi-dot`, `.filter-bar` (customização local além da base), `.bulk-bar`, `.undo-bar`, `.toolbar-topo`, `#ctx-menu`, `.ctx-item`, `.paginacao`, `.prio-dot`, `.modal-box` (customizações locais além da base), `.badge` com cores de status, `.detalhe-grid`, density classes.

- [ ] **Step 5: Enriquecer KPI strip com hover e active**

```css
.kpi-card {
  transition:background var(--dur-fast), border-bottom-color var(--dur-fast), box-shadow var(--dur-fast);
}
.kpi-card:hover { background:var(--slate-100);box-shadow:inset 0 -2px 0 var(--navy) }
.kpi-card.ativo { border-bottom:3px solid var(--brand-amber) }
```

- [ ] **Step 6: Enriquecer `.toolbar-topo` botões (`.btn-sm` local)**

Os botões da toolbar do FormNotas usam `.btn-sm`. Verificar que `.btn-sm` aplicado lá usa as classes do Styles.html (`.btn` + `.btn-sm`). Se o HTML usar só `.btn-sm`, adicionar alias no bloco local:
```css
/* alias local para toolbar */
.toolbar-topo .btn-sm { display:inline-flex;align-items:center;gap:5px }
```

- [ ] **Step 7: Enriquecer context menu `#ctx-menu`**

```css
#ctx-menu { animation:scaleIn var(--dur-enter) var(--ease-spring) }
.ctx-item  { transition:background var(--dur-fast),color var(--dur-fast) }
```

- [ ] **Step 8: Verificar dark mode + funcionalidade**

Abrir no browser. Verificar:
- [ ] Tokens de badge (`--c-pend` etc.) funcionam no light e dark
- [ ] KPI cards com hover funcionam
- [ ] Filter bar minimiza/expande com animação suave
- [ ] Botões da toolbar têm hover correto

- [ ] **Step 9: Commitar**

```powershell
git add FormNotas.html
git commit -m "feat(ui): FormNotas — migrar para Styles.html, enriquecer KPI strip e ctx-menu"
```

---

## Task 10: Migrar FormTransferencias.html (complexo)

**Context:** Form de transferências com tabela densa, bulk action bar, modal de baixa, agrupamento por lote. Tem cdv-v10 em ~linha 105. Tem sistema próprio de toast (funções JS locais como `mostrar()` ou `showMsg()`) — verificar se podem ser redirecionadas para `showToast()` do Styles.html.

**Files:**
- Modify: `FormTransferencias.html`

**Interfaces:**
- Keeps local: `.pghdr`, `.filts` (customizações), `.blkbar`, `.trat`, `.tprox`, `.tconc`, `.tcanc`, `.bact`, `.acoes-td`, `.bdg` com cores locais, `.ov`/`.mb` (customizações), `.dias-ok`, `.dias-warn`, `.dias-late`
- Consumes: showToast() de Styles.html (substituir chamadas locais de toast se existirem)

- [ ] **Step 1: Ler FormTransferencias.html COMPLETAMENTE**

Mapear:
- Linha do cdv-v10
- Função JS local de toast/msg (nome, parâmetros)
- Classes locais de botão a remover
- Classes locais únicas a preservar

- [ ] **Step 2: Adicionar `<?= include('Styles') ?>` no head**

- [ ] **Step 3: Remover o bloco `<style id="cdv-v10">`**

- [ ] **Step 4: Remover CSS de botão duplicado do bloco local**

Remover: `.bprim`, `.bgreen`, `.bred`, `.bcyan`, `.bgray`, `.bsm` genérico — vêm de Styles.html.

**MANTER:** `.pghdr`, `.filts` (overrides), `.blkbar`, classes de status de linha (`.trat`, `.tprox`, `.tconc`, `.tcanc`), `.bact` (botões específicos de ação inline na tabela), `.bdg` com cores locais, `.dias-ok/warn/late`, `#toast-root` se existir localmente (substituir pelo do Styles.html).

- [ ] **Step 5: Integrar sistema de toast do Styles.html**

Localizar a função local de toast em FormTransferencias (ex: `function showMsg(msg, tipo)` ou similar). Verificar se pode ser substituída por `showToast(msg, tipo)`. Se a assinatura for compatível, apagar a função local e usar `showToast`. Se tiver parâmetros diferentes, criar wrapper:
```javascript
// wrapper de compatibilidade — manter se a assinatura local difere
function showMsg(msg, tipo) {
  var typeMap = { 'ok':'ok', 'erro':'err', 'warn':'warn', 'info':'info' };
  showToast(msg, typeMap[tipo] || 'info');
}
```

- [ ] **Step 6: Enriquecer `.pghdr` com shine beam**

No bloco local, adicionar ao `.pghdr` (ou `.pg-top`):
```css
.pghdr { position:relative;overflow:hidden }
.pghdr::after {
  content:'';position:absolute;top:-20%;left:-40px;width:55px;height:140%;
  background:rgba(255,255,255,.14);transform:skewX(-20deg) translateX(-100%);
  animation:shineBeam .9s ease .1s both;pointer-events:none;
}
```

- [ ] **Step 7: Verificar dark mode + funcionalidade completa**

Abrir no browser. Verificar:
- [ ] Tabela com row hover e border esquerda animada
- [ ] Dark mode correto
- [ ] Toast aparece com slide-in e barra de progresso
- [ ] Botões com glow no hover

- [ ] **Step 8: Commitar**

```powershell
git add FormTransferencias.html
git commit -m "feat(ui): FormTransferencias — migrar para Styles.html, integrar showToast centralizado"
```

---

## Task 11: Verificação Final e Polimento

**Files:**
- Review: todos os 15 arquivos HTML

- [ ] **Step 1: Verificar que todos os 15 forms têm o include**

```powershell
Select-String -Path "*.html" -Pattern "include\('Styles'\)" | Select-Object Filename
```
Esperado: 14 forms listados (exceto Index.html que inclui de forma diferente, ou confirmar que Index.html também aparece).

- [ ] **Step 2: Verificar que nenhum form ainda tem `<style id="cdv-v10">`**

```powershell
Select-String -Path "*.html" -Pattern 'id="cdv-v10"' | Select-Object Filename,LineNumber
```
Esperado: sem resultados.

- [ ] **Step 3: Verificar que `body.dark` duplicado foi removido de todos os forms**

```powershell
Select-String -Path "*.html" -Pattern "body\.dark\{--bg:#060C19" | Select-Object Filename,LineNumber
```
Esperado: sem resultados (esse body.dark agora só existe em Styles.html).

- [ ] **Step 4: Teste de regressão visual rápido**

Para cada form, abrir no browser e verificar:
- [ ] Layout não quebrou (sem elementos desaparecidos ou sobrepostos)
- [ ] Cores corretas no light mode
- [ ] Dark mode funciona (adicionar `dark` ao `<body>`)
- [ ] Pelo menos um botão primário tem glow/hover ao testar manualmente

- [ ] **Step 5: Commit de fechamento**

```powershell
git add -A
git commit -m "feat(ui): Design System v11 — migração completa de todos os 15 forms"
```

---

## Notas para o Executor

**Sobre o padrão de migração:** O bloco `<style id="cdv-v10">` é idêntico em todos os forms (exceto FormNotas que é levemente maior). Sempre que removê-lo, confirmar que o `<?= include('Styles') ?>` já foi adicionado **antes** de salvar/commitar.

**Sobre aliases de botão:** Styles.html cobre todos os aliases comuns (`.bprim`, `.bgreen`, `.bred`, `.bcyan`, `.bgray`, `.bsm`). CSS local que usa esses nomes pode ser removido com segurança.

**Sobre dark mode local:** Cada form tinha `body.dark{--bg:#060C19...}` dentro do cdv-v10. Após a migração, esse bloco vem de Styles.html. Se algum form tiver overrides dark mode ADICIONAIS (ex: FormNotas com `body.dark .modal-box`), manter esses overrides no bloco local.

**Sobre o deploy GAS:** Para testar com `<?= include('Styles') ?>` funcionando, o arquivo `Styles.html` precisa estar no Google Apps Script Editor (clasp push ou upload manual). O teste local no browser **não executa** o `<?= ?>` — use-o para verificar CSS/JS, não o include em si.

**Sobre `initKpiCounters()`:** A função precisa ser chamada após o JS que renderiza os KPIs. Adicionar `initKpiCounters()` ao final da função que popula os cards de KPI em cada form que tiver KPIs numéricos animáveis. Adicionar `data-kpi-val="N"` ao elemento de número.
