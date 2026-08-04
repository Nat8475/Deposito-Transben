/**
 * =====================================================================
 * CONTROLE DE RODOTREM - JBS
 * Sistema de controle de carretas, rodotrens, pedidos e NFs
 * Transben - Depósito
 * =====================================================================
 *
 * COMO INSTALAR:
 * 1. Crie uma nova planilha Google Sheets (em branco).
 * 2. Vá em Extensões > Apps Script.
 * 3. Apague o conteúdo padrão e cole este arquivo (Code.gs).
 * 4. Crie os arquivos Index.html, CSS.html e JavaScript.html (veja os
 *    arquivos separados) e cole o conteúdo de cada um.
 * 5. Volte para o Code.gs, selecione a função "setupProjeto" no menu
 *    de funções (topo) e clique em Executar (▶). Autorize as permissões
 *    pedidas (Planilhas, Gmail, Drive).
 * 6. Isso vai criar todas as abas, cabeçalhos, destinos fixos, lista de
 *    e-mails e os gatilhos automáticos (backup e resumo mensal).
 * 7. Clique em Implantar > Nova implantação > Tipo: Aplicativo da Web.
 *    - Executar como: Eu
 *    - Quem pode acessar: Somente eu
 * 8. Copie a URL do Web App gerada — esse é o "site" que você vai usar
 *    no dia a dia (pode salvar como favorito ou atalho no celular).
 * =====================================================================
 */

// ---------------------------------------------------------------------
// CONFIGURAÇÃO GERAL
// ---------------------------------------------------------------------

const SHEET_CARRETAS = 'Carretas_Recebidas';
const SHEET_NFS = 'NFs';
const SHEET_RODOTRENS = 'Rodotrens';
const SHEET_DESTINOS = 'Destinos';
const SHEET_CONFIG_EMAIL = 'Config_Email';
const SHEET_LOG = 'Log_Alteracoes';
const SHEET_BACKUP_LOG = 'Backup_Log';
const SHEET_RESUMOS = 'Resumos_Mensais';

const DESTINATARIOS_FIXOS = [
  'cte@transben.com.br', 'rotas@transben.com.br', 'rastreamento@transben.com.br',
  'larissa.santos@transben.com.br', 'luiz.borba@transben.com.br', 'analista@transben.com.br',
  'atendimento@transben.com.br', 'alertas@transben.com.br', 'escritoriobv@transben.com.br',
  'sac@transben.com.br', 'comercial@transben.com.br', 'luiz.freire@transben.com.br',
  'mauro.santana@transben.com.br', 'graziela.rodrigues@transben.com.br', 'adelino.valle@transben.com.br'
];

const DESTINOS_FIXOS = [
  { nome: 'RS/ESTANCIA VELHA - JBS', cnpj: '02.916.265/0130-67' },
  { nome: 'RS/PORTAO - PELES PAMPA', cnpj: '02.433.691/0001-42' },
  { nome: 'RS/MONTENEGRO - JBS', cnpj: '02.916.265/0129-23' }
];

const HORAS_ALERTA_AGUARDANDO = 6; // horas parada aguardando até virar alerta

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  return ss_().getSheetByName(name);
}

// ---------------------------------------------------------------------
// SETUP INICIAL - rodar uma vez manualmente
// ---------------------------------------------------------------------

