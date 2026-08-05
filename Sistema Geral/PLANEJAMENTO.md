# Sistema Geral — Planejamento

Unificação de Devolução, Agendamento, JBS e Galpão num único sistema fora do Google Sheets. Objetivo: sair de 4 planilhas GAS separadas para um app web único, sem custo, sem precisar re-arquitetar depois.

---

## 1. Stack definitiva

| Camada | Tecnologia | Free tier | Por quê |
|---|---|---|---|
| Banco de dados | Supabase (Postgres) | 500MB | Volume atual (107 linhas Devolução + ~7480 histórico Galpão) é ínfimo — anos de folga. Upgrade pago não muda API. |
| Autenticação | Supabase Auth | incluso | Login por e-mail/senha pro time interno. |
| Backend / regras de negócio | Supabase Edge Functions (Deno/TS) | 500k invocações/mês | PDF, e-mail, cron mensal, cálculo de turno/saldo. Sem servidor próprio pra manter. |
| Armazenamento de arquivo (fotos, NFs) | Google Drive | 15GB | Já usado hoje via `DriveApp`. Só o link vai pro Postgres. Evita limite de 1GB do Supabase Storage. |
| E-mail | Gmail API | limites padrão Gmail | Já usado hoje (`GmailApp`/`MailApp`), mesma conta, comportamento conhecido. |
| Frontend | Next.js (React + TypeScript) | — | Um app único, rotas por domínio. |
| Hosting frontend | Vercel | generoso | Deploy automático a cada `git push`. Domínio `.vercel.app` grátis. |
| Repositório | GitHub (já em uso) | grátis | Monorepo de transição — GAS legado + Web novo lado a lado. |

**Regra geral:** nenhuma peça troca de fornecedor quando crescer — só faz upgrade de plano dentro do mesmo serviço.

---

## 2. Schema de dados unificado (Postgres)

```
-- núcleo
fornecedores        (id, nome, cnpj, contato_email, contato_tel, ativo)
veiculos             (id, placa, tipo, frota_numero)
usuarios             (auth via Supabase Auth)
logs_auditoria       (usuario_id, acao, entidade, entidade_id, data_hora)

-- pátio / yard (Agendamento + entrada/saída de frota)
docas                (id, nome, status)
agendamentos         (id, fornecedor_id, veiculo_id, doca_id, data_hora_prevista, data_hora_realizada, status)
movimentos_patio     (id, veiculo_id, fornecedor_id, tipo[entrada|saida], motorista, data_hora, status, observacoes)
                     -- registra veiculo sem agendamento previo (ex: entrega avulsa); agendamentos cobre so o fluxo com doca/horario marcado

-- depósito / estoque (Galpão — Recebimento/Expedição/Ajustes)
recebimentos         (id, data, frota, fornecedor_id, conferente, turno, hora_inicio, hora_fim, duracao_min, paletes, completa, observacoes)
expedicoes           (id, data, frota, cliente_destino, conferente, turno, hora_inicio, hora_fim, duracao_min, paletes, completa, observacoes)
ajustes_inventario   (id, data, tipo[entrada|saida|contagem], quantidade, motivo, responsavel)
conferentes          (id, nome, observacoes)

-- notas fiscais / devolução
notas_fiscais        (id, numero_nf, fornecedor_id, tipo[entrada|devolucao], data_emissao, valor, status)
itens_deposito       (id, nf_id, localizacao, quantidade, data_entrada)
devolucoes           (id, nf_id, fornecedor_id, motivo, status, data_solicitacao, data_envio, transportadora)

-- JBS (rodotrem)
carretas_aguardando  (id, veiculo_id, destinos, prioridade)
carreta_nf           (carreta_id, nf_id)  -- ponte N:N
rodotrens            (id, carreta1_id, carreta2_id, numero_pedido, motorista, frotas, data_hora, status, observacoes)
```

`notas_fiscais` e `veiculos` são os hubs que conectam os 4 domínios.

---

## 3. Estrutura de pastas (monorepo de transição)

```
Devolucao/     ← GAS legado, mantido rodando em produção
Agendamento/   ← GAS legado
JBS/           ← GAS legado
Galpao/        ← GAS pronto, ainda não publicado
Sistema Geral/ ← este planejamento + Next.js novo (a criar)
  ├── PLANEJAMENTO.md
  ├── app/           (rotas Next.js: /devolucao /agendamento /jbs /galpao)
  ├── lib/           (cliente Supabase, helpers compartilhados)
  ├── components/    (design system único)
  └── supabase/      (migrations SQL, edge functions)
```

Migração módulo por módulo, sem quebrar o que já roda. Pastas GAS só são arquivadas quando o módulo equivalente estiver validado em produção no Sistema Geral.

---

## 4. Roadmap de migração

**Fase 0 — Fundação**
- Criar projeto Supabase, aplicar schema acima via migration SQL.
- Criar app Next.js em `Sistema Geral/`, conectar Supabase, configurar deploy Vercel.
- Auth básica (login time interno).
- ETL do histórico: script (Apps Script ou Node) que lê as planilhas atuais (107 linhas Devolução + ~7480 linhas Galpão) e popula o Postgres antes do piloto. Sem isso o Sistema Geral nasce sem histórico.

