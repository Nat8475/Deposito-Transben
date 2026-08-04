# Design: FormReabertura — Wizard 3 Steps

**Data:** 2026-06-26
**Status:** Aprovado
**Escopo:** FormReabertura.html apenas

---

## Contexto

FormReabertura.html atual é um formulário flat: textarea de NFs, textarea de motivo, botão buscar, tabela preview inline, botão confirmar. O backend já funciona corretamente com `buscarNFsConcluidas(nfs)` e `executarReaberturaPorItens(itens, motivo)`. O objetivo é redesenhar apenas o layout para seguir o padrão wizard de 3 steps idêntico ao FormVenda, FormExportarPDF e FormProgramarFrete.

---

## O que NÃO muda

- Lógica JavaScript (`buscar()`, `confirmar()`, `itensEncontrados`, `mostrar()`)
- Chamadas ao backend (`buscarNFsConcluidas`, `executarReaberturaPorItens`)
- CSS design system vars e dark mode
- Banner de navegação webapp (`#cdv-nav-webapp`)

---

## Estrutura do Wizard

### Stepper (`.wz-header`)

```
[ 1 Entrada ] ——— [ 2 Prévia ] ——— [ 3 Resultado ]
```

- `.wz-circle.active` = navy gradient (`linear-gradient(135deg, var(--navy-800), var(--navy))`)
- `.wz-circle.done` = verde (`var(--green-bg)`, `var(--green)`)
- `.wz-line-fill` = navy (`var(--navy)`)

---

## Step 1 — Entrada

### Header card (`.hdr`)

```
🔓  Reabrir Devoluções em Lote
    Retorne NFs concluídas para o status Pendente
```

- Ícone com `background: linear-gradient(135deg, var(--navy-800), var(--navy))`

### Info banner (`.info`)

```
Informe as NFs Devolvidas ou Venda que devem retornar ao status Pendente,
separadas por vírgula ou uma por linha.
```

- `background: var(--navy-50)`, `border-left-color: var(--navy)`

### Campos

- **Campo 1:** label "Números das NFs", `<textarea id="nfs" rows="4">`, com `oninput="parseLive()"` para live chip preview
- **Campo 2:** label "Motivo da reabertura", `<textarea id="motivo" rows="2" placeholder="Ex: Cliente retornou mercadoria, erro de lançamento…">`
- **Chip zone:** `.chip-zone` com chips navy (como FormVenda mas em navy)

### Ações

- Botão principal: `btn-main` navy → "🔍 Buscar Prévia"
- Botão ghost: "✖ Cancelar" → `google.script.host.close()`

---

## Step 2 — Prévia

### Tabela de prévia

Colunas: **#** · **NF** · **Aba** · **Descrição** · **Status atual**

- `thead` com gradiente navy
- Cada linha: dados do item encontrado
- Status badge: `.badge-dev` (Devolvido) / `.badge-venda` (Venda) / `.badge-pend` (Pendente)

### Warning (opcional)

- `#prevWarn` — oculto por padrão; exibe aviso quando alguma NF não foi encontrada (estilo `.prev-warn` com `background: var(--amber-bg)`, `border-color: var(--amber)`)

### Header de contagem

`#prevHdr` — "X NF(s) encontrada(s) · pronto para reabrir"

### Ações

- Botão principal navy: "🔓 Confirmar Reabertura" → `confirmar()`
- Botão ghost: "← Voltar" → volta ao step 1 via `goTo(1)`

---

## Step 3 — Resultado

### Caixa de resultado

- **Sucesso** (`.result-box.ok`): ícone SVG check animado + mensagem de sucesso
- **Erro** (`.result-box.err`): ícone ❌ + mensagem de erro

### Botões pós-ação (sucesso)

- `rl-navy`: "🔓 Nova Reabertura" → `goTo(1)` (limpa campos)
- `rl-ghost`: "✖ Fechar" → `google.script.host.close()`

### Botões pós-ação (erro)

- `rl-navy`: "↩ Tentar novamente" → `goTo(1)`
- `rl-ghost`: "✖ Fechar" → `google.script.host.close()`

---

## Funções JS do Wizard

```javascript
var _step = 1;
var itensEncontrados = [];

function goTo(n) { ... }   // muda step, atualiza circles e line-fills
function parseLive() { ... } // atualiza chip zone com NFs digitadas
function buscarPrevia() { ... } // chama buscarNFsConcluidas → goTo(2)
function confirmar() { ... }   // chama executarReaberturaPorItens → goTo(3)
function mostrar(tipo, texto) { ... } // helper de mensagem (mantido)
```

### `goTo(n)`

- Atualiza `.wz-pane` (remove/adiciona classe `active`)
- Atualiza `.wz-circle` (ativo = navy, done = verde, pendente = padrão)
- Atualiza `.wz-line-fill` (width 100% quando step anterior completo)
- Limpa campos e `itensEncontrados` quando `goTo(1)` é chamado

### `parseLive()`

- Extrai NFs do textarea (split por vírgula/nova linha)
- Filtra valores numéricos/válidos
- Renderiza `.chip` para cada NF detectada no `#chipZone`
- Anima abertura/fechamento do `.chip-zone.open`

---

## CSS: Classes de badge para status

```css
.badge-dev  { background:#E8F5E9; color:#2E7D32 }
.badge-venda{ background:#FFF7ED; color:#D97706 }
.badge-pend { background:var(--navy-50); color:var(--navy) }
```

---

## Arquivos modificados

| Arquivo | Mudanças |
|---|---|
| `FormReabertura.html` | Substituição completa do HTML/CSS/JS pelo layout wizard |

Nenhuma mudança em `Código.gs` — backends existentes são suficientes.

---

## Fora do Escopo

- Mudança na lógica de busca ou confirmação no backend
- Novo tipo de resultado ou ação após reabertura
- Integração com outros formulários
