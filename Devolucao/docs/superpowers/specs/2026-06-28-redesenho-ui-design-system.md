# Spec: Redesenho UI — Design System v11 (Moderno e Expressivo)

**Data:** 2026-06-28  
**Escopo:** Todos os 15 arquivos HTML do projeto Planilha 2 — Devoluções Transben  
**Estilo:** Moderno e expressivo (referência: Stripe, Loom) — paleta navy/ink atual mantida  
**Arquitetura:** Novo arquivo `Styles.html` como hub central do design system

---

## 1. Contexto

O projeto possui um Design System v10 sólido com tokens CSS, dark mode, sidebar colapsável e animações básicas. Porém cada form tem CSS duplicado e hover states pobres (majoritariamente `opacity:.88`). O objetivo é:

- Centralizar o CSS compartilhado em `Styles.html`
- Enriquecer interações com glow, ripple, spring e transições de página
- Garantir consistência visual entre todos os 15 forms
- Manter a paleta navy/ink sem alterações de cor

---

## 2. Arquitetura — `Styles.html`

### Estrutura do arquivo
```
Styles.html
  └── <style>
        ├── Tokens evoluídos (adições ao :root)
        ├── Reset + base
        ├── Keyframes centralizados
        ├── Componentes base (buttons, inputs, badges, tabelas, modais, toasts)
        └── Utilitários
  └── <script>
        ├── countUp()         — contador animado para KPIs
        ├── initRipple()      — ripple em botões primários
        ├── initToastStack()  — sistema de toast com entrada/saída
        └── initPageFade()    — fade de transição de página (usado pelo Index.html)
```

### Inclusão nos forms
```html
<!-- Em cada form filho, dentro do <head> -->
<?= include('Styles') ?>
```

### Hierarquia de cascade
```
Styles.html      ← tokens, reset, componentes, animações (base)
  └─ Index.html  ← tokens de shell (sidebar, topbar) + include Styles.html
  └─ FormXxx     ← include Styles.html + overrides locais mínimos no <style> local
```

### Regra de override
CSS local de cada form **só pode** definir:
- Tokens semânticos de status/badge específicos do form (ex: `--c-pend`, `--c-dev` em FormNotas)
- Overrides de layout específicos que não existem no kit

Todo CSS de componente (botões, tabelas, inputs, modais, toasts) deve ser **removido** dos forms e centralizado em `Styles.html`.

---

## 3. Tokens Evoluídos

Adicionados ao `:root` existente — nenhum token atual é removido ou alterado.

### Glow e sombras coloridas
```css
--glow-navy  : 0 0 0 3px rgba(28,69,208,.22), 0 4px 20px rgba(28,69,208,.28);
--glow-green : 0 0 0 3px rgba(5,150,105,.20), 0 4px 18px rgba(5,150,105,.24);
--glow-red   : 0 0 0 3px rgba(220,38,38,.18), 0 4px 18px rgba(220,38,38,.22);
--glow-amber : 0 0 0 3px rgba(217,119,6,.18),  0 4px 18px rgba(217,119,6,.22);
--glow-cyan  : 0 0 0 3px rgba(8,145,178,.18),  0 4px 18px rgba(8,145,178,.22);
--sh-navy    : 0 4px 22px rgba(28,69,208,.32), 0 2px 8px rgba(28,69,208,.18);
```

### Durações semânticas
```css
--dur-fast  : 120ms;
--dur-base  : 200ms;
--dur-slow  : 320ms;
--dur-enter : 260ms;
```

### Novos ease curves
```css
--ease-bounce : cubic-bezier(.68,-0.55,.27,1.55);
--ease-smooth : cubic-bezier(.25,.46,.45,.94);
/* --ease e --ease-spring já existem, mantidos */
```

### Gradientes enriquecidos
```css
--grad-primary : linear-gradient(135deg, #2D5CE8 0%, #1C45D0 60%, #142FA0 100%);
--grad-hero    : linear-gradient(135deg, #06101E 0%, #1C3070 100%);
--grad-surface : linear-gradient(180deg, var(--white) 0%, var(--slate-50) 100%);
```

### Dark mode — adições ao `body.dark`
```css
--glow-navy  : 0 0 0 3px rgba(45,92,232,.28), 0 4px 22px rgba(45,92,232,.35);
--sh-navy    : 0 4px 22px rgba(45,92,232,.40), 0 2px 8px rgba(45,92,232,.25);
```

---

## 4. Keyframes Centralizados

Todos os `@keyframes` ficam em `Styles.html`. Os existentes em `Index.html` migram para cá.