function setupProjeto() {
  const ss = ss_();

  criarAba_(ss, SHEET_CARRETAS, [
    'ID', 'DataHora', 'Placa', 'Motorista', 'Destinos', 'Status',
    'RodotremID', 'Prioridade', 'RegistradoPor', 'UltimaEdicao'
  ]);

  criarAba_(ss, SHEET_NFS, ['ID', 'CarretaID', 'NumeroNF']);

  criarAba_(ss, SHEET_RODOTRENS, [
    'ID', 'DataHora', 'Carreta1ID', 'Carreta2ID', 'Destinos', 'NumeroPedido',
    'Status', 'Prioridade', 'Observacoes', 'RegistradoPor', 'PastaDriveLink',
    'RodoFrotas', 'RodoMotorista'
  ]);

  const abaDestinos = criarAba_(ss, SHEET_DESTINOS, ['Nome', 'CNPJ']);
  if (abaDestinos.getLastRow() < 2) {
    DESTINOS_FIXOS.forEach(d => abaDestinos.appendRow([d.nome, d.cnpj]));
  }

  const abaEmail = criarAba_(ss, SHEET_CONFIG_EMAIL, ['Email']);
  if (abaEmail.getLastRow() < 2) {
    DESTINATARIOS_FIXOS.forEach(e => abaEmail.appendRow([e]));
  }

  criarAba_(ss, SHEET_LOG, ['DataHora', 'Usuario', 'Acao', 'Detalhes']);
  criarAba_(ss, SHEET_BACKUP_LOG, ['DataHora', 'NomeArquivo', 'Link']);
  criarAba_(ss, SHEET_RESUMOS, [
    'MesAno', 'TotalRodotrens', 'TotalCarretas', 'DetalhePorDestino',
    'TempoMedioHoras', 'GeradoEm'
  ]);

  // Remove a aba padrão "Página1"/"Sheet1" se estiver vazia e sobrando
  const padrao = ss.getSheetByName('Sheet1') || ss.getSheetByName('Página1');
  if (padrao && ss.getSheets().length > 1 && padrao.getLastRow() === 0) {
    ss.deleteSheet(padrao);
  }

  configurarGatilhos_();

  SpreadsheetApp.getUi().alert(
    'Setup concluído! Abas criadas, destinos e e-mails cadastrados, ' +
    'e os gatilhos automáticos (backup e resumo mensal) foram configurados.'
  );
}

function corrigirCabecalhoRodotrens() {
  const aba = sheet_(SHEET_RODOTRENS);
  // As colunas de dados de RodoFrotas/RodoMotorista foram gravadas nas
  // colunas 12 e 13 (L e M) pelo appendRow, mas o cabeçalho pode ter
  // ficado desalinhado. Esta função força o cabeçalho certo nessas
  // colunas exatas e limpa qualquer cabeçalho duplicado que tenha
  // sido criado a mais (colunas 14+, N, O, etc.).
  aba.getRange(1, 12).setValue('RodoFrotas').setFontWeight('bold').setBackground('#1a3c6e').setFontColor('#ffffff');
  aba.getRange(1, 13).setValue('RodoMotorista').setFontWeight('bold').setBackground('#1a3c6e').setFontColor('#ffffff');

  const ultimaColuna = aba.getLastColumn();
  if (ultimaColuna > 13) {
    aba.getRange(1, 14, 1, ultimaColuna - 13).clearContent().clearFormat();
  }

  SpreadsheetApp.getUi().alert(
    'Cabeçalho corrigido! "RodoFrotas" agora está na coluna L e "RodoMotorista" na coluna M, ' +
    'alinhados com os dados que já estavam gravados ali.'
  );
}

function atualizarEstruturaV2() {
  const aba = sheet_(SHEET_RODOTRENS);
  const cabecalhoAtual = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  const novasColunas = ['RodoFrotas', 'RodoMotorista'];
  novasColunas.forEach(col => {
    if (cabecalhoAtual.indexOf(col) === -1) {
      const proxColuna = aba.getLastColumn() + 1;
      aba.getRange(1, proxColuna).setValue(col)
        .setFontWeight('bold').setBackground('#1a3c6e').setFontColor('#ffffff');
    }
  });
  SpreadsheetApp.getUi().alert(
    'Estrutura atualizada! Colunas "RodoFrotas" e "RodoMotorista" adicionadas na aba Rodotrens ' +
    '(se ainda não existiam). Seus dados anteriores não foram alterados.'
  );
}

function criarAba_(ss, nome, cabecalho) {
  let aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
  }
  if (aba.getLastRow() === 0) {
    aba.appendRow(cabecalho);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, cabecalho.length).setFontWeight('bold').setBackground('#1a3c6e').setFontColor('#ffffff');
  }
  return aba;
}

