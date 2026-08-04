/**
 * ===================================================================
 * SISTEMA DE CLASSIFICAÇÃO E COMPARAÇÃO DE AGENDAMENTOS (13h x 18h)
 * ===================================================================
 *
 * Estrutura de abas nesta planilha (criadas automaticamente):
 *  - "Cadastro de Clientes"  -> você mantém manualmente (persiste sempre)
 *  - "Config"                -> guarda metadados (não editar)
 *  - Abas de trabalho são geradas e regeneradas a cada envio:
 *      "Agendamento", "Clientes", "Não Clientes", "Não Cadastrados",
 *      "Comparativo 13h x 18h"
 *
 * Pasta no Drive "Agendamentos - Snapshots 13h" guarda uma cópia de
 * cada envio das 13h (para a comparação das 18h), com limpeza
 * automática de arquivos com mais de 7 dias.
 * ===================================================================
 */

const SHEET_CADASTRO = 'Cadastro de Clientes';
const SHEET_CONFIG = 'Config';
const SHEET_AGENDAMENTO = 'Agendamento';
const SHEET_CLIENTES = 'Clientes';
const SHEET_NAO_CLIENTES = 'Não Clientes';
const SHEET_NAO_CADASTRADOS = 'Não Cadastrados';
const SHEET_COMPARATIVO = 'Comparativo 13h x 18h';
const DRIVE_FOLDER_NAME = 'Agendamentos - Snapshots 13h';
const SNAPSHOT_RETENTION_DAYS = 7;

const COLS = {
  AREA: 0, AGENDA: 1, FORNECEDOR: 2, NOTA_FISCAL: 3, PEDIDO: 4,
  TRANSPORTADORA: 5, VOLUMES: 6, VALOR_NF: 7, LAMINA: 8, SITUACAO: 9
};
const HEADERS = ['Area', 'Agenda', 'Fornecedor', 'Nota Fiscal', 'Pedido',
  'Transportadora', 'Volumes', 'Valor NF (contábil)', 'Lâmina de exposição', 'Situação'];
// Abas filtradas (Clientes / Não Clientes / Não Cadastrados): Area, Agenda, Fornecedor, Nota Fiscal
// + uma 5ª coluna em branco (sem cabeçalho, sem dados) no lugar onde era "Pedido", para anotações manuais após impressão
const HEADERS_FILTRADAS = ['Area', 'Agenda', 'Fornecedor', 'Nota Fiscal', ''];

// Cores no mesmo padrão visual do arquivo original recebido todos os dias
const COR_HEADER_BG = '#468AB4';
const COR_HEADER_FONT = '#FFFFFF';
const COR_SEPARADOR_SETOR_BG = '#DBECFC'; // linha vazia destacada antes de cada bloco de setor
const COR_SUBTOTAL_BG = '#468AB4';
const COR_SUBTOTAL_FONT = '#FFFFFF';

// -------------------------------------------------------------------
// MENU
// -------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Agendamentos')
    .addItem('📤 Enviar arquivo (13h ou 18h)', 'showUploadDialog')
    .addItem('🔄 Importar/Sincronizar lista de clientes', 'showSyncClientesDialog')
    .addItem('⚙️ Garantir abas/estrutura', 'ensureBaseStructure')
    .addItem('🧹 Limpar snapshots antigos do Drive agora', 'cleanupOldSnapshots')
    .addToUi();
  ensureBaseStructure();
}

function showUploadDialog() {
  ensureBaseStructure();
  const html = HtmlService.createHtmlOutputFromFile('UploadDialog')
    .setWidth(480)
    .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Enviar arquivo de agendamento');
}

function showSyncClientesDialog() {
  ensureBaseStructure();
  const html = HtmlService.createHtmlOutputFromFile('SyncClientesDialog')
    .setWidth(480)
    .setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'Importar/Sincronizar lista de clientes');
}


// -------------------------------------------------------------------
// ESTRUTURA BASE
// -------------------------------------------------------------------
function ensureBaseStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let justCreatedCadastro = false;

  let cad = ss.getSheetByName(SHEET_CADASTRO);
  if (!cad) {
    cad = ss.insertSheet(SHEET_CADASTRO);
    cad.getRange('A1:C1').setValues([[
      'Fornecedor (nome exatamente como aparece no Agendamento)',
      'Status',
      'Nomes Alternativos (separados por vírgula)'
    ]]);
    cad.getRange('A1:C1').setFontWeight('bold').setBackground('#468AB4').setFontColor('#FFFFFF');
    cad.setColumnWidth(1, 420);
    cad.setColumnWidth(2, 110);
    cad.setColumnWidth(3, 420);
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Ativo', 'Inativo'], true)
      .setAllowInvalid(false)
      .build();
    cad.getRange('B2:B1000').setDataValidation(rule);
    cad.setFrozenRows(1);
    justCreatedCadastro = true;
  } else {
    // Migração: se a planilha já existia sem a coluna C, adiciona agora
    const headerC = String(cad.getRange('C1').getValue() || '').trim();
    if (!headerC) {
      cad.getRange('C1').setValue('Nomes Alternativos (separados por vírgula)')
        .setFontWeight('bold').setBackground('#468AB4').setFontColor('#FFFFFF');
      cad.setColumnWidth(3, 420);
    }
  }

  if (!ss.getSheetByName(SHEET_CONFIG)) {
    const cfg = ss.insertSheet(SHEET_CONFIG);
    cfg.hideSheet();
    cfg.getRange('A1:B1').setValues([['chave', 'valor']]);
  }

  // Só troca a aba ativa na primeira vez que cria o Cadastro (ex: abertura inicial da planilha)
  if (justCreatedCadastro) {
    ss.setActiveSheet(ss.getSheetByName(SHEET_CADASTRO));
  }
}

function getConfigSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
}

function setConfigValue(key, value) {
  const cfg = getConfigSheet();
  const data = cfg.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      cfg.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  cfg.appendRow([key, value]);
}

function getConfigValue(key) {
  const cfg = getConfigSheet();
  const data = cfg.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

// -------------------------------------------------------------------
// ENTRADA PRINCIPAL CHAMADA PELO DIALOG (UploadDialog.html)
// -------------------------------------------------------------------
/**
 * @param {string} base64Data  conteúdo do xlsx em base64 (sem prefixo data:...)
 * @param {string} fileName    nome original do arquivo, ex "24062026.xlsx"
 * @param {string} periodo     "13h" ou "18h" (confirmado/ajustado pelo usuário no dialog)
 * @return {Object} resultado com status, mensagens e (se aplicável) url de download
 */
function processarUploadedFile(base64Data, fileName, periodo) {
  ensureBaseStructure();

  const dateInfo = parseFileNameDate_(fileName);
  if (!dateInfo) {
    return { ok: false, message: 'Não consegui identificar a data no nome do arquivo "' + fileName + '". Esperado formato ddmmyyyy.xlsx (ex: 24062026.xlsx).' };
  }

  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName);

  // Converte o xlsx enviado num Google Sheets temporário para conseguir ler os dados nativamente
  const tempSpreadsheetId = convertXlsxBlobToTempSheet_(blob, fileName);
  let rows;
  try {
    rows = readAgendamentoRowsFromSpreadsheet_(tempSpreadsheetId);
  } finally {
    DriveApp.getFileById(tempSpreadsheetId).setTrashed(true);
  }

  if (periodo === '13h') {
    return handle13h_(rows, dateInfo, fileName);
  } else {
    return handle18h_(rows, dateInfo, fileName);
  }
}

// -------------------------------------------------------------------
// FLUXO 13h: classifica e salva snapshot no Drive
// -------------------------------------------------------------------
function handle13h_(rows, dateInfo, originalFileName) {
  const classified = classifyRows_(rows);
  writeAgendamentoSheets_(classified, null);

  // Salva snapshot no Drive para comparação posterior às 18h
  const folder = getOrCreateSnapshotFolder_();
  const snapshotName = 'snapshot_13h_' + dateInfo.iso + '.json';
  const payload = JSON.stringify(rows.map(rowToPlainObject_));
  // remove snapshot anterior do mesmo dia, se existir (reenvio)
  const existing = folder.getFilesByName(snapshotName);
  while (existing.hasNext()) existing.next().setTrashed(true);
  folder.createFile(snapshotName, payload, MimeType.PLAIN_TEXT);

  cleanupOldSnapshots();

  const outBlob = exportActiveWorkbookAsXlsx_();
  const outName = 'Agendamento_' + dateInfo.iso + '_13h_Classificado.xlsx';
  return finalizeDownload_(outBlob, outName,
    'Arquivo das 13h processado e classificado. Snapshot salvo para comparação às 18h.');
}

// -------------------------------------------------------------------
// FLUXO 18h: busca snapshot das 13h do mesmo dia, compara, classifica
// -------------------------------------------------------------------
function handle18h_(rows18h, dateInfo, originalFileName) {
  const folder = getOrCreateSnapshotFolder_();
  const snapshotName = 'snapshot_13h_' + dateInfo.iso + '.json';
  const files = folder.getFilesByName(snapshotName);

  let rows13h = null;
  if (files.hasNext()) {
    const content = files.next().getBlob().getDataAsString();
    rows13h = JSON.parse(content).map(plainObjectToRow_);
  }

  const classified = classifyRows_(rows18h);
  const comparison = rows13h ? compareRows_(rows13h, rows18h) : null;

  writeAgendamentoSheets_(classified, comparison);

  const outBlob = exportActiveWorkbookAsXlsx_();
  const outName = 'Agendamento_' + dateInfo.iso + '_18h_Confirmado.xlsx';

  // Salva uma cópia do xlsx final (já com a comparação) na mesma pasta dos snapshots
  const finalBlob = outBlob.copyBlob().setName(outName);
  const existingFinal = folder.getFilesByName(outName);
  while (existingFinal.hasNext()) existingFinal.next().setTrashed(true); // reenvio do mesmo dia substitui
  folder.createFile(finalBlob);

  let msg;
  if (!rows13h) {
    msg = 'Atenção: não encontrei o snapshot das 13h de ' + dateInfo.display +
      ' no Drive. Classifiquei o arquivo das 18h normalmente, mas não há comparativo. O arquivo também foi salvo no Drive, na pasta "' + DRIVE_FOLDER_NAME + '".';
  } else {
    msg = 'Comparação concluída: ' + comparison.confirmados.length + ' confirmados, ' +
      comparison.cancelados.length + ' cancelados, ' + comparison.alterados.length + ' alterados. ' +
      'O arquivo final também foi salvo no Drive, na pasta "' + DRIVE_FOLDER_NAME + '".';
  }
  return finalizeDownload_(outBlob, outName, msg);
}

