---
name: deploy-teste
description: Deploy completo para o ambiente de TESTE do Web App (pull, push, redeploy dos 2 deployments, cache). Invocar com /deploy-teste.
disable-model-invocation: true
---

# Deploy — ambiente de teste

Fluxo obrigatório. `clasp push` sozinho NÃO atualiza o Web App (deployments são versionados).

## Passos

1. **Pull primeiro** (regra: sessão pode estar atrás do editor online):
   ```
   npx clasp pull
   ```
   Se o pull trouxer mudanças inesperadas, PARAR e mostrar diff ao usuário antes de continuar — já houve perda de trabalho por push cego (v12 sobrescrito em 2026-07-07).

2. **Checar constantes de teste**: confirmar que `EMAILS_DESTINATARIOS`, `ID_MODELO_DOC`, `ID_PASTA_DESTINO`, `ID_PASTA_DESTINO_VENDA`, `ID_PASTA_ANEXOS` em Código.gs NÃO contêm `@transben.com.br` (valores de produção). Se contiverem, avisar o usuário e parar.

3. **Push**:
   ```
   npx clasp push -f
   ```
   Conferir contagem de arquivos no output (~19; Styles.html já sumiu misteriosamente uma vez).

4. **Redeploy nos DOIS deployments versionados**:
   ```
   npx clasp deploy -i AKfycbwmuohWaP69xbhmpWIHh3LVZNBHK7P7OcgMOhUSU7AOlcIb0PeipFIjm9aEB_mQaZ4V -d "<descricao curta>"
   npx clasp deploy -i AKfycbwi2hfDXKHuYt9bjCtPsd6KjTRPHrkimci8LNWLy5wGhsl9_qu413glRC99kjBd37OK -d "<descricao curta>"
   ```

5. **Cache de páginas** (se mudou HTML): uma das opções —
   - bump da chave `pg_html_v12d_` → próxima letra, em `_getPageContent` E `limparCachePaginas`; ou
   - pedir ao usuário rodar menu 🧹 "Limpar Cache do Web App"; ou
   - avisar que leva até 10min (TTL 600s).

6. Reportar ao usuário: versão deployada, se cache foi tratado e como.

## Registrar webhook do Telegram (só quando token/URL mudam)

Depois de publicar o Web App e salvar token+Chat ID na aba Telegram de Configurações:

1. Pegar a URL do Web App publicado e o `webhookSecret` salvo (visível só via
   `PropertiesService` — se precisar, ler com `Logger.log(PropertiesService.getScriptProperties().getProperty('cdv_webhook_conf'))`
   no editor Apps Script).
2. Chamar (uma vez, no navegador ou via `curl`):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_WEBAPP>&secret=<SECRET>`
3. Confirmar resposta `{"ok":true,"result":true,...}`.