function configurarGatilhos_() {
  // Remove gatilhos antigos do projeto pra não duplicar
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['executarBackupAutomatico', 'executarResumoMensal'].includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('executarBackupAutomatico')
    .timeBased().everyDays(1).atHour(22).create();

  ScriptApp.newTrigger('executarResumoMensal')
    .timeBased().onMonthDay(1).atHour(6).create();
}

// ---------------------------------------------------------------------
// WEB APP
// ---------------------------------------------------------------------

function testeSimples() {
  return 'OI MUNDO - ' + new Date().toString();
}

// ---------------------------------------------------------------------
// WRAPPERS SEGUROS
// Alguns ambientes de rede corrompem objetos/arrays retornados via
// google.script.run, mas texto simples passa sem problema. Por isso,
// essas funções serializam o resultado inteiro como uma string JSON
// antes de devolver, e o front-end desserializa depois (JSON.parse).
// ---------------------------------------------------------------------

function _seguro(fn) {
  try {
    return JSON.stringify({ ok: true, data: fn() });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err && err.message) || String(err) });
  }
}

function getDestinosSeguro() { return _seguro(getDestinos); }
function getCarretasAguardandoSeguro() { return _seguro(getCarretasAguardando); }
function getDashboardDataSeguro() { return _seguro(getDashboardData); }
function getRodotrensSeguro() { return _seguro(getRodotrens); }
function getMetricasSeguro() { return _seguro(getMetricas); }
function getResumosMensaisSeguro() { return _seguro(getResumosMensais); }
function getDetalheRodotremSeguro(id) { return _seguro(function () { return getDetalheRodotrem(id); }); }
function gerarCorpoEmailSeguro(rodotremId, destinos) { return _seguro(function () { return gerarCorpoEmail(rodotremId, destinos); }); }
function buscarHistoricoSeguro(termo) { return _seguro(function () { return buscarHistorico(termo); }); }
function registrarCarretaSeguro(dados) { return _seguro(function () { return registrarCarreta(dados); }); }
function montarRodotremSeguro(dados) { return _seguro(function () { return montarRodotrem(dados); }); }
function enviarEmailRotaSeguro(rodotremId, destinos, modo) { return _seguro(function () { return enviarEmailRota(rodotremId, destinos, modo); }); }
function gerarComprovantePDFSeguro(id) { return _seguro(function () { return gerarComprovantePDF(id); }); }
function exportarHistoricoSeguro() { return _seguro(exportarHistorico); }

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Controle Rodotrem - JBS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------
// UTIL
// ---------------------------------------------------------------------

function proximoId_(aba) {
  const last = aba.getLastRow();
  if (last < 2) return 1;
  const valores = aba.getRange(2, 1, last - 1, 1).getValues().flat().filter(v => v !== '');
  if (valores.length === 0) return 1;
  return Math.max(...valores.map(Number)) + 1;
}

function usuarioAtual_() {
  try {
    return Session.getActiveUser().getEmail() || 'desconhecido';
  } catch (err) {
    return 'desconhecido';
  }
}

function logAlteracao_(acao, detalhes) {
  const aba = sheet_(SHEET_LOG);
  aba.appendRow([new Date(), usuarioAtual_(), acao, detalhes]);
}

function linhaParaObjeto_(cabecalho, linha) {
  const obj = {};
  cabecalho.forEach((h, i) => obj[h] = linha[i]);
  return obj;
}

function lerTodos_(nomeAba) {
  const aba = sheet_(nomeAba);
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados.shift();
  return dados.map(linha => linhaParaObjeto_(cabecalho, linha));
}

// ---------------------------------------------------------------------
// DESTINOS
// ---------------------------------------------------------------------

function getDestinos() {
  return lerTodos_(SHEET_DESTINOS);
}

// ---------------------------------------------------------------------
// CARRETAS
// ---------------------------------------------------------------------