### Novos keyframes
```css
@keyframes ripple {
  from { transform: scale(0); opacity: .35 }
  to   { transform: scale(4); opacity: 0   }
}
@keyframes popIn {
  from { opacity:0; transform: scale(.92) translateY(8px)  }
  to   { opacity:1; transform: scale(1)   translateY(0)    }
}
@keyframes popOut {
  from { opacity:1; transform: scale(1)   translateY(0)    }
  to   { opacity:0; transform: scale(.94) translateY(4px)  }
}
@keyframes slideRight {
  from { opacity:0; transform: translateX(20px) }
  to   { opacity:1; transform: translateX(0)    }
}
@keyframes slideOutRight {
  from { opacity:1; transform: translateX(0)    }
  to   { opacity:0; transform: translateX(20px) }
}
@keyframes rowIn {
  from { opacity:0; transform: translateY(4px) }
  to   { opacity:1; transform: translateY(0)   }
}
@keyframes drainBar {
  from { width: 100% }
  to   { width: 0    }
}
```

### Keyframes existentes (migrar do Index.html para Styles.html)
`fadeUp`, `fadeIn`, `scaleIn`, `shimmer`, `spin`, `pulseDot`, `slideUp`, `kpiIn`

---

## 5. Componentes — Botões

### Sistema de classes unificado

| Classe | Uso | Glow no hover |
|---|---|---|
| `.btn-pri` | Ação principal | `--glow-navy` |
| `.btn-sec` | Ação secundária | ring sutil |
| `.btn-succ` | Confirmação/salvar | `--glow-green` |
| `.btn-danger` | Destrutivo | `--glow-red` |
| `.btn-orange` | Alerta/atenção | `--glow-amber` |
| `.btn-cyan` | Informativo | `--glow-cyan` |
| `.btn-gray` | Neutro | nenhum |
| `.btn-ghost` | Fantasma/terciário | nenhum |

### Tamanhos unificados
```css
.btn-lg  { height: 40px; padding: 0 20px; font-size: 13px }
.btn     { height: 34px; padding: 0 14px; font-size: 12px } /* padrão */
.btn-sm  { height: 28px; padding: 0 10px; font-size: 11px }
.btn-xs  { height: 24px; padding: 0 8px;  font-size: 10.5px }
```

### Comportamento de feedback (4 camadas)
```css
/* 1. Base */
.btn {
  transition: transform var(--dur-fast) var(--ease),
              box-shadow var(--dur-base) var(--ease-smooth),
              filter var(--dur-base),
              background var(--dur-base);
  position: relative; overflow: hidden;
}

/* 2. Hover — elevação + glow */
.btn-pri:hover  { transform: translateY(-1px); box-shadow: var(--sh-navy);  filter: brightness(1.06) }
.btn-succ:hover { transform: translateY(-1px); box-shadow: var(--sh-md);    filter: brightness(1.06) }
/* etc. para cada variante */

/* 3. Active — afunda */
.btn:active { transform: translateY(0) scale(.97); transition-duration: var(--dur-fast) }

/* 4. Focus visible — acessibilidade */
.btn:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px }

/* Ripple — via ::after + JS */
.btn::after {
  content: '';
  position: absolute; border-radius: 50%;
  width: 100px; height: 100px;
  background: rgba(255,255,255,.25);
  transform: scale(0); opacity: 0;
  pointer-events: none;
}
.btn.rippling::after { animation: ripple 500ms var(--ease-smooth) forwards }
```

### Aliases de compatibilidade
Forms existentes usam nomes como `.bprim`, `.bsm`, `.btn-prim`, `.btn-hdr`. Criar aliases:
```css
.bprim, .btn-prim { /* aplica estilos de .btn + .btn-pri */ }
.bgreen, .btn-succ-alias { /* .btn + .btn-succ */ }
/* etc. — mapeamento completo de aliases no Styles.html */
```

---

## 6. Componentes — Inputs e Filtros

### Focus state enriquecido
```css
input, select, textarea {
  transition: border-color var(--dur-base), box-shadow var(--dur-base),
              background var(--dur-base), transform var(--dur-fast);
  border: 1.5px solid var(--border-def);
  border-radius: var(--r-sm);
  background: var(--input-bg);
}
input:hover:not(:focus), select:hover:not(:focus) {
  border-color: var(--border-def);
  background: var(--white);
}
input:focus, select:focus, textarea:focus {
  border-color: var(--navy);
  box-shadow: 0 0 0 3px rgba(28,69,208,.14), 0 1px 4px rgba(28,69,208,.10);
  background: var(--white);
  transform: translateY(-0.5px);
  outline: none;
}
```

### Filter bar
```css
.filter-bar, .filts {
  transition: max-height var(--dur-slow) var(--ease-smooth),
              padding var(--dur-slow) var(--ease-smooth),
              opacity var(--dur-base);
}
.filter-bar.minimizado {
  max-height: 0; padding-top: 0; padding-bottom: 0;
  border-bottom: none; opacity: 0; overflow: hidden;
}
```

