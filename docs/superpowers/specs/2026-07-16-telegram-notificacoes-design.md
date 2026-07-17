# Design: Notificações Telegram v2 (aprovar/reprovar por botão, tópicos, log completo)

**Data:** 2026-07-16
**Status:** Aprovado
**Escopo:** Código.gs (backend novo + refactor de webhook) + FormConfiguracoes.html (aba WhatsApp/Telegram)

---

## Contexto

Hoje o sistema tem um canal de alerta via webhook (`_KEY_WEBHOOK_CONF`) que manda texto puro pro Telegram ou WhatsApp (Z-API), disparado só no alerta de atraso 30+ dias (`_enviarAlertaWebhook`). Separadamente existe um fluxo de aprovação de lançamento (`submeterParaAprovacao` / `processarAprovacao`, item 57) que notifica só por e-mail — aprovar/reprovar só é possível dentro do Web App.

Este design substitui isso por um canal Telegram único, mais rico, com:
- Botões inline de Aprovar/Reprovar direto na mensagem.
- Tópicos (fóruns) por categoria de evento no grupo.
- Mensagens formatadas (HTML) por tipo de evento.
- Cobertura de eventos do sistema que hoje só ficam no `_Log` da planilha, sem notificar ninguém.

WhatsApp é removido do sistema (não será usado).

## Decisões (do brainstorm)

- **Só Telegram.** Remove backend e UI de WhatsApp/Z-API por completo — não fica como opção secundária.
- **4 tópicos**, criados automaticamente via API do Telegram quando a config for salva: 🔔 Aprovações · 🔄 Transferências · 💰 Vendas/Lançamentos · ⚙️ Sistema/Alertas.
- **Autorização do clique é por associação ao grupo**, não por identidade Google — quem administra o grupo controla quem participa (mesmo princípio da lista de e-mails aprovadores hoje). O código não valida `_usuarioEhAdmin()` no callback (não tem sessão Google nesse contexto).
- **Reprovar pede motivo por reply** — clique não reprova na hora; edita a mensagem pedindo pra responder (reply) com a justificativa, só efetiva a reprovação quando a reply chegar.
- **Log completo**: eventos de transferência (baixa/cancelamento/reagendamento), venda e novo lançamento (sem aprovação) passam a notificar também, não só os que já notificavam (atraso, relatórios, backup, transferências vencidas).

---

## Arquitetura

### Config (`_KEY_WEBHOOK_CONF`)

Formato novo (substitui o atual):
```js
{
  ativo: bool,
  telegram: { token: string, chatId: string },   // 1 chat/grupo só (chatIds vira chatId)
  topicos: { aprovacoes: threadId, transferencias: threadId, vendas: threadId, sistema: threadId },
  webhookSecret: string  // token aleatório gerado ao salvar, usado como query param no doPost
}
```
Remove bloco `whatsapp` inteiro.

### Dispatcher central

```js
function notificarEvento(categoria, htmlMsg, opts) // opts: { botoes: [...], replyMarkupExtra }
```
Substitui todas as chamadas dispersas de webhook. Resolve `chatId` + `message_thread_id` (por `categoria`) da config, monta payload `sendMessage` com `parse_mode: 'HTML'`, dispara. Categoria inválida ou config inativa → no-op silencioso (mesmo comportamento de hoje quando desligado).

`_enviarAlertaWebhook` e `_dispararWebhook` são removidos; call sites migram pra `notificarEvento`.

### Criação de tópicos

Botão "Criar tópicos" na config chama, pro `chatId` configurado, `createForumTopic` 4x (uma por categoria) via `UrlFetchApp`, salva os `message_thread_id` retornados em `topicos`. Se o grupo não for supergrupo com tópicos habilitados, a chamada retorna erro do Telegram — exibido na tela (`wh-msg`), não trava o restante da config.

### `doPost(e)` — webhook receiver

Novo endpoint. Valida `e.parameter.secret === webhookSecret` salvo na config (senão ignora/retorna 200 vazio — não expõe motivo). Body é um `Update` do Telegram:

- **`callback_query`** com `data` no formato `aprov:<id>:sim` ou `aprov:<id>:nao`:
  - `sim` → chama `processarAprovacao(id, true)`, edita a mensagem original (`editMessageText`) mostrando "✅ Aprovado por @usuario", responde o callback (`answerCallbackQuery`).
  - `nao` → NÃO reprova ainda. Edita a mensagem pra "✍️ Responda esta mensagem com o motivo da reprovação.", salva estado pendente `{ aprovacaoId: id, aguardandoMotivoMsgId: <message_id editado> }` em `_KEY_APROVACOES_AGUARDANDO_MOTIVO` (lista, um item por aprovação em espera).