function registrarCarreta(dados) {
  // dados: { placa, motorista, destinos: [nomes], nfs: [strings], prioridade }
  const abaCarretas = sheet_(SHEET_CARRETAS);
  const abaNfs = sheet_(SHEET_NFS);

  // Checagem de NF duplicada
  const nfsExistentes = lerTodos_(SHEET_NFS).map(n => String(n.NumeroNF).trim());
  const duplicadas = dados.nfs.filter(nf => nfsExistentes.includes(String(nf).trim()));
  if (duplicadas.length > 0) {
    throw new Error('NF(s) já cadastrada(s) anteriormente: ' + duplicadas.join(', '));
  }

  const id = proximoId_(abaCarretas);
  const agora = new Date();
  const usuario = usuarioAtual_();

  abaCarretas.appendRow([
    id, agora, dados.placa, dados.motorista, dados.destinos.join(', '),
    'Aguardando', '', dados.prioridade ? 'Urgente' : 'Normal', usuario, agora
  ]);

  dados.nfs.forEach(nf => {
    const idNf = proximoId_(abaNfs);
    abaNfs.appendRow([idNf, id, nf]);
  });

  logAlteracao_('Registrar Carreta', 'Carreta ID ' + id + ' - Placa ' + dados.placa);

  return { sucesso: true, id: id };
}

function getCarretasAguardando() {
  const carretas = lerTodos_(SHEET_CARRETAS).filter(c => c.Status === 'Aguardando');
  const nfs = lerTodos_(SHEET_NFS);
  const agora = new Date();

  return carretas.map(c => {
    const nfsDaCarreta = nfs.filter(n => Number(n.CarretaID) === Number(c.ID)).map(n => n.NumeroNF);
    const horasParada = (agora - new Date(c.DataHora)) / (1000 * 60 * 60);
    return {
      id: c.ID,
      dataHora: c.DataHora,
      placa: c.Placa,
      motorista: c.Motorista,
      destinos: c.Destinos,
      prioridade: c.Prioridade,
      nfs: nfsDaCarreta,
      horasParada: Math.round(horasParada * 10) / 10,
      alerta: horasParada >= HORAS_ALERTA_AGUARDANDO
    };
  }).sort((a, b) => {
    if (a.prioridade === 'Urgente' && b.prioridade !== 'Urgente') return -1;
    if (b.prioridade === 'Urgente' && a.prioridade !== 'Urgente') return 1;
    return new Date(a.dataHora) - new Date(b.dataHora);
  });
}

// ---------------------------------------------------------------------
// RODOTRENS
// ---------------------------------------------------------------------

function montarRodotrem(dados) {
  // dados: { carreta1Id, carreta2Id, numeroPedido, prioridade, observacoes, rodoFrotas: [], rodoMotorista }
  const abaCarretas = sheet_(SHEET_CARRETAS);
  const abaRodotrens = sheet_(SHEET_RODOTRENS);

  const dadosCarretas = abaCarretas.getDataRange().getValues();
  const cabecalho = dadosCarretas[0];
  const idxId = cabecalho.indexOf('ID');
  const idxStatus = cabecalho.indexOf('Status');
  const idxRodotremId = cabecalho.indexOf('RodotremID');
  const idxDestinos = cabecalho.indexOf('Destinos');
  const idxUltimaEdicao = cabecalho.indexOf('UltimaEdicao');

  let linha1 = -1, linha2 = -1, destinos1 = '', destinos2 = '';
  for (let i = 1; i < dadosCarretas.length; i++) {
    if (Number(dadosCarretas[i][idxId]) === Number(dados.carreta1Id)) { linha1 = i; destinos1 = dadosCarretas[i][idxDestinos]; }
    if (Number(dadosCarretas[i][idxId]) === Number(dados.carreta2Id)) { linha2 = i; destinos2 = dadosCarretas[i][idxDestinos]; }
  }
  if (linha1 === -1 || linha2 === -1) throw new Error('Carreta não encontrada.');

  const destinosConsolidados = [...new Set(
    (destinos1 + ', ' + destinos2).split(',').map(d => d.trim()).filter(Boolean)
  )].join(', ');

  const rodoFrotasStr = (dados.rodoFrotas || []).map(f => String(f || '').trim()).filter(Boolean).join('/');
  const rodoMotorista = (dados.rodoMotorista || '').trim();

  const idRodotrem = proximoId_(abaRodotrens);
  const agora = new Date();
  const usuario = usuarioAtual_();

  abaRodotrens.appendRow([
    idRodotrem, agora, dados.carreta1Id, dados.carreta2Id, destinosConsolidados,
    dados.numeroPedido, 'Montado', dados.prioridade ? 'Urgente' : 'Normal',
    dados.observacoes || '', usuario, '', rodoFrotasStr, rodoMotorista
  ]);

  abaCarretas.getRange(linha1 + 1, idxStatus + 1).setValue('Carregado');
  abaCarretas.getRange(linha1 + 1, idxRodotremId + 1).setValue(idRodotrem);
  abaCarretas.getRange(linha1 + 1, idxUltimaEdicao + 1).setValue(agora);
  abaCarretas.getRange(linha2 + 1, idxStatus + 1).setValue('Carregado');
  abaCarretas.getRange(linha2 + 1, idxRodotremId + 1).setValue(idRodotrem);
  abaCarretas.getRange(linha2 + 1, idxUltimaEdicao + 1).setValue(agora);

  logAlteracao_('Montar Rodotrem', 'Rodotrem ID ' + idRodotrem + ' - Pedido ' + dados.numeroPedido);

  return { sucesso: true, id: idRodotrem, destinos: destinosConsolidados };
}