---

## 7. Componentes — Tabelas

### Row hover com border esquerda animada
```css
tbody tr {
  transition: background var(--dur-fast);
  position: relative;
}
tbody tr::before {
  content: '';
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; background: var(--navy);
  transform: scaleY(0); transform-origin: center;
  transition: transform var(--dur-base) var(--ease-spring);
  pointer-events: none;
}
tbody tr:hover::before { transform: scaleY(1) }
tbody tr:hover td      { background: var(--navy-50) }
```

### Headers
```css
thead th {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  letter-spacing: .04em;
  font-size: 10.5px;
}
```

### Entrada de linhas (rowIn)
```css
/* Aplicado via JS ao renderizar: primeiras 10 linhas com delay escalonado */
tbody tr:nth-child(-n+10) { animation: rowIn var(--dur-base) var(--ease-smooth) both }
tbody tr:nth-child(1)  { animation-delay: 0ms   }
tbody tr:nth-child(2)  { animation-delay: 20ms  }
/* ... até nth-child(10) com delay: 180ms */
```

### Badges no hover de linha
```css
tbody tr:hover .bdg { filter: brightness(1.05) saturate(1.1); transition: filter var(--dur-fast) }
```

### Skeleton rows
Substituir spinner de texto por 5 linhas skeleton com colunas de larguras variadas:
```html
<tr class="sk-row">
  <td><div class="sk" style="width:60%;height:12px"></div></td>
  <td><div class="sk" style="width:40%;height:12px"></div></td>
  <!-- ... -->
</tr>
```

---

## 8. Componentes — Modais

### Entrada com spring
```css
.ov {
  animation: fadeIn var(--dur-base) var(--ease);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.modal-box, .mb {
  animation: popIn var(--dur-enter) var(--ease-spring);
}
```

### Saída animada
JS adiciona classe `.closing` antes de remover o modal:
```javascript
function closeModal(id) {
  const box = document.querySelector(`#${id} .modal-box, #${id} .mb`);
  box.style.animation = `popOut ${getComputedStyle(document.documentElement).getPropertyValue('--dur-base')} var(--ease-smooth) forwards`;
  setTimeout(() => document.getElementById(id).style.display = 'none',
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--dur-base')));
}
```

### Scrollbar interna padronizada
```css
.modal-box, .mb { max-height: 90vh; overflow-y: auto }
```

---

## 9. Componentes — Toasts

### Sistema unificado (substitui o padrão antigo de `display:block`)
```css
#toast-root {
  position: fixed; bottom: 24px; right: 24px; z-index: 9998;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.tst {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; border-radius: var(--r-sm);
  font: 500 12.5px/1.4 var(--font); color: #fff;
  box-shadow: var(--sh-lg); pointer-events: all;
  animation: slideRight var(--dur-enter) var(--ease-spring);
  max-width: 340px; position: relative; overflow: hidden;
}
.tst.out { animation: slideOutRight var(--dur-base) var(--ease-smooth) forwards }

