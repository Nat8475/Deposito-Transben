# Design Spec — Wizard de 3 Steps com Prévia (FormExportarPDF + FormVenda)

**Data:** 2026-06-26  
**Status:** Aprovado pelo usuário

---

## Objetivo

Redesenhar o layout de `FormExportarPDF.html` e `FormVenda.html` para um fluxo wizard de 3 etapas com stepper visual, prévia dos dados antes de confirmar, animações de transição entre steps e melhor feedback de progresso. A funcionalidade principal não muda — o novo formato torna a operação mais segura (revisar antes de executar) e mais interativa.

---

## Escopo

- `FormExportarPDF.html` — redesign completo
- `FormVenda.html` — redesign completo
- `FormProgramarFrete.html` — redesign completo
- `Código.gs` — nova função `buscarPreviewNFs(nfsStr)`

---

## Arquitetura e Fluxo de Estado

### Máquina de estados (JS, em cada formulário)

```
step 1 → [Buscar Prévia]
            ↓ google.script.run.buscarPreviewNFs(nfs)
step 2 → [Confirmar] / [← Voltar]
            ↓ google.script.run.executarExportarPDF(nfs)
            |  ou google.script.run.executarBaixaVenda(nfs)
step 3 → resultado + ações + [+ Nova operação → step 1]
```

Estado gerenciado por variável `step` (1 | 2 | 3) e função `goTo(n)` que controla transições.

Dados do preview armazenados em variável `_preview` (array de itens), persistidos entre step 2 e step 3 para uso no doc. de carga (FormVenda).

### Nova função GAS — `buscarPreviewNFs(nfsStr)`

- Recebe string de NFs (igual ao formato atual: separadas por vírgula, newline ou ponto-e-vírgula)
- Lê a planilha sem alterar nenhum dado
- Retorna JSON:
  ```json
  {
    "itens": [
      { "nfd": "123456", "nf": "789012", "forn": "Fornecedor X",
        "tipo": "Devolução", "motivo": "Avaria", "qtd": 10,
        "vlTot": 1200.00, "data": "01/06/2026" }
    ]
  }
  ```
  ou `{ "erro": "mensagem de erro" }`
- Compartilhada pelos dois formulários — sem duplicação de lógica
- Os campos retornados são idênticos aos já usados em `gerarDocVenda()` no FormVenda

---

## Design Visual

### Stepper (topo da tela, fixo durante todo o fluxo)

```
Step 1 ativo:     ● ━━━━━━━ ○ ━━━━━━━ ○
Step 2 ativo:     ✓ ━━━━━━━ ● ━━━━━━━ ○
Step 3 ativo:     ✓ ━━━━━━━ ✓ ━━━━━━━ ●
```

- **Círculo ativo:** fundo sólido na cor do formulário (navy / amber), número branco, `box-shadow` suave
- **Círculo concluído:** ícone ✓ verde, fundo `--green-bg`
- **Círculo futuro:** borda 1.5px cinza (`--border-def`), texto muted
- **Linha de progresso:** `<div>` com `width` animada de 0% → 100% via `transition: width .35s ease` na cor do formulário
- Labels abaixo dos círculos: "Entrada", "Prévia", "Resultado" em 10px muted

### Transições entre steps — slide horizontal

Container pai com `overflow:hidden; position:relative; min-height: <altura calculada>`. Cada step é `position:absolute; width:100%; top:0`.

```
Avançar (1→2, 2→3):
  step atual → translateX(-100%) + opacity 0  (300ms ease)
  próximo step → translateX(0)   + opacity 1  (300ms ease, vem de +100%)

Voltar (2→1):
  step atual → translateX(+100%) + opacity 0
  anterior   → translateX(0)     + opacity 1  (vem de -100%)
```

Duração: `300ms`, easing: `cubic-bezier(.4,0,.2,1)` (já definido como `--ease`).

O header card (`.hdr`) e info banner (`.info`) aparecem **apenas no step 1**. Do step 2 em diante o stepper comunica o contexto.

### Cores por formulário

| Formulário | Cor primária | Gradiente do botão |
|---|---|---|
| FormExportarPDF | `--navy` (#1C45D0) | `135deg, --navy-800, --navy` |
| FormVenda | `--amber` (#D97706) | `135deg, #b45309, --amber` |

---

## Conteúdo de Cada Step

### Step 1 — Entrada

- Mantém textarea + chip zone (igual ao layout atual)
- Botão principal muda para **"🔍 Buscar Prévia"**
- Estado busy: shimmer + texto "⏳ Buscando dados…"
- Botão cancelar: `google.script.host.close()`
- Validação: não permite avançar com textarea vazia

### Step 2 — Prévia / Confirmação

Tabela de confirmação com todas as colunas:

| # | NFD | NF orig. | Fornecedor | Tipo | Motivo | Cxs | Valor | Data |
|---|---|---|---|---|---|---|---|---|

- Container da tabela com `overflow-x:auto` para scroll horizontal em telas estreitas
- Linha de **totais** fixada no `<tfoot>`: soma de Cxs e Valor Total
- Animação de entrada das linhas: `fadeUp` com `animation-delay: i * 40ms` (máx 400ms no total)
- Rodapé com dois botões:
  - **"← Voltar"** (ghost) — volta ao step 1 sem limpar o textarea
  - **"✓ Confirmar e Processar"** (cor do form) — chama a função de execução

### Step 3 — Resultado

- **Sucesso:** ícone SVG circle-check que "desenha" via `stroke-dashoffset` animation (400ms)
- Mensagem de texto com detalhes (quantas NFs, status atualizado)
- Botões de ação com `fadeUp` escalonado:
  - `📥 Abrir PDF no Drive` — aparece se `urlPdf` presente (ambos os forms)
  - `🖨️ Reimprimir Doc. de Carga` — aparece **somente no FormVenda** se houver itens
  - `+ Nova operação` — limpa estado e volta ao step 1
- **Erro:** ícone ✕ vermelho + mensagem + botão "← Tentar novamente" que volta ao **step 2** (prévia ainda válida, usuário pode tentar confirmar de novo sem refazer a busca)

---

## Animações — Inventário Completo

| Animação | Onde | Detalhes |
|---|---|---|
| `fadeUp` | Entrada do stepper, step 1 | já existente |
| `chipIn` | Chips no step 1 | já existente |
| Slide horizontal | Transição entre steps | nova, `translateX` + `opacity` |
| Linha do stepper | Progresso | `width` transition 350ms |
| `fadeUp` escalonado | Linhas da tabela no step 2 | `delay: i * 40ms` |
| SVG stroke-dashoffset | Ícone ✓ no step 3 sucesso | nova, 400ms |
| `fadeUp` escalonado | Botões de ação no step 3 | delay por botão |
| `sweep` (shimmer) | Botão busy | já existente |

Todas as animações respeitam `@media (prefers-reduced-motion: reduce)` — já presente no CSS base.

---

## Restrições e Decisões

- **iframe do GAS:** evitar `position:fixed` para o stepper; usar `position:sticky` ou manter no fluxo normal
- **Dark mode:** suportado via `body.dark` e variáveis CSS — sem change adicional necessário
- **`_preview` data:** a variável que armazena os itens do step 2 é reutilizada no FormVenda para `gerarDocVenda()`, eliminando a segunda chamada ao backend
- **Sem mudança de assinatura das funções existentes:** `executarExportarPDF` e `executarBaixaVenda` recebem a mesma string de NFs de antes
- **Scroll no iframe:** o container de steps usa `min-height` dinâmico calculado com `getBoundingClientRect` para evitar colapso durante transição

---

---

## FormProgramarFrete — Wizard de 3 Steps (variação)

### Diferenças em relação ao ExportarPDF / Venda

| Aspecto | ExportarPDF / Venda | ProgramarFrete |
|---|---|---|
| Input step 1 | Textarea multi-NF + chips | Campo de busca único (NF ou NFD) |
| Avanço step 1→2 | Botão "Buscar Prévia" | Automático após retorno da busca |
| Step 2 | Tabela de prévia (somente leitura) | Dados da NF + formulário de frete |
| Backend step 2 | `buscarPreviewNFs` (nova) | `buscarNFParaProgramar` (já existe) |
| Backend step 3 | `executarExportarPDF` / `executarBaixaVenda` | `salvarProgramacaoDevolucao` (já existe) |
| Cor primária | Navy / Amber | Navy |
| Nova função GAS? | Sim (buscarPreviewNFs) | Não |

### Fluxo de estado

```
step 1 → [🔍 Buscar] → google.script.run.buscarNFParaProgramar(termo)
                         ↓ sucesso — avança automaticamente
step 2 → card com dados (NF, Fornecedor, Descrição, Data, Peso)
         + aviso se já programado anteriormente
         + opções de frete (Tabela / Valor+ICMS / Valor / Cortesia)
         + campo de valor (condicional — visível só se Valor ou Valor+ICMS)
         + data de agendamento (opcional)
         + número do pedido (obrigatório)
         + observações (opcional)
         → [← Voltar] [💾 Salvar Programação]
step 3 → SVG check / erro + mensagem + [+ Nova programação → step 1]
```

### Conteúdo do step 2

Os campos e opções de frete são idênticos ao card atual — sem mudança de lógica. O redesign traz apenas:
- Slider-in do conteúdo (vem da direita ao avançar do step 1)
- Estilo visual consistente com os demais forms (mesmos tokens CSS, mesma tipografia)
- Botão "← Voltar" que volta ao step 1 e limpa o campo de busca
- Aviso "já programado" mantido (badge âmbar, sem mudança de comportamento)

### Stepper labels

```
[1] Buscar   [2] Configurar   [3] Resultado
```

---

## O que NÃO está no escopo

- Mudança na lógica de backend das funções de execução
- Outros formulários além de FormExportarPDF e FormVenda
- Histórico persistente de operações
- Validação de NF individual no step 1 (a busca no step 2 já serve como validação)