function getRodotrens() {
  return lerTodos_(SHEET_RODOTRENS).sort((a, b) => new Date(b.DataHora) - new Date(a.DataHora));
}

function getDetalheRodotrem(id) {
  const rodotrem = lerTodos_(SHEET_RODOTRENS).find(r => Number(r.ID) === Number(id));
  if (!rodotrem) throw new Error('Rodotrem não encontrado.');

  const carretas = lerTodos_(SHEET_CARRETAS).filter(
    c => Number(c.ID) === Number(rodotrem.Carreta1ID) || Number(c.ID) === Number(rodotrem.Carreta2ID)
  );
  const nfs = lerTodos_(SHEET_NFS);
  carretas.forEach(c => {
    c.nfs = nfs.filter(n => Number(n.CarretaID) === Number(c.ID)).map(n => n.NumeroNF);
  });

  return { rodotrem: rodotrem, carretas: carretas };
}

// ---------------------------------------------------------------------
// E-MAIL DE SOLICITAÇÃO DE ROTA
// ---------------------------------------------------------------------

function gerarCorpoEmail(rodotremId, destinosSelecionados) {
  const detalhe = getDetalheRodotrem(rodotremId);
  const rodotrem = detalhe.rodotrem;
  const todosDestinos = getDestinos();

  const linhasDestino = destinosSelecionados.map(nome => {
    const d = todosDestinos.find(x => x.Nome === nome);
    return d ? (d.Nome + ' (' + d.CNPJ + ')') : nome;
  }).join(' x ');

  const frotas = rodotrem.RodoFrotas || '';
  const motorista = rodotrem.RodoMotorista || '';
  const localTitulo = destinosSelecionados.length === 1 ? ('EM ' + destinosSelecionados[0].split(' - ')[0].replace('RS/', '').replace(/-/g, ' ')) : 'NO RIO GRANDE DO SUL';
  const urgente = rodotrem.Prioridade === 'Urgente';

  const assunto = 'ENTREGA DA JBS ' + localTitulo;

  let corpo = 'Bom dia!\n\n';
  corpo += 'Por favor, criar rota para essa entrega da JBS ' + localTitulo.toLowerCase() + '\n\n';
  corpo += 'BASE X ' + linhasDestino + '\n\n';
  if (urgente) {
    corpo += 'PRIORIZAR AS ENTREGAS QUE ESTÃO EM VERMELHO\n\n';
  }
  corpo += 'FROTA: ' + frotas + '\n';
  corpo += motorista + '\n\n';
  corpo += 'Atenciosamente,';

  return { assunto: assunto, corpo: corpo, destinatarios: lerTodos_(SHEET_CONFIG_EMAIL).map(e => e.Email) };
}