/* Barra de progresso */
.tst::after {
  content: '';
  position: absolute; bottom: 0; left: 0;
  height: 3px; background: rgba(255,255,255,.35);
  animation: drainBar linear forwards;
  animation-duration: var(--toast-duration, 4s);
}
```

### API JS centralizada
```javascript
// Único ponto de entrada para todos os forms
function showToast(msg, type = 'ok', duration = 4000) { ... }
// type: 'ok' | 'err' | 'warn' | 'info'
// Substitui: showMsg(), mostrarMsg(), toast() e variantes espalhadas nos forms
```

**Nota:** Forms com API própria de toast (`FormTransferencias` tem tipos específicos) mantêm a chamada local mas internamente delegam para `showToast()`.

---

## 10. Sidebar e Topbar (Index.html)

### Indicador ativo deslizante
```html
<div id="sb-indicator"></div> <!-- posicionado absolutamente dentro de #nav -->
```
```css
#sb-indicator {
  position: absolute; left: 0; width: 3px;
  background: var(--sb-active-line); border-radius: 0 2px 2px 0;
  transition: top var(--dur-slow) var(--ease-smooth),
              height var(--dur-base) var(--ease-smooth);
  pointer-events: none;
}
```
JS atualiza `top` e `height` via `getBoundingClientRect()` do item ativo.

### Micro-animações nos itens de nav
```css
.ni { transition: background var(--dur-fast), color var(--dur-fast) }
.nic { transition: transform var(--dur-base) var(--ease-spring) }
.ni:hover .nic { transform: scale(1.12) }
.ni.on .nic    { transform: translateX(1px) }
```

### Brand icon glow
```css
.sbi-ic {
  box-shadow: 0 4px 16px rgba(37,87,214,.50);
  transition: transform var(--dur-base) var(--ease-spring),
              box-shadow var(--dur-base);
}
.sbr:hover .sbi-ic { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(37,87,214,.65) }
```

### Toggle button animado
```css
#tog { transition: background var(--dur-fast), color var(--dur-fast) }
#tog svg, #tog i { transition: transform var(--dur-slow) var(--ease-spring) }
html.col #tog svg, html.col #tog i { transform: rotate(180deg) }
```

### Dark mode toggle — rotação de ícone
```css
.btn-dark-toggle i, .btn-dark-toggle svg {
  transition: transform var(--dur-slow) var(--ease-spring)
}
body.dark .btn-dark-toggle i, body.dark .btn-dark-toggle svg { transform: rotate(180deg) }
```

### Transição de página (fade no iframe)
```javascript
// Em Index.html — ao trocar de form
function loadForm(name) {
  const pgf = document.getElementById('pgf');
  pgf.style.opacity = '0';
  pgf.style.transition = `opacity var(--dur-base) var(--ease)`;
  showLoading();
  setTimeout(() => {
    pgf.src = ''; // triggers new load
    google.script.run.withSuccessHandler(url => {
      pgf.src = url;
      pgf.onload = () => {
        pgf.style.opacity = '1';
        hideLoading();
      };
    }).getFormUrl(name);
  }, 100);
}
```

---

## 11. KPI Cards

### Hover mais expressivo (Index.html e forms filhos)
```css
.kpi:hover {
  box-shadow: var(--sh-lg);
  transform: translateY(-3px);
  border-color: var(--border-def);
}
.kpi::before {
  transition: height var(--dur-base) var(--ease-smooth);
}
.kpi:hover::before { height: 4px }
```

### KPI Strip (forms filhos)
```css
.kpi-card { transition: background var(--dur-fast), border-bottom-color var(--dur-fast) }
.kpi-card.ativo { border-bottom: 3px solid var(--brand-amber) }
```

### Contador animado (JS em Styles.html)
```javascript
function countUp(el, to, duration = 600) {
  const from = 0;
  const start = performance.now();
  const suffix = el.dataset.suffix || '';
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = Math.round(from + (to - from) * ease) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function initKpiCounters() {
  document.querySelectorAll('[data-kpi-val]').forEach(el => {
    countUp(el, parseInt(el.dataset.kpiVal));
  });
}
```

---

## 12. Plano de Migração dos 15 Forms

### Ordem de migração (risco crescente)
1. **`Styles.html`** — criar o arquivo hub *(sem dependências)*
2. **`Index.html`** — incluir `Styles.html`, migrar CSS compartilhado, implementar sidebar indicator e page fade
3. **`FormDashboard.html`** — relativamente simples, boa validação visual
4. **`FormBusca.html`**, **`FormAuditoria.html`**, **`FormBackup.html`** — forms leves
5. **`FormLancamento.html`**, **`FormReabertura.html`**, **`FormEmailDevolucao.html`** — forms de ação
6. **`FormProgramarFrete.html`**, **`FormRelatorios.html`**, **`FormExportarPDF.html`** — forms com lógica específica
7. **`FormVenda.html`**, **`FormConfiguracoes.html`** — forms com mais CSS local
8. **`FormNotas.html`**, **`FormTransferencias.html`** — os mais complexos, por último

### Checklist por form
- [ ] Adicionar `<?= include('Styles') ?>` no `<head>`
- [ ] Remover CSS duplicado (botões, inputs, tabelas, modais, toasts, badges base)
- [ ] Manter apenas overrides genuinamente locais
- [ ] Adicionar atributo `data-kpi-val="N"` nos elementos de valor dos KPI cards (para `initKpiCounters()`)
- [ ] Substituir skeleton spinner por skeleton rows onde aplicável
- [ ] Verificar que dark mode continua funcionando
- [ ] Testar no GAS (Google Apps Script) em modo webapp

---

## 13. O que NÃO muda

- Paleta de cores (navy, ink, green, red, amber, cyan) — inalterada
- Fontes (Plus Jakarta Sans + JetBrains Mono) — inalteradas
- Lógica de negócio (JS de cada form) — sem alteração
- Dark mode toggle behavior — mantido, só o ícone ganha rotação animada
- Estrutura HTML de cada form — não há mudança de markup, apenas CSS

---

## 14. Critérios de Sucesso

- `Styles.html` criado e incluído em todos os 15 forms
- Todos os botões com hover/active/ripple/glow conforme spec
- Tabelas com row hover animado e skeletons
- Toasts com slide-in/out e barra de progresso
- Modais com popIn/popOut animados
- Sidebar com indicador deslizante e ícones com micro-animação
- Transição de página suave (fade) ao trocar de form
- KPIs com countUp animado
- Dark mode funcionando em todos os forms após migração
- Nenhuma quebra de funcionalidade existente