**Fase 1 — Piloto: Galpão** (mais simples, ainda não está em produção)
- Migrar Recebimento/Expedição/Ajustes/Dashboard pro schema novo.
- Validar em paralelo com a planilha GAS antes de desligar.

**Fase 2 — JBS**
- Migrar fluxo de carretas/rodotrem/e-mail.

**Fase 3 — Agendamento**
- Migrar docas/agendamentos.

**Fase 4 — Devolução** (maior, mais crítico — migrar por último)
- Migrar NFs, devoluções, relatórios, configurações.
- Esse módulo só migra depois dos outros 3 validados, por ser o mais usado e mais arriscado de quebrar.
- **Regra de paridade obrigatória:** toda funcionalidade que existe hoje no GAS (filtros, bulk bar, Doc. Carga, e-mail com múltiplos comunicados, galeria de fotos, confirmação de fornecedor, transferências, auditoria, permissões por módulo, busca, dashboard por período — ver detalhe no histórico do projeto) tem que continuar funcionando igual no Sistema Geral antes de desligar o GAS. Nenhuma automação nova pode substituir um fluxo manual existente sem validação explícita do time — só complementa.

**Fase 5 — Descomissionamento**
- Arquivar pastas GAS depois de 4 semanas rodando 100% no Sistema Geral sem incidentes.

---

## 5. Pontos de atenção

- **Free tier Supabase pausa após 1 semana sem uso** — não é problema com uso diário do time, mas fica exposto em recesso/férias coletivas (ex: Natal/Ano Novo) sem acesso >7 dias. Se ocorrer, precisa reativar manualmente no painel Supabase antes de o time voltar.
- **Drive 15GB**: se um dia apertar, aumenta plano Google Workspace sem trocar de API.
- **Locale pt_BR nas fórmulas** era problema só no Sheets (`;` como separador) — não existe mais no Postgres/SQL.
- Ordem de migração prioriza módulos menos críticos primeiro (Galpão → JBS → Agendamento → Devolução), reduzindo risco de quebrar o que já está em produção pesada.

---

## 6. Ideias de funcionalidades futuras (pós-unificação)

Só viáveis (ou muito mais fáceis) depois do Postgres único — hoje cada GAS é uma ilha.

**Cross-módulo**
- Dashboard geral: KPIs dos 4 domínios numa tela (paletes/dia, docas ocupadas, devoluções pendentes, rodotrens em fila).
- Busca única por NF ou placa → histórico completo (recebimento → estoque → devolução → transporte).
- Notificação real-time (Supabase Realtime): doca liberada, carreta completa pra rodotrem, devolução aprovada.
- Tela de auditoria cross-módulo usando `logs_auditoria` (quem fez o quê, quando).
- Permissão por papel via Supabase RLS (ex: conferente só vê Galpão).

**Por domínio**
- Galpão: previsão de duração de turno baseado em histórico (paletes × conferente).
- Agendamento: check-in por QR code na doca (motorista escaneia, sistema bate hora automático).
- JBS: alerta automático quando 2 carretas atingem critério de rodotrem (hoje é conferência manual).
- Devolução: rastreio tipo "status público" pro fornecedor acompanhar sem precisar login.

**Infra**
- PWA leve pro time de pátio/doca (sem depender de laptop).
- Export relatório PDF/Excel unificado por período, cross-domínio.

---

## 7. Automações propostas (reduzem trabalho manual do time)

Todas aditivas — nenhuma substitui um botão/fluxo manual que já existe sem o time validar antes. Ver regra de paridade na Fase 4.

**Devolução** (cuidado extra — módulo mais crítico)
- Alerta automático de prazo de devolução vencendo (cron edge function dispara e-mail/notificação X dias antes) — hoje depende de olhar dashboard manualmente.
- Lembrete automático quando fornecedor não responde comunicado em N dias.
- Confirmação de recebimento por link no e-mail (fornecedor clica e confirma sozinho) — **mantém o botão manual "Confirmar recebimento fornecedor" como está hoje**, o link é só um atalho a mais.
- Anexar PDF do Doc. Carga automaticamente ao e-mail de devolução (elimina passo manual de anexar).
- Leitura automática de NF (OCR no PDF upload) pra pré-preencher número/valor no lançamento, reduzindo digitação — usuário sempre pode corrigir manualmente.

**Agendamento**
- Confirmação automática por WhatsApp/SMS pro motorista X horas antes do horário marcado.
- Sugestão automática de doca livre mais próxima do horário desejado (hoje é escolha manual).

**Galpão**
- Alerta de paletes parados > X horas sem conferência completa.
- Sugestão automática de ajuste de inventário quando padrão recorrente é detectado (ex: mesma divergência toda semana).

**JBS**
- Sugestão automática de qual carreta combinar com qual pra formar rodotrem (por destino/prioridade) — hoje é conferência manual.
- Alerta de documentação/motorista pendente antes de liberar rodotrem.

**Cross-módulo**
- Alertas centralizados configuráveis por usuário/papel (e-mail, WhatsApp ou painel — usuário escolhe).
- Relatório semanal automático por e-mail pro gestor, resumindo os 4 domínios.
- Auto-arquivamento de registros antigos com regra de retenção definida (evita histórico infinito crescendo sem controle).