// -------------------------------------------------------------------
// LEITURA DO XLSX ENVIADO (via conversão nativa para Google Sheets)
// -------------------------------------------------------------------
function convertXlsxBlobToTempSheet_(blob, fileName) {
  const resource = { title: 'TEMP_IMPORT_' + fileName + '_' + new Date().getTime(),
    mimeType: MimeType.GOOGLE_SHEETS };
  const file = Drive.Files.insert(resource, blob, { convert: true });
  return file.id;
}

function readAgendamentoRowsFromSpreadsheet_(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  // Detecta automaticamente a linha de cabeçalho procurando "Fornecedor"
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, values.length); i++) {
    if (values[i].indexOf('Fornecedor') !== -1) { headerRowIdx = i; break; }
  }

  const rows = [];
  let currentArea = '';
  for (let i = headerRowIdx + 1; i < values.length; i++) {
    const r = values[i];
    const area = r[COLS.AREA];
    const fornecedor = r[COLS.FORNECEDOR];
    if (area === 'Subtotal' || area === 'Total') continue;
    if (typeof area === 'string' && area) currentArea = area;
    if (!fornecedor) continue;

    // Lê a data/hora como string exibida pelo Sheets temporário (já no fuso correto da planilha
    // de origem) e reconstrói um Date sem ambiguidade de timezone.
    const agendaRaw = r[COLS.AGENDA];
    const agendaDisplay = displayValues[i][COLS.AGENDA];
    const agenda = parseDateFromDisplay_(agendaRaw, agendaDisplay);

    rows.push({
      area: currentArea,
      agenda: agenda,
      fornecedor: String(fornecedor).trim(),
      notaFiscal: r[COLS.NOTA_FISCAL],
      pedido: String(r[COLS.PEDIDO] || '').trim(),
      transportadora: r[COLS.TRANSPORTADORA],
      volumes: Number(r[COLS.VOLUMES]) || 0,
      valorNF: Number(r[COLS.VALOR_NF]) || 0,
      lamina: r[COLS.LAMINA],
      situacao: r[COLS.SITUACAO]
    });
  }
  return rows;
}

/**
 * Reconstrói uma data a partir da string exibida pelo Google Sheets (getDisplayValues),
 * evitando qualquer conversão de fuso horário que getValues() introduz.
 *
 * O Sheets temporário gerado pela conversão do xlsx exibe a data/hora exatamente como
 * estava no arquivo original. Ao parsear essa string diretamente, contornamos o problema
 * de o getValues() retornar objetos Date em UTC deslocados do horário local.
 *
 * O Date retornado usa Date.UTC() com os valores locais lidos da string, de forma que
 * ao ser escrito via setValues() na planilha destino (que tem fuso America/Sao_Paulo),
 * o Sheets o exiba corretamente no fuso local sem nenhum offset adicional.
 */
function parseDateFromDisplay_(rawValue, displayStr) {
  if (!displayStr || typeof displayStr !== 'string') return rawValue;

  // Tenta formato "M/D/YY H:MM" ou "M/D/YYYY H:MM" (padrão do Sheets temporário)
  // Exemplos: "6/24/26 5:00", "6/24/2026 5:00", "6/24/26 13:00"
  const m = displayStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return rawValue; // não reconheceu o formato, devolve o original sem alterar

  let year = parseInt(m[3]);
  if (year < 100) year += 2000; // "26" -> 2026
  const month = parseInt(m[1]) - 1; // Date usa 0-based
  const day   = parseInt(m[2]);
  const hour  = parseInt(m[4]);
  const min   = parseInt(m[5]);
  const sec   = m[6] ? parseInt(m[6]) : 0;

  // Cria o Date usando Date.UTC com os valores locais.
  // O Sheets, ao receber esse Date via setValues(), o armazena como timestamp UTC.
  // Como o número UTC = o número local, o Sheets exibirá a hora local correta
  // (o fuso da planilha destino é configurado como America/Sao_Paulo, que o
  // Sheets usa para exibir — mas o serial interno fica igual ao valor local lido).
  return new Date(Date.UTC(year, month, day, hour, min, sec));
}

// -------------------------------------------------------------------
// CLASSIFICAÇÃO CLIENTE / NÃO CLIENTE
// -------------------------------------------------------------------
function getClienteStatusList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cad = ss.getSheetByName(SHEET_CADASTRO);
  const values = cad.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < values.length; i++) {
    const nome = String(values[i][0] || '').trim();
    const status = String(values[i][1] || '').trim();
    const alternativosRaw = String(values[i][2] || '').trim();
    if (!nome) continue;

    list.push({ nome: nome, nomeNorm: normalizeNomeForMatch_(nome), status: status });

    if (alternativosRaw) {
      alternativosRaw.split(/[,;]/).forEach(function (alt) {
        const altTrim = alt.trim();
        if (altTrim) {
          list.push({ nome: altTrim, nomeNorm: normalizeNomeForMatch_(altTrim), status: status, nomePrincipal: nome });
        }
      });
    }
  }
  // Mais específico (nome normalizado mais longo) primeiro, para priorizar o match mais preciso
  list.sort(function (a, b) { return b.nomeNorm.length - a.nomeNorm.length; });
  return list;
}

