# Design: Conferência de Separação por Bipagem (Lote)

**Data:** 2026-07-12
**Status:** Aprovado
**Escopo:** Código.gs (backend novo) + FormConferencia.html (página nova) + FormTransferencias.html (ponto de entrada)

---

## Contexto

Fluxo hoje: NF é lançada normalmente (Britania/Unilever/Fornecedores Variados) → um grupo de NFs é programado para devolução formando um **Lote** (`TRANSF_COL_LOTE_ID`, aba `Transferencias` — ver spec `2026-06-27-programar-devolucao-em-lote-design.md`). O lote tem transportadora, data de agendamento, status.

Fisicamente, ao separar a mercadoria de um lote, cada caixa já vem com etiqueta do próprio fornecedor (código de barras/QR) que identifica o produto (ex: "Fritadeira 11L 127V"). Esse código é fixo por produto — sempre representa o mesmo item, em qualquer remessa.

Hoje não existe forma de contar/conferir os itens separados contra o total esperado do lote antes do despacho. Este design adiciona uma tela de bipagem que soma os itens conforme são separados e compara contra o total esperado (soma de `Qtd` das NFs do lote).

## Decisões (do brainstorm)

- Bipagem é **por lote inteiro**, não por NF individual — a separação física mistura itens de várias NFs por voltagem/modelo, não por NF. O sistema não sabe qual caixa pertence a qual NF específica, só que a soma bipada deve bater com a soma de `Qtd` de todas as NFs do lote.
- Catálogo de produto (`_Produtos`) é **populado on-the-fly**: primeira vez que um código aparece, pede o nome do produto uma vez; dali em diante reconhece automaticamente, em qualquer lote.
- Cada bipagem gera **uma linha de log** (`_Bipagens`) — permite desfazer a última e auditar quem bipou o quê e quando.
- Input aceita tanto leitor físico USB/BT (campo de texto sempre focado, digita+Enter) quanto câmera (fase 2, mesmo campo).

---

## Arquitetura

### Novas abas

**`_Produtos`** (catálogo, populado on-the-fly):
| Coluna | Conteúdo |
|---|---|
| CodigoBarra | código lido (string, chave única) |
| NomeProduto | texto livre, ex: "Fritadeira 11L 127V" |
| DataCadastro | timestamp do primeiro cadastro |
| CadastradoPor | usuário que cadastrou |

**`_Bipagens`** (log individual, 1 linha por scan):
| Coluna | Conteúdo |
|---|---|
| LoteId | UUID do lote (mesmo valor de `TRANSF_COL_LOTE_ID`) |
| CodigoBarra | código lido |
| NomeProduto | snapshot do nome no momento da bipagem (não recalcula se produto for renomeado depois) |
| Timestamp | data/hora do scan |
| Responsavel | usuário logado |
| Desfeito | boolean — true se essa linha foi desfeita (soft delete, mantém histórico) |

### Fluxo

1. `FormTransferencias.html` — item de lote (`it.isLote`) ganha botão "📦 Conferir Separação", abre `FormConferencia.html?loteId=...` (mesmo padrão de abertura de outras páginas do sistema).
2. `FormConferencia.html` carrega:
   - Dados do lote e das NFs que o compõem (`obterNFsDoLote(loteId)` novo) → soma `Qtd` de todas = total esperado.
   - Bipagens já feitas nesse lote (`obterBipagensDoLote(loteId)`), reconstrói contadores por produto a partir do log (soma `Desfeito != true`).
3. Campo de input sempre focado. Enter → `bipar(loteId, codigo)`:
   - Backend busca código em `_Produtos`.
     - Achou → grava linha em `_Bipagens`, retorna `{produto, totalProduto, totalLote}`.
     - Não achou → retorna `{precisaCadastro: true, codigo}`; frontend abre prompt inline pedindo nome; ao confirmar, chama `cadastrarProdutoEBipar(loteId, codigo, nome)` que cria a linha em `_Produtos` e já grava a bipagem em `_Bipagens` numa única chamada.
4. Tela mostra lista ao vivo agrupada por produto (nome + contador), toast a cada bipagem, rodapé com total bipado vs total esperado (diferença destacada até bater).
5. Botão "desfazer última" → `desfazerUltimaBipagem(loteId)`, marca `Desfeito=true` na última linha não desfeita daquele lote, refaz contadores.
6. Quando total bipado == total esperado, habilita "Concluir Conferência" → grava algo simples (ex: novo campo de status ou observação no lote) indicando que a conferência foi concluída. Não bloqueia despacho/baixa se não concluída — é indicativo, não trava o fluxo existente de `darBaixaTransferencia`.