function enviarEmailRota(rodotremId, destinosSelecionados, modo) {
  const email = gerarCorpoEmail(rodotremId, destinosSelecionados);

  if (modo === 'rascunho') {
    GmailApp.createDraft(
      email.destinatarios.join(','), email.assunto, email.corpo
    );
    logAlteracao_('E-mail Rota (rascunho)', 'Rodotrem ID ' + rodotremId);
    return { sucesso: true, modo: 'rascunho' };
  } else {
    GmailApp.sendEmail(
      email.destinatarios.join(','), email.assunto, email.corpo
    );
    logAlteracao_('E-mail Rota (enviado)', 'Rodotrem ID ' + rodotremId);
    return { sucesso: true, modo: 'automatico' };
  }
}

// ---------------------------------------------------------------------
// DASHBOARD E MÉTRICAS
// ---------------------------------------------------------------------

function getDashboardData() {
  const aguardando = getCarretasAguardando();
  const rodotrens = getRodotrens();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const montadosHoje = rodotrens.filter(r => {
    const d = new Date(r.DataHora);
    return d >= hoje;
  }).length;

  return {
    totalAguardando: aguardando.length,
    urgentes: aguardando.filter(c => c.prioridade === 'Urgente').length,
    comAlerta: aguardando.filter(c => c.alerta).length,
    montadosHoje: montadosHoje,
    aguardando: aguardando,
    ultimosRodotrens: rodotrens.slice(0, 8)
  };
}

function getMetricas() {
  const carretas = lerTodos_(SHEET_CARRETAS).filter(c => c.Status === 'Carregado');
  const rodotrens = lerTodos_(SHEET_RODOTRENS);

  const tempos = carretas.map(c => {
    const rodotrem = rodotrens.find(r => Number(r.ID) === Number(c.RodotremID));
    if (!rodotrem) return null;
    const horas = (new Date(rodotrem.DataHora) - new Date(c.DataHora)) / (1000 * 60 * 60);
    return { destino: c.Destinos, horas: horas };
  }).filter(Boolean);

  const tempoMedioGeral = tempos.length ? tempos.reduce((s, t) => s + t.horas, 0) / tempos.length : 0;

  const porDestino = {};
  tempos.forEach(t => {
    if (!porDestino[t.destino]) porDestino[t.destino] = [];
    porDestino[t.destino].push(t.horas);
  });
  const mediaPorDestino = Object.keys(porDestino).map(destino => ({
    destino: destino,
    horas: Math.round((porDestino[destino].reduce((s, h) => s + h, 0) / porDestino[destino].length) * 10) / 10
  }));

  return {
    tempoMedioGeralHoras: Math.round(tempoMedioGeral * 10) / 10,
    porDestino: mediaPorDestino,
    totalRodotrensMontados: rodotrens.length
  };
}

// ---------------------------------------------------------------------
// HISTÓRICO E BUSCA
// ---------------------------------------------------------------------

function buscarHistorico(termo) {
  const rodotrens = lerTodos_(SHEET_RODOTRENS);
  const carretas = lerTodos_(SHEET_CARRETAS);
  const nfs = lerTodos_(SHEET_NFS);
  const termoLower = String(termo || '').toLowerCase().trim();

  if (!termoLower) {
    return rodotrens.sort((a, b) => new Date(b.DataHora) - new Date(a.DataHora)).slice(0, 50);
  }

  return rodotrens.filter(r => {
    const carretasDoRodotrem = carretas.filter(
      c => Number(c.ID) === Number(r.Carreta1ID) || Number(c.ID) === Number(r.Carreta2ID)
    );
    const nfsDoRodotrem = nfs.filter(n =>
      carretasDoRodotrem.some(c => Number(c.ID) === Number(n.CarretaID))
    ).map(n => String(n.NumeroNF));

    const campos = [
      String(r.NumeroPedido), String(r.Destinos), String(r.ID),
      ...carretasDoRodotrem.map(c => c.Placa), ...nfsDoRodotrem
    ].join(' ').toLowerCase();

    return campos.includes(termoLower);
  }).sort((a, b) => new Date(b.DataHora) - new Date(a.DataHora));
}