/**
 * Remove acentos, pontuação e sufixos societários comuns (LTDA, S.A, ME, EIRELI, etc.)
 * para tornar a comparação entre nome fantasia e razão social mais robusta.
 */
function normalizeNomeForMatch_(nome) {
  let s = String(nome || '').toUpperCase();
  s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  s = s.replace(/[.,\-\/&]/g, ' ');
  s = s.replace(/\b(LTDA|S\/A|SA|S A|ME|EPP|EIRELI|EIRELLI|COMPANHIA|CIA|IND|COM|IMPORTACAO|EXPORTACAO|IMP|EXP|INDUSTRIA|COMERCIO|DE|E)\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Encontra o status (Ativo/Inativo) do fornecedor dado, usando:
 * 1. Igualdade exata do nome normalizado (mais seguro)
 * 2. Se não achar, "contém" em qualquer direção, priorizando o cadastro mais específico (nome mais longo)
 */
function findClienteStatus_(fornecedorNome, clienteList) {
  const fornecedorNorm = normalizeNomeForMatch_(fornecedorNome);
  if (!fornecedorNorm) return null;

  for (let i = 0; i < clienteList.length; i++) {
    if (clienteList[i].nomeNorm === fornecedorNorm) return clienteList[i].status;
  }
  for (let i = 0; i < clienteList.length; i++) {
    const c = clienteList[i].nomeNorm;
    if (!c) continue;
    if (fornecedorNorm.indexOf(c) !== -1 || c.indexOf(fornecedorNorm) !== -1) {
      return clienteList[i].status;
    }
  }
  return null;
}

function classifyRows_(rows) {
  const clienteList = getClienteStatusList_();
  return rows.map(function (row) {
    const status = findClienteStatus_(row.fornecedor, clienteList);
    let classificacao;
    if (status === 'Ativo') classificacao = 'Sim';
    else if (status === 'Inativo') classificacao = 'Não';
    else classificacao = 'Não cadastrado';
    return Object.assign({}, row, { classificacao: classificacao });
  });
}

// -------------------------------------------------------------------
// SINCRONIZAÇÃO DA LISTA DE CLIENTES (a partir de um xlsx no Drive)
// -------------------------------------------------------------------
/**
 * @param {string} linkOrId  link de compartilhamento do Drive ou o ID puro do arquivo
 * @return {Object} resultado com contagens de ativados/desativados/mantidos
 */
function sincronizarListaClientes(linkOrId) {
  ensureBaseStructure();

  const fileId = extractDriveFileId_(linkOrId);
  if (!fileId) {
    return { ok: false, message: 'Não consegui identificar o arquivo a partir do link/ID informado. Confirme se copiou o link de compartilhamento completo do Google Drive.' };
  }

  let file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (e) {
    return { ok: false, message: 'Não encontrei esse arquivo no Drive (ou não tenho acesso a ele). Verifique o link/ID e o compartilhamento.' };
  }

  const mimeType = file.getMimeType();
  let novosNomes;

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const XLS_MIME = 'application/vnd.ms-excel';

  if (mimeType === MimeType.GOOGLE_SHEETS) {
    novosNomes = readFirstColumnNamesFromSpreadsheet_(fileId);
  } else if (mimeType === XLSX_MIME || mimeType === XLS_MIME) {
    const tempId = convertXlsxBlobToTempSheet_(file.getBlob(), file.getName());
    try {
      novosNomes = readFirstColumnNamesFromSpreadsheet_(tempId);
    } finally {
      DriveApp.getFileById(tempId).setTrashed(true);
    }
  } else {
    return { ok: false, message: 'O arquivo encontrado não é um Excel (.xlsx) nem um Google Sheets. Tipo encontrado: ' + mimeType };
  }

  if (novosNomes.length === 0) {
    return { ok: false, message: 'Não encontrei nenhum nome na primeira coluna desse arquivo. Confira se os clientes estão na coluna A da primeira aba.' };
  }

  const result = applyClienteSync_(novosNomes);
  return {
    ok: true,
    message: 'Sincronização concluída: ' + result.ativados + ' marcados como Ativo, ' +
      result.desativados + ' marcados como Inativo, ' + result.mantidos + ' sem alteração.',
    detalhes: result
  };
}

function readFirstColumnNamesFromSpreadsheet_(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  const values = sheet.getRange(1, 1, lastRow, 1).getValues();

  // Se a primeira linha parecer um cabeçalho (contém palavras típicas), pula ela
  let startIdx = 0;
  const firstCellNorm = normalizeNomeForMatch_(values[0][0]);
  const headerKeywords = ['FORNECEDOR', 'CLIENTE', 'GRUPO', 'NOME', 'RAZAO SOCIAL', 'PESSOA', 'EMPRESA'];
  const looksLikeHeader = headerKeywords.some(function (kw) { return firstCellNorm.indexOf(kw) !== -1; });
  if (looksLikeHeader) startIdx = 1;

  // Padrões de linha de exemplo/template que devem ser ignorados mesmo fora da primeira linha
  const exemploPatterns = ['EXEMPLO', 'TESTE', 'MODELO', 'TEMPLATE'];

  const nomes = [];
  for (let i = startIdx; i < values.length; i++) {
    const nome = String(values[i][0] || '').trim();
    if (!nome) continue;
    const nomeNorm = normalizeNomeForMatch_(nome);
    const isExemplo = exemploPatterns.some(function (p) { return nomeNorm.indexOf(p) !== -1; });
    if (isExemplo) continue;
    nomes.push(nome);
  }
  return nomes;
}

function applyClienteSync_(novosNomes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cad = ss.getSheetByName(SHEET_CADASTRO);
  const lastRow = Math.max(cad.getLastRow(), 1);
  const existing = lastRow > 1 ? cad.getRange(2, 1, lastRow - 1, 2).getValues() : [];

  const novosSet = {};
  novosNomes.forEach(function (n) { novosSet[n.trim().toUpperCase()] = n.trim(); });

  const existingMap = {}; // NOME_UPPER -> { rowIndex (1-based dentro de existing), statusAtual }
  existing.forEach(function (row, idx) {
    const nome = String(row[0] || '').trim();
    if (nome) existingMap[nome.toUpperCase()] = { idx: idx, status: String(row[1] || '').trim() };
  });

  let ativados = 0, desativados = 0, mantidos = 0;
  const novasLinhasParaAdicionar = [];

  // Passo 1: para cada nome já cadastrado, decide Ativo/Inativo conforme está ou não na nova lista
  Object.keys(existingMap).forEach(function (nomeUpper) {
    const info = existingMap[nomeUpper];
    const deveSerAtivo = !!novosSet[nomeUpper];
    const novoStatus = deveSerAtivo ? 'Ativo' : 'Inativo';
    if (novoStatus !== info.status) {
      cad.getRange(info.idx + 2, 2).setValue(novoStatus); // +2: pula header (linha1) e ajusta 0-index
      if (novoStatus === 'Ativo') ativados++; else desativados++;
    } else {
      mantidos++;
    }
  });

  // Passo 2: nomes da nova lista que ainda não existem no cadastro -> adiciona como Ativo
  Object.keys(novosSet).forEach(function (nomeUpper) {
    if (!existingMap[nomeUpper]) {
      novasLinhasParaAdicionar.push([novosSet[nomeUpper], 'Ativo']);
      ativados++;
    }
  });

  if (novasLinhasParaAdicionar.length > 0) {
    const startRow = cad.getLastRow() + 1;
    cad.getRange(startRow, 1, novasLinhasParaAdicionar.length, 2).setValues(novasLinhasParaAdicionar);
  }

  return { ativados: ativados, desativados: desativados, mantidos: mantidos };
}

function extractDriveFileId_(linkOrId) {
  if (!linkOrId) return null;
  const s = linkOrId.trim();
  // Link padrão: .../d/FILE_ID/...
  let m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  // Parâmetro ?id=FILE_ID
  m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  // ID puro
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}


function rowKey_(row) {
  return [row.fornecedor.toUpperCase(), normalizeKeyPart_(row.notaFiscal), normalizeKeyPart_(row.pedido)].join('||');
}

function normalizeKeyPart_(v) {
  if (typeof v === 'number') {
    return (Math.round(v * 100) / 100).toString();
  }
  const s = String(v == null ? '' : v).trim();
  // se for uma string puramente numérica (ex "435196" ou "435196.0"), normaliza para número
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return (Math.round(parseFloat(s) * 100) / 100).toString();
  }
  return s.toUpperCase();
}

function compareRows_(rows13h, rows18h) {
  const map13 = {};
  rows13h.forEach(function (r) { map13[rowKey_(r)] = r; });
  const map18 = {};
  rows18h.forEach(function (r) { map18[rowKey_(r)] = r; });

  const confirmados = [];
  const alterados = [];
  const novos = [];
  const cancelados = [];

  Object.keys(map18).forEach(function (key) {
    const r18 = map18[key];
    const r13 = map13[key];
    if (!r13) {
      novos.push(r18);
      return;
    }
    const changedFields = diffRowFields_(r13, r18);
    if (changedFields.length === 0) {
      confirmados.push(r18);
    } else {
      alterados.push({ antes: r13, depois: r18, campos: changedFields });
    }
  });

  Object.keys(map13).forEach(function (key) {
    if (!map18[key]) cancelados.push(map13[key]);
  });

  return { confirmados: confirmados, alterados: alterados, novos: novos, cancelados: cancelados };
}

function diffRowFields_(r13, r18) {
  const fieldsToCompare = ['area', 'agenda', 'transportadora', 'volumes', 'valorNF', 'situacao'];
  const changed = [];
  fieldsToCompare.forEach(function (f) {
    const v13 = normalizeForCompare_(r13[f]);
    const v18 = normalizeForCompare_(r18[f]);
    if (v13 !== v18) changed.push(f);
  });
  return changed;
}

function normalizeForCompare_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  return String(v == null ? '' : v).trim();
}