### Backend (Código.gs) — funções novas

- `_garantirAbaProdutos(ss)` / `_garantirAbaBipagens(ss)` — criação lazy, seguindo padrão de `_garantirAbaTransferencias`.
- `buscarProduto(codigo)` — lookup em `_Produtos`.
- `cadastrarProduto(codigo, nome, usuario)` — insere linha em `_Produtos`.
- `bipar(loteId, codigo)` — valida código existe, grava `_Bipagens`, retorna contadores atualizados. Se código não existe, retorna flag `precisaCadastro` sem gravar nada.
- `cadastrarProdutoEBipar(loteId, codigo, nome)` — atalho que faz as duas coisas numa chamada só (evita 2 round-trips de `google.script.run` no caminho mais comum do dia a dia inicial de um fornecedor novo).
- `desfazerUltimaBipagem(loteId)` — soft delete.
- `obterNFsDoLote(loteId)` — filtra `Transferencias` por `TRANSF_COL_LOTE_ID`, retorna NFs + soma `Qtd`.
- `obterBipagensDoLote(loteId)` — retorna log ativo (não desfeito) do lote, já agregado por produto.
- `concluirConferencia(loteId)` — marca conferência concluída (campo novo a definir na implementação — provável nova coluna em `Transferencias` ou aba própria de status; decidir no plano).

### Frontend (FormConferencia.html) — página nova

Segue padrão visual v12 (recebe `Styles.html` injetado via `_injetarDesignSystem_()`, como as demais páginas). Usa `toast()` com tipos `'ok'|'err'|'warn'|'info'`, no padrão de `FormTransferencias.html` (mesma família de tela).

Componentes:
- Cabeçalho: Lote ID, transportadora, data, fornecedor, contador NFs.
- Input de bipagem (sempre focado, `autofocus` + refoco em `blur`).
- Lista ao vivo por produto.
- Rodapé: total bipado / total esperado, diferença.
- Botão desfazer última.
- Botão concluir (habilitado só quando bate).

### Câmera (fase 2 — implementada em 2026-07-13, revisada no mesmo dia)

Primeira tentativa usou `Html5Qrcode.start()` (vídeo ao vivo via `getUserMedia`). **Não funciona no Web App do Apps Script**: a página publicada roda dentro de um iframe sandbox controlado pelo próprio Google (`script.googleusercontent.com`), fora do nosso controle — `allow="camera"` no nosso próprio iframe (`Index.html`) não resolve, pois o bloqueio é do iframe externo do Google. Erro observado: `getUserMedia` → `NotAllowedError` / permission denied.

Solução adotada: captura de **foto única** via `<input type="file" accept="image/*" capture="environment">`, que aciona o app de câmera nativo do celular (fora do sandbox, sem precisar de `getUserMedia`). A imagem é decodificada client-side com `Html5Qrcode.scanFile()` (lib `html5-qrcode`, CDN `unpkg.com/html5-qrcode@2.3.8`). Resultado chama `bipar(codigo)` direto — mesmo caminho do Enter no input físico, sem mudança de backend. Um toque a mais que vídeo contínuo (tirar foto vs apontar), mas é o que funciona dentro das restrições do ambiente GAS. Falha de decodificação (nenhum código na foto) mostra toast e não bloqueia — input físico continua funcional.

---

## Edge cases

- Código bipado que não existe em `_Produtos` → fluxo de cadastro inline (não bloqueia, é o caminho normal na primeira vez de cada produto).
- Bipagem duplicada rápida (double-scan) → não bloqueia automaticamente; toast mostra contador atualizado, usuário decide se foi engano e desfaz.
- Lote sem NFs ou já com status diferente de "Em Transferência" → bloqueia acesso à tela de bipagem, mostra aviso.
- Total bipado ultrapassa o esperado → não bloqueia; rodapé destaca "sobra" em vermelho.
- Permissão de quem pode bipar: mesma permissão de quem já opera Transferências (sem novo nível de acesso).

## Fora do escopo

- Vínculo de bipagem a NF específica dentro do lote (decisão explícita: bipagem é agregada por lote, não por NF).
- Bloquear despacho/baixa de lote não conferido — conferência é informativa, não um gate no fluxo existente de `darBaixaTransferencia`.
- Edição/renomeação de produtos já cadastrados em `_Produtos` (fica pra depois, se necessário).
- Relatórios/exportação da conferência.