function exportarHistorico() {
  const rodotrens = lerTodos_(SHEET_RODOTRENS);
  const carretas = lerTodos_(SHEET_CARRETAS);
  const nfs = lerTodos_(SHEET_NFS);

  const pasta = pastaProjeto_();
  const nomeArquivo = 'Exportacao_Rodotrens_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  const novaPlanilha = SpreadsheetApp.create(nomeArquivo);
  const aba = novaPlanilha.getSheets()[0];
  aba.setName('Rodotrens');

  aba.appendRow(['ID', 'Data', 'Pedido', 'Destinos', 'Frota 1', 'Frota 2', 'NFs', 'Status']);
  rodotrens.forEach(r => {
    const c1 = carretas.find(c => Number(c.ID) === Number(r.Carreta1ID));
    const c2 = carretas.find(c => Number(c.ID) === Number(r.Carreta2ID));
    const nfsRelacionadas = nfs.filter(n =>
      Number(n.CarretaID) === Number(r.Carreta1ID) || Number(n.CarretaID) === Number(r.Carreta2ID)
    ).map(n => n.NumeroNF).join(', ');

    aba.appendRow([
      r.ID, r.DataHora, r.NumeroPedido, r.Destinos,
      c1 ? c1.Placa : '', c2 ? c2.Placa : '', nfsRelacionadas, r.Status
    ]);
  });

  const arquivo = DriveApp.getFileById(novaPlanilha.getId());
  const pastaAlvo = pastaProjeto_();
  pastaAlvo.addFile(arquivo);
  DriveApp.getRootFolder().removeFile(arquivo);

  logAlteracao_('Exportação', nomeArquivo);

  return { sucesso: true, link: novaPlanilha.getUrl(), nome: nomeArquivo };
}

// ---------------------------------------------------------------------
// COMPROVANTE PDF
// ---------------------------------------------------------------------

function gerarComprovantePDF(rodotremId) {
  const detalhe = getDetalheRodotrem(rodotremId);
  const rodotrem = detalhe.rodotrem;
  const carretas = detalhe.carretas;

  let html = '<html><body style="font-family: Arial, sans-serif;">';
  html += '<h2>Comprovante Rodotrem #' + rodotrem.ID + '</h2>';
  html += '<p><b>Frota(s) do Rodotrem:</b> ' + (rodotrem.RodoFrotas || '-') + '</p>';
  html += '<p><b>Motorista do Rodotrem:</b> ' + (rodotrem.RodoMotorista || '-') + '</p>';
  html += '<p><b>Pedido:</b> ' + rodotrem.NumeroPedido + '</p>';
  html += '<p><b>Data/Hora:</b> ' + rodotrem.DataHora + '</p>';
  html += '<p><b>Destinos:</b> ' + rodotrem.Destinos + '</p>';
  html += '<p><b>Status:</b> ' + rodotrem.Status + '</p>';
  html += '<h3>Carretas</h3>';
  carretas.forEach(c => {
    html += '<p><b>Placa:</b> ' + c.Placa + ' | <b>Motorista:</b> ' + c.Motorista + '</p>';
    html += '<p><b>NFs:</b> ' + c.nfs.join(', ') + '</p><hr>';
  });
  if (rodotrem.Observacoes) {
    html += '<p><b>Observações:</b> ' + rodotrem.Observacoes + '</p>';
  }
  html += '</body></html>';

  const blob = Utilities.newBlob(html, 'text/html').getAs('application/pdf')
    .setName('Comprovante_Rodotrem_' + rodotrem.ID + '.pdf');

  const pasta = pastaProjeto_();
  const arquivo = pasta.createFile(blob);

  logAlteracao_('Comprovante PDF', 'Rodotrem ID ' + rodotremId);

  return { sucesso: true, link: arquivo.getUrl() };
}

// ---------------------------------------------------------------------
// DRIVE - PASTA DO PROJETO
// ---------------------------------------------------------------------