// -------------------------------------------------------------------
// ESCRITA DAS ABAS DE SAÍDA
// -------------------------------------------------------------------
function clearSheetIfExists_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (sh) ss.deleteSheet(sh);
  return ss.insertSheet(name);
}

function writeAgendamentoSheets_(classifiedRows, comparison) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Aba Agendamento (com coluna extra "É Cliente?") ---
  const ag = clearSheetIfExists_(SHEET_AGENDAMENTO);
  const headerRow = HEADERS.concat(['É Cliente?']);
  ag.getRange(1, 1, 1, headerRow.length).setValues([headerRow])
    .setFontWeight('bold').setBackground(COR_HEADER_BG).setFontColor(COR_HEADER_FONT);

  const rowToArrayComCliente = function (r) {
    return [r.area, formatAgenda_(r.agenda), r.fornecedor, r.notaFiscal, r.pedido,
    r.transportadora, r.volumes, r.valorNF, r.lamina || '', r.situacao, r.classificacao];
  };
  const lastDataRow = writeRowsGroupedBySetor_(ag, classifiedRows, rowToArrayComCliente, headerRow.length);

  ag.setFrozenRows(1);
  autoResizeColumns_(ag, headerRow.length);
  ag.setColumnWidth(2, 110); // Agenda: largura mínima para mostrar data+hora sem "#######"

  // --- Totais por classificação (Cliente / Não Cliente) ---
  const totalRow = lastDataRow + 2;
  ag.getRange(totalRow, 3).setValue('TOTAIS GERAIS').setFontWeight('bold');
  ag.getRange(totalRow, 7).setFormula('=SUMIF(K2:K' + lastDataRow + ',"Sim",G2:G' + lastDataRow + ')');
  ag.getRange(totalRow, 8).setFormula('=SUMIF(K2:K' + lastDataRow + ',"Sim",H2:H' + lastDataRow + ')');
  ag.getRange(totalRow, 1).setValue('Clientes (Volumes / Valor NF):');
  ag.getRange(totalRow + 1, 1).setValue('Não Clientes (Volumes / Valor NF):');
  ag.getRange(totalRow + 1, 7).setFormula('=SUMIF(K2:K' + lastDataRow + ',"Não",G2:G' + lastDataRow + ')+SUMIF(K2:K' + lastDataRow + ',"Não cadastrado",G2:G' + lastDataRow + ')');
  ag.getRange(totalRow + 1, 8).setFormula('=SUMIF(K2:K' + lastDataRow + ',"Não",H2:H' + lastDataRow + ')+SUMIF(K2:K' + lastDataRow + ',"Não cadastrado",H2:H' + lastDataRow + ')');

  // --- Abas filtradas (mesmo agrupamento por setor, sem a coluna "É Cliente?") ---
  writeFilteredSheet_(SHEET_CLIENTES, classifiedRows.filter(function (r) { return r.classificacao === 'Sim'; }));
  writeFilteredSheet_(SHEET_NAO_CLIENTES, classifiedRows.filter(function (r) { return r.classificacao === 'Não'; }));
  writeFilteredSheet_(SHEET_NAO_CADASTRADOS, classifiedRows.filter(function (r) { return r.classificacao === 'Não cadastrado'; }));

  // --- Aba Comparativo (só quando houver) ---
  const existingComp = ss.getSheetByName(SHEET_COMPARATIVO);
  if (comparison) {
    writeComparativoSheet_(comparison);
  } else if (existingComp) {
    ss.deleteSheet(existingComp);
  }

  ss.setActiveSheet(ag);
  SpreadsheetApp.flush(); // garante que tudo escrito acima (dados, fórmulas, abas) foi aplicado antes de seguir
}

