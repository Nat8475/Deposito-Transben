# Controle Rodotrem JBS — Transben

Sistema de controle de carretas, rodotrens, pedidos e NFs, com Web App
mobile-first em Google Apps Script (GAS).

## Arquivos do projeto

- `Code.gs` — toda a lógica de backend (planilha, e-mail, PDF, backup, métricas)
- `Index.html` — estrutura das telas do Web App
- `CSS.html` — estilo visual (mobile-first)
- `JavaScript.html` — interações do front-end

## Passo a passo de instalação

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma **planilha em branco**.
2. Nomeie como quiser, por exemplo "Controle Rodotrem JBS".
3. Vá em **Extensões > Apps Script**.
4. Apague o conteúdo padrão do arquivo `Code.gs` que abrir, e cole o
   conteúdo do arquivo `Code.gs` deste projeto.
5. No editor do Apps Script, clique no `+` ao lado de "Arquivos" e crie:
   - Um arquivo **HTML** chamado `Index` → cole o conteúdo de `Index.html`
   - Um arquivo **HTML** chamado `CSS` → cole o conteúdo de `CSS.html`
   - Um arquivo **HTML** chamado `JavaScript` → cole o conteúdo de `JavaScript.html`
6. Salve tudo (ícone de disquete ou Ctrl+S).
7. No topo do editor, no seletor de funções, escolha **setupProjeto** e
   clique em **Executar (▶)**.
   - Na primeira vez, o Google vai pedir autorização (Planilhas, Gmail, Drive).
     Clique em "Revisar permissões" → escolha sua conta → "Avançado" →
     "Acessar [nome do projeto] (não seguro)" → "Permitir". Isso é normal
     para scripts pessoais que você mesmo escreveu/colou.
   - Isso vai criar todas as abas, os 3 destinos fixos, a lista de 14
     e-mails de destinatários, e os gatilhos automáticos de backup
     (diário, 22h) e resumo mensal (todo dia 1º, 6h).
8. Clique em **Implantar > Nova implantação**.
   - Tipo: **Aplicativo da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Somente eu**
9. Clique em **Implantar**, autorize novamente se pedir, e copie a
   **URL do Web App**. Essa é a URL do "site" — salve como atalho na
   tela inicial do celular pra acessar rápido.

## Uso no dia a dia

- **Chegada**: registre placa, motorista, destino(s) e NF(s) assim que
  a carreta chegar. Marque "urgente" se for prioridade.
- **Rodotrem**: quando tiver 2 carretas aguardando prontas, entre na
  aba Rodotrem, toque nas duas, preencha os números de frota do
  rodotrem (até 4) e o nome do motorista do rodotrem, informe o
  número do pedido e confirme.
- **Solicitar Rota**: logo depois de montar, os destinos que vieram
  das carretas já aparecem pré-marcados (mas você pode ajustar).
  Revise o texto gerado e escolha "Salvar como Rascunho" (pra revisar
  no Gmail antes) ou "Confirmar e Enviar Agora" (envio direto pros 14
  destinatários cadastrados).
- **Histórico**: busca única por NF, pedido, placa ou destino. Botão
  de exportar gera uma planilha Excel separada no Google Drive.
- **Métricas**: tempo médio de fechamento (geral e por destino),
  resumos mensais automáticos, e botão de backup manual se quiser
  gerar um extra.

## Sempre que quiser reimplantar após mudanças no código

Se editar `Code.gs` ou os arquivos HTML depois, vá em
**Implantar > Gerenciar implantações**, clique no ícone de lápis (editar)
na implantação ativa, e em "Versão" escolha **Nova versão** antes de
salvar — senão o Web App continua servindo o código antigo.

## Alternativa via `clasp` (linha de comando)

Como você já usa o `clasp`, também é possível versionar este projeto
localmente:

```bash
clasp create --type sheet --title "Controle Rodotrem JBS"
clasp push
clasp deploy
```

Copie os 4 arquivos deste pacote para a pasta do projeto antes do
`clasp push`.

## Funções auxiliares (rodar manualmente, se necessário)

Além de `setupProjeto`, o `Code.gs` tem funções que só precisam ser
rodadas manualmente uma vez, se aplicável ao seu caso:

- **`atualizarEstruturaV2`** — adiciona as colunas `RodoFrotas` e
  `RodoMotorista` na aba Rodotrens, caso sua planilha tenha sido
  criada antes dessas colunas existirem. Não apaga dados.
- **`corrigirCabecalhoRodotrens`** — realinha o cabeçalho das colunas
  `RodoFrotas`/`RodoMotorista` caso ele tenha ficado fora de posição
  em relação aos dados já gravados (só rode se notar essas colunas
  vazias mesmo com dado na planilha).
- **`testeSimples`** — função de diagnóstico, retorna um texto fixo;
  útil pra testar se a comunicação com o Web App está funcionando.

## Observações importantes

- Os destinos fixos e a lista de e-mails ficam nas abas **Destinos** e
  **Config_Email** da planilha — podem ser editados diretamente ali a
  qualquer momento, sem precisar mexer no código.
- O backup automático roda 1x por dia às 22h e guarda uma cópia da
  planilha na pasta "Controle Rodotrem JBS - Arquivos" > "Backups" no
  seu Google Drive.
- O resumo mensal é gerado automaticamente todo dia 1º às 6h e também
  é enviado por e-mail pra você.