function pastaProjeto_() {
  const nomePasta = 'Controle Rodotrem JBS - Arquivos';
  const pastas = DriveApp.getFoldersByName(nomePasta);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(nomePasta);
}

// ---------------------------------------------------------------------
// BACKUP AUTOMÁTICO
// ---------------------------------------------------------------------

function executarBackupAutomatico() {
  const ss = ss_();
  const nomeBackup = 'Backup_ControleRodotrem_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  const arquivoOriginal = DriveApp.getFileById(ss.getId());
  const copia = arquivoOriginal.makeCopy(nomeBackup);

  const pasta = pastaProjeto_();
  const subPastaBackups = subPasta_(pasta, 'Backups');
  subPastaBackups.addFile(copia);
  DriveApp.getRootFolder().removeFile(copia);

  sheet_(SHEET_BACKUP_LOG).appendRow([new Date(), nomeBackup, copia.getUrl()]);
}

function subPasta_(pastaPai, nome) {
  const iter = pastaPai.getFoldersByName(nome);
  if (iter.hasNext()) return iter.next();
  return pastaPai.createFolder(nome);
}

// ---------------------------------------------------------------------
// RESUMO MENSAL AUTOMÁTICO
// ---------------------------------------------------------------------

function executarResumoMensal() {
  const rodotrens = lerTodos_(SHEET_RODOTRENS);
  const carretas = lerTodos_(SHEET_CARRETAS);

  const agora = new Date();
  const mesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const inicioMes = new Date(mesPassado.getFullYear(), mesPassado.getMonth(), 1);
  const fimMes = new Date(mesPassado.getFullYear(), mesPassado.getMonth() + 1, 0, 23, 59, 59);

  const rodotrensDoMes = rodotrens.filter(r => {
    const d = new Date(r.DataHora);
    return d >= inicioMes && d <= fimMes;
  });

  const carretasDoMes = carretas.filter(c => {
    const d = new Date(c.DataHora);
    return d >= inicioMes && d <= fimMes;
  });

  const porDestino = {};
  carretasDoMes.forEach(c => {
    const destino = c.Destinos || 'Não informado';
    porDestino[destino] = (porDestino[destino] || 0) + 1;
  });

  const tempos = carretasDoMes.filter(c => c.Status === 'Carregado').map(c => {
    const r = rodotrensDoMes.find(rt => Number(rt.ID) === Number(c.RodotremID));
    if (!r) return null;
    return (new Date(r.DataHora) - new Date(c.DataHora)) / (1000 * 60 * 60);
  }).filter(Boolean);
  const tempoMedio = tempos.length ? tempos.reduce((s, t) => s + t, 0) / tempos.length : 0;

  const mesAnoLabel = Utilities.formatDate(inicioMes, Session.getScriptTimeZone(), 'MM/yyyy');

  sheet_(SHEET_RESUMOS).appendRow([
    mesAnoLabel, rodotrensDoMes.length, carretasDoMes.length,
    JSON.stringify(porDestino), Math.round(tempoMedio * 10) / 10, new Date()
  ]);

  // Envia por e-mail pro próprio usuário (dono do script)
  const destinatario = Session.getEffectiveUser().getEmail();
  if (destinatario) {
    let corpo = 'Resumo do mês ' + mesAnoLabel + '\n\n';
    corpo += 'Total de rodotrens montados: ' + rodotrensDoMes.length + '\n';
    corpo += 'Total de carretas recebidas: ' + carretasDoMes.length + '\n';
    corpo += 'Tempo médio de fechamento: ' + (Math.round(tempoMedio * 10) / 10) + ' horas\n\n';
    corpo += 'Carretas por destino:\n';
    Object.keys(porDestino).forEach(d => {
      corpo += '- ' + d + ': ' + porDestino[d] + '\n';
    });

    GmailApp.sendEmail(destinatario, 'Resumo Mensal - Controle Rodotrem JBS (' + mesAnoLabel + ')', corpo);
  }
}

function getResumosMensais() {
  return lerTodos_(SHEET_RESUMOS).sort((a, b) => new Date(b.GeradoEm) - new Date(a.GeradoEm));
}