function writeFilteredSheet_(name, rows) {
  const sh = clearSheetIfExists_(name);
  sh.getRange(1, 1, 1, HEADERS_FILTRADAS.length).setValues([HEADERS_FILTRADAS])
    .setFontWeight('bold').setBackground(COR_HEADER_BG).setFontColor(COR_HEADER_FONT);

  // 5ª coluna (E) fica em branco de propósito — espaço para anotações manuais após impressão
  const rowToArrayFiltrada = function (r) {
    return [r.area, formatAgenda_(r.agenda), r.fornecedor, r.notaFiscal, ''];
  };
  writeRowsGroupedBySetor_(sh, rows, rowToArrayFiltrada, HEADERS_FILTRADAS.length, { noSubtotal: true });

  sh.setFrozenRows(1);
  autoResizeColumns_(sh, HEADERS_FILTRADAS.length - 1); // não redimensiona a coluna E em branco (ficaria minúscula)
  sh.setColumnWidth(2, 110); // Agenda: largura mínima para mostrar data+hora sem "#######"
  sh.setColumnWidth(5, 150); // coluna E em branco: largura razoável para anotações manuais
}

/**
 * Escreve as linhas (a partir da linha 2, já que a linha 1 é o cabeçalho) agrupadas por setor,
 * replicando o padrão visual do arquivo original recebido todos os dias:
 *   - linha vazia com fundo azul claro antes de cada bloco de setor
 *   - nome do setor só na coluna A da primeira linha de dados do bloco
 *   - linha "Subtotal" ao final do bloco (fundo azul forte, texto branco, com soma de Volumes/Valor NF)
 *     (omitida quando options.noSubtotal é true, ex: abas sem as colunas Volumes/Valor NF)
 * A ordem dos setores segue a ordem de primeira aparição nas linhas recebidas.
 *
 * @param {Object} [options] { noSubtotal: boolean } - quando true, não escreve a linha de
 *   Subtotal ao final de cada bloco (mantém apenas a linha separadora de setor antes do bloco).
 * @return {number} o número da última linha escrita (útil para fórmulas de total geral depois)
 */