- **`message`** com `reply_to_message` presente:
  - Casa `reply_to_message.message_id` contra a lista de pendentes de motivo. Se achar → chama `processarAprovacao(id, false, texto_da_reply)`, edita a mensagem original com "❌ Reprovado por @usuario — motivo: ...", remove da lista de pendentes.
  - Não achando, ignora (mensagem normal do grupo).

`doGet` não muda.

### Mensagem de aprovação pendente (substitui o e-mail HTML atual, ou soma a ele — mantém e-mail como está, adiciona Telegram)

Enviada via `notificarEvento('aprovacoes', htmlMsg, { botoes: [[{text:'✅ Aprovar', callback_data:'aprov:'+id+':sim'}, {text:'❌ Reprovar', callback_data:'aprov:'+id+':nao'}]] })`.

Corpo HTML (parse_mode HTML do Telegram, não o mesmo HTML de e-mail — Telegram só aceita tags básicas: `<b>`, `<i>`, `<code>`, `<a>`):
```
🔔 <b>Lançamento aguardando aprovação</b>
NF/NFD: <code>{nf}</code> {nfd}
Fornecedor: <b>{fornecedor}</b>
Tipo/Motivo: {tipo} — {motivo}
Qtd/Valor: {qtd} cxs · R$ {valor}
Submetido por: {usuario}
```

### Outras mensagens (redesign)

Cada categoria ganha um template HTML curto no mesmo estilo (emoji + título em negrito + campos). Eventos migrados para notificar (novos, categoria entre parênteses):
- Alerta de atraso 30+ dias (sistema) — já existia, migra pro dispatcher.
- Relatórios diário/semanal/mensal (sistema) — já existiam, migram.
- Backup realizado (sistema) — já existia, migra.
- Transferências vencidas (transferencias) — já existia, migra.
- Baixa de transferência (transferencias) — **novo**.
- Cancelamento de transferência (transferencias) — **novo**.
- Reagendamento de transferência (transferencias) — **novo**.
- Venda executada (`executarBaixaVenda`) (vendas) — **novo**.
- Novo lançamento gravado direto, sem aprovação ativa (vendas) — **novo**.
- Aprovação pendente / aprovada / reprovada (aprovacoes) — já existia por e-mail, ganha Telegram com botão.

### Config UI (FormConfiguracoes.html, aba atual "WhatsApp / Telegram" → renomeia "Telegram")

- Remove seletor de canal e bloco `#wh-bloco-whatsapp`.
- Campo `Chat ID do grupo` (troca "Chat IDs" plural por um único ID de grupo/supergrupo).
- Botão "🗂️ Criar tópicos" (chama `criarTopicosWebhook()`, mostra os 4 nomes/IDs criados).
- Mantém token do bot, toggle ativo, botão "Testar agora" (manda mensagem de teste na categoria Sistema).

### Deploy

Depois de publicar o Web App, é preciso registrar o webhook do bot uma vez (ou toda vez que a URL mudar): `https://api.telegram.org/bot<token>/setWebhook?url=<URL_WEBAPP>?secret=<webhookSecret>`. Isso vira um passo documentado na skill `deploy-teste` — chamado manualmente (não automatizado dentro do fluxo de deploy, já que só precisa rodar quando o token/URL muda, não a cada push).

---

## Erros e casos de borda

- Config Telegram incompleta/inativa → `notificarEvento` não faz nada, sem erro visível (mesmo padrão do `_enviarAlertaWebhook` atual).
- `doPost` recebendo secret errado → ignora, retorna resposta vazia 200 (não vaza detalhe de validação).
- Callback de aprovação/reprovação para um `id` que já foi processado (dois cliques, ou aprovado pelo Web App enquanto pendente no Telegram) → `processarAprovacao` já retorna erro "Aprovação não encontrada" — `doPost` edita a mensagem avisando que já foi tratada, sem travar.
- Reply de motivo que não casa com nenhum pendente → ignorado silenciosamente (é só uma mensagem normal do grupo).
- Falha ao criar tópicos (grupo sem suporte a fórum) → erro do Telegram exibido na tela, config de token/chat continua salva normalmente.

## Fora de escopo

- WhatsApp/Z-API — removido, não fica como opção.
- Mapeamento de identidade Telegram → usuário do sistema (aprovação continua "confiando em quem está no grupo").
- Notificação de todo e qualquer evento do `_Log` (ex.: mudança de cor, criação de aba, limpeza de log) — só os listados acima entram nesta fase; o restante fica como já está (só no `_Log` da planilha).
