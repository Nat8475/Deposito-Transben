---
name: project-conventions
description: Convenções não óbvias do projeto — funções de mensagem por form, cache de páginas, CSS v12, armadilhas de GAS. Carregar antes de editar qualquer Form*.html ou Código.gs.
user-invocable: false
---

# Convenções do projeto

## CSS / Design v12
- `Styles.html` é injetado centralmente pelo servidor em todas as páginas. Nova var CSS ou override dark vai **só lá**. Blocos `cdv-v10` e `body.dark` locais nos forms são legado sobrescrito — não editar, não replicar.
- `Index.html` é exceção: shell não recebe injeção, tem cópia própria dos tokens.
- Paleta v12: ação `#2563EB`, navy `#1E3A5F` (grad-hero `#0B1526→#1E3A5F`), verde `#059669`, bg `#F4F6FB`.
- Stagger de entrada: containers com atributo `data-stagger` animam filhos automaticamente.
- PROIBIDO: `::before`/`::after` em `<tr>` (desalinha colunas no Chrome); `transform` com `fill: forwards/both` em animação de `body` ou container de modal (quebra `position:fixed`).
- Cores de texto escuras hardcoded (`#065F46`, `#92400E`, `#991B1B`, `#1E40AF`) sobre `var(--*-bg)` precisam de override `body.dark .classe{color:...}` em Styles.html.

## Funções de mensagem (variam por form!)
- **FormConfiguracoes.html**:
  - `showMsg(prefixo, tipo, txt)` → procura `${prefixo}-msg`. Prefixos curtos: `'em'`, `'mn'`, `'re'`, `'c'`, `'ac'`.
  - `mostrarMsg(id, txt, tipo)` → ID direto: `'assn-msg'`, `'vis-msg'`, `'chl-msg'`, `'aprv-msg'`, etc.
  - NUNCA `showMsg('vis-msg', ...)` — buscaria `vis-msg-msg`.
- **FormTransferencias.html**: `toast()` com tipos `'ok'|'err'|'warn'|'info'` (classes `.tst-*`).
- **FormNotas.html**: `toast()` só aceita `'ok'|'err'|'info'` (classes sem prefixo `tst-`) — `'warn'` não existe lá.

## Cache de páginas
- Chave: `pg_html_v12d_` (em `_getPageContent` e `limparCachePaginas`), TTL 600s. Verificar chave atual no código antes de citar — bumps são frequentes.
- Mudança de HTML só aparece após: deploy correto + (bump da chave OU menu 🧹 Limpar Cache OU esperar 10min).

## GAS / backend
- Ambiente de TESTE — constantes de e-mail/Drive são do Natã. Prod: `git show 1a18e97:Código.gs` (~142-152).
- `clasp run` não funciona (script não é API executable).
- Diálogos do Sheets usam `_htmlComEstilos_()`, não `HtmlService.createHtmlOutputFromFile` direto.
- Scriptlets GAS (`<?!= ... ?>`) malformados quebram silenciosamente — conferir balanceamento.