function writeRowsGroupedBySetor_(sheet, rows, rowToArrayFn, numCols, options) {
  if (rows.length === 0) return 1; // nada além do cabeçalho
  const noSubtotal = !!(options && options.noSubtotal);

  // Agrupa mantendo a ordem de primeira aparição do setor
  const ordemSetores = [];
  const grupos = {};
  rows.forEach(function (r) {
    const setor = r.area || '(sem setor)';
    if (!grupos[setor]) {
      grupos[setor] = [];
      ordemSetores.push(setor);
    }
    grupos[setor].push(r);
  });

  let currentRow = 2;
  ordemSetores.forEach(function (setor) {
    const grupoRows = grupos[setor];

    // Linha separadora vazia com destaque azul claro, antes do bloco
    sheet.getRange(currentRow, 1, 1, numCols).setBackground(COR_SEPARADOR_SETOR_BG);
    currentRow++;

    // Linhas de dados do bloco; nome do setor só na primeira linha
    const matrix = grupoRows.map(function (r, idx) {
      const arr = rowToArrayFn(r);
      arr[0] = idx === 0 ? setor : ''; // coluna Area: só na primeira linha do bloco
      return arr;
    });
    sheet.getRange(currentRow, 1, matrix.length, numCols).setValues(matrix);
    // Coluna Agenda (col 2): escrita como string formatada via formatAgenda_(),
    // então não aplicamos formato de número — evita que o Sheets reinterprete o fuso.
    if (!noSubtotal) sheet.getRange(currentRow, 8, matrix.length, 1).setNumberFormat('#,##0.00');
    const blockFirstRow = currentRow;
    const blockLastRow = currentRow + matrix.length - 1;
    currentRow = blockLastRow + 1;

    if (!noSubtotal) {
      // Linha de Subtotal do bloco
      sheet.getRange(currentRow, 1).setValue('Subtotal');
      sheet.getRange(currentRow, 7).setFormula('=SUM(G' + blockFirstRow + ':G' + blockLastRow + ')');
      sheet.getRange(currentRow, 8).setFormula('=SUM(H' + blockFirstRow + ':H' + blockLastRow + ')');
      sheet.getRange(currentRow, 1, 1, numCols)
        .setBackground(COR_SUBTOTAL_BG).setFontColor(COR_SUBTOTAL_FONT).setFontWeight('bold');
      currentRow++;
    }
  });

  return currentRow - 1; // última linha efetivamente escrita (a do último Subtotal, ou do último bloco)
}

function writeComparativoSheet_(comparison) {
  const sh = clearSheetIfExists_(SHEET_COMPARATIVO);
  let row = 1;

  row = writeComparisonBlock_(sh, row, 'CONFIRMADOS (sem alteração)', '#34A853',
    comparison.confirmados.map(function (r) {
      return [r.fornecedor, r.notaFiscal, r.pedido, r.area, formatVal_(r.agenda), r.volumes, r.valorNF, r.situacao];
    }),
    ['Fornecedor', 'Nota Fiscal', 'Pedido', 'Area', 'Agenda', 'Volumes', 'Valor NF', 'Situação']);

  row += 2;
  row = writeComparisonBlock_(sh, row, 'NOVOS (apareceram só na confirmação das 18h)', '#4285F4',
    comparison.novos.map(function (r) {
      return [r.fornecedor, r.notaFiscal, r.pedido, r.area, formatVal_(r.agenda), r.volumes, r.valorNF, r.situacao];
    }),
    ['Fornecedor', 'Nota Fiscal', 'Pedido', 'Area', 'Agenda', 'Volumes', 'Valor NF', 'Situação']);

  row += 2;
  row = writeComparisonBlock_(sh, row, 'ALTERADOS (mudou algum dado entre 13h e 18h)', '#FBBC04',
    comparison.alterados.map(function (a) {
      return [a.depois.fornecedor, a.depois.notaFiscal, a.depois.pedido,
      a.campos.join(', '),
      formatVal_(a.antes.area) + ' → ' + formatVal_(a.depois.area),
      formatVal_(a.antes.agenda) + ' → ' + formatVal_(a.depois.agenda),
      formatVal_(a.antes.volumes) + ' → ' + formatVal_(a.depois.volumes),
      formatVal_(a.antes.valorNF) + ' → ' + formatVal_(a.depois.valorNF)];
    }),
    ['Fornecedor', 'Nota Fiscal', 'Pedido', 'Campos alterados', 'Area (antes → depois)', 'Agenda (antes → depois)', 'Volumes (antes → depois)', 'Valor NF (antes → depois)']);

  row += 2;
  writeComparisonBlock_(sh, row, 'CANCELADOS (estavam às 13h e não vieram na confirmação das 18h)', '#EA4335',
    comparison.cancelados.map(function (r) {
      return [r.fornecedor, r.notaFiscal, r.pedido, r.area, formatVal_(r.agenda), r.volumes, r.valorNF, r.situacao];
    }),
    ['Fornecedor', 'Nota Fiscal', 'Pedido', 'Area', 'Agenda', 'Volumes', 'Valor NF', 'Situação']);

  sh.autoResizeColumns(1, 8);
}

function writeComparisonBlock_(sh, startRow, title, color, matrix, headers) {
  sh.getRange(startRow, 1).setValue(title).setFontWeight('bold').setFontColor(color).setFontSize(12);
  startRow++;
  sh.getRange(startRow, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#EAF3FD');
  startRow++;
  if (matrix.length > 0) {
    sh.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
  } else {
    sh.getRange(startRow, 1).setValue('(nenhum registro)').setFontColor('#999999').setFontStyle('italic');
  }
  return startRow + matrix.length + 1;
}

function autoResizeColumns_(sheet, numCols) {
  for (let c = 1; c <= numCols; c++) sheet.autoResizeColumn(c);
}

/**
 * Formata a data de agenda para string no padrão dd/MM/yy HH:mm, para ser escrita
 * nas células como texto puro. Isso evita que o Sheets aplique conversão de fuso horário
 * ao exibir o valor — o que aconteceria se escrevêssemos um objeto Date diretamente.
 */
function formatAgenda_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // O Date foi construído com Date.UTC() usando os valores locais (ver parseDateFromDisplay_),
    // então extraímos diretamente os componentes UTC para montar a string local correta.
    const dd   = String(v.getUTCDate()).padStart(2, '0');
    const mm   = String(v.getUTCMonth() + 1).padStart(2, '0');
    const yy   = String(v.getUTCFullYear()).slice(-2);
    const hh   = String(v.getUTCHours()).padStart(2, '0');
    const min  = String(v.getUTCMinutes()).padStart(2, '0');
    return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + min;
  }
  return v === null || v === undefined ? '' : String(v);
}

function formatVal_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Datas foram construídas com Date.UTC() usando valores locais — usa getUTC* para extrair.
    const dd  = String(v.getUTCDate()).padStart(2, '0');
    const mm  = String(v.getUTCMonth() + 1).padStart(2, '0');
    const yy  = String(v.getUTCFullYear()).slice(-2);
    const hh  = String(v.getUTCHours()).padStart(2, '0');
    const min = String(v.getUTCMinutes()).padStart(2, '0');
    return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + min;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    // Datas vindas do snapshot JSON (ISO string): parseia e aplica o mesmo tratamento.
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      const dd  = String(d.getUTCDate()).padStart(2, '0');
      const mm  = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yy  = String(d.getUTCFullYear()).slice(-2);
      const hh  = String(d.getUTCHours()).padStart(2, '0');
      const min = String(d.getUTCMinutes()).padStart(2, '0');
      return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + min;
    }
  }
  if (v === null || v === undefined || v === '') return '(vazio)';
  return String(v);
}

// -------------------------------------------------------------------
// EXPORTAÇÃO XLSX E DOWNLOAD
// -------------------------------------------------------------------
function exportActiveWorkbookAsXlsx_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.flush(); // garante que todas as escritas/fórmulas pendentes sejam aplicadas e recalculadas antes de exportar
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  return response.getBlob();
}

function finalizeDownload_(blob, fileName, message) {
  const folder = getOrCreateOutputFolder_();
  blob.setName(fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    ok: true,
    message: message,
    fileName: fileName,
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
    driveUrl: file.getUrl()
  };
}

// -------------------------------------------------------------------
// DRIVE: PASTAS DE SNAPSHOT E SAÍDA, LIMPEZA AUTOMÁTICA
// -------------------------------------------------------------------
function getOrCreateSnapshotFolder_() {
  return getOrCreateFolder_(DRIVE_FOLDER_NAME);
}

function getOrCreateOutputFolder_() {
  return getOrCreateFolder_('Agendamentos - Arquivos Gerados');
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function cleanupOldSnapshots() {
  const folder = getOrCreateSnapshotFolder_();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SNAPSHOT_RETENTION_DAYS);
  const files = folder.getFiles();
  let removed = 0;
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated() < cutoff) {
      f.setTrashed(true);
      removed++;
    }
  }
  return removed;
}

/** Trigger diário sugerido: criar via Editar > Acionadores do projeto, function = cleanupOldSnapshotsTrigger */
function cleanupOldSnapshotsTrigger() {
  cleanupOldSnapshots();
}

// -------------------------------------------------------------------
// UTILITÁRIOS
// -------------------------------------------------------------------
function parseFileNameDate_(fileName) {
  const match = fileName.match(/(\d{2})(\d{2})(\d{4})/);
  if (!match) return null;
  const dd = match[1], mm = match[2], yyyy = match[3];
  return {
    iso: yyyy + '-' + mm + '-' + dd,
    display: dd + '/' + mm + '/' + yyyy
  };
}

function rowToPlainObject_(r) {
  return {
    area: r.area, agenda: r.agenda instanceof Date ? r.agenda.toISOString() : r.agenda,
    fornecedor: r.fornecedor, notaFiscal: r.notaFiscal, pedido: r.pedido,
    transportadora: r.transportadora, volumes: r.volumes, valorNF: r.valorNF,
    lamina: r.lamina, situacao: r.situacao
  };
}

function plainObjectToRow_(o) {
  return Object.assign({}, o, { agenda: o.agenda ? new Date(o.agenda) : '' });
}