// ============================================================
//   CONTROLE DE DEVOLUÇÕES v6.0 — OTIMIZAÇÃO COMPLETA
//
//  v5.7 (onEdit / status / dashboard):
//  [P01] syncCheckboxes: 3 setValue → 1 setValues batch (cols 12-14)
//  [P02] contarTotalConcluidos: O(n×3abas) → O(1) PropertiesService
//  [P03] _atualizarMetricasDashboard: debounce 8s via CacheService
//  [P04] protegerLinhaConcluida: contador Properties (não itera abas)
//  [P05] aplicarCorLinha: aceita dtOpcional, evita getValue extra
//  [P06] onOpen: reaplicarCores só quando cache de 1h expirou
//  [P07] _gravarLancamento: remove 3 setNumberFormat redundantes
//  [P08] _aplicarStatus: status+chk+obs em 1 setValues 1×5 por linha
//  [P09] _registrarLogAba: NFD+NF em 1 getRange 1×2
//  [P10] configurarPlanilha: reseta contadores/caches
//
//  v5.8 (auditoria completa — todas as funções):
//  [P11] registrarLog: appendRow → getLastRow+setValues (~30% mais rápido)
//  [P12] onEdit: valoresNF só lido quando col === COL_NF (evita getRange)
//  [P13] onEdit: 3 if de checkboxes → 1 if + 1 getValue compartilhado
//  [P14] _aplicarStatus: status+chk+obs em 1 setValues 1×5 (cols 11-15)
//  [P15] _moverParaHistorico: N appendRow → 1 setValues batch
//  [P16] executarExportarPDF: N×5 setValue → batch por linha + cores batch
//  [P17] executarExportarPDF: saveAndClose() redundante removido
//  [P18] executarBaixaVenda: N×5 setValue → 1 setValues 1×5 por item
//  [P19] salvarLancamentoForm: COL_NF lida 1× (antes eram 3×)
//  [P20] _gravarLancamento: upload Drive fora do ScriptLock
//  [P21] executarReabertura: getProtections() 1× por aba (não por NF)
//  [P22] executarReabertura: status+chk+obs em 1 setValues 1×5 por NF
//  [P23] enviarEmailDevolucao: DriveApp.getFileById 1× por arquivo
//  [P24] buscarHistoricoNF: lê últimas 500 linhas (não coluna inteira)
//  [P25] _gerarRelatorioPDF: cores da tabela em 2 setBackgrounds (não N×2)
//  [P26] _gerarRelatorioPDF: reusa pdfBlob em memória (não relê do Drive)
//  [P27] executarRestauracao: proteções em mapa, setValues em batch por aba
//  [P28] navegarParaLinha: flush() desnecessário removido
//  [P29] enviarResumoSemanal: 7 passes no array → 1 loop acumulador
//  [P30] FormReabertura.html: itensEncontrados passados direto ao servidor
//
//  v6.0 (unificação de formulários + painel de auditoria):
//  [P31] FormAuditoria.html: painel unificado (NF + e-mails + log)
//  [P32] Menu atualizado com todas as entradas v6.0
//  [P33] obterDiagnostico: retorna versão v6.0 corretamente
//  [P34] executarExportarPDF: saveAndClose() restaurado (fix PDF em branco)
//
//  v6.1 (resumo de pendências + dias armazenado + frete da devolução):
//  [P35] formatarAba: linha 2 passa a exibir resumo ao vivo (fórmulas SUMIFS/COUNTIFS)
//        de Produtos, NFs e Valor — somando apenas itens "Pendente"
//  [P36] Nova coluna 18 "Dias Armazenado" (fórmula =TODAY()-Data) em todas as abas,
//        Historico_Arquivo e _Backup_Snapshot; refeita em arquivamento/restauração/exclusão
//  [P37] Novas colunas 19/20 "Tipo de Frete" e "Valor Frete (R$)" — preenchidas via
//        novo menu "🚚 Programar Frete da Devolução" (FormProgramarFrete.html)
//  [P38] Novas funções: abrirProgramarFrete, buscarNFParaProgramar, salvarProgramacaoFrete
//  [P39] TOTAL_COLUNAS 17→20 e BACKUP_TOTAL_COL 19→22 (apenas colunas adicionadas ao
//        final — nenhuma coluna existente foi deslocada ou teve seu índice alterado)
//
//  v6.2 (controle de acesso às Configurações):
//  [P40] Nova área "🔐 Controle de Acesso" dentro de Configurações: dono da planilha
//        (fixo) + lista de administradores extras (PropertiesService, editável na hora)
//  [P41] abrirConfiguracoes, configurarPlanilha e todas as funções de servidor chamadas
//        pela tela de Configurações (obterEmailConfig, salvarEmailConfig, obterCoresSalvas,
//        salvarCoresEReaplicar, criarNovoFornecedor, obterDiagnostico, executarLimpezaLog,
//        previewLimpezaDrive, executarLimpezaDrive) agora exigem _usuarioEhAdmin()
//  [P42] Itens "⚙️ Configurações do Sistema" e "🔧 Configurar/Reinstalar Sistema"
//        continuam visíveis a todos no menu (Sheets não permite menu por usuário e
//        onOpen roda em modo restrito, sem acesso a getOwner()) — mas só executam para
//        quem tem acesso; quem não tem recebe aviso de "🔒 Acesso restrito" e a
//        tentativa é registrada no _Log
// ============================================================


// ════════════════════════════════════════════════════════════
//   VARIÁVEIS GLOBAIS — todas as declarações var/const no topo
// ════════════════════════════════════════════════════════════

// ── Chaves de PropertiesService ──────────────────────────────
var _PROP_KEY_CONCLUIDOS  = 'cdv_total_concluidos';
var _PROP_KEY_PROTECOES   = 'cdv_total_protecoes';

// ── Chaves de CacheService ───────────────────────────────────
var _CACHE_KEY_DASH       = 'cdv_dash_lock';
var _CACHE_KEY_CORES      = 'cdv_cores_ok';
var _CACHE_KEY_SENTINEL   = 'cdv_sentinel_ok';

// ── Tempos de cache ──────────────────────────────────────────
var _DASH_DEBOUNCE_SEG    = 8;     // segundos mínimos entre atualizações do dashboard
var _CORES_TTL_SEG        = 3600;  // 1 hora de cache para reaplicação de cores

// ── Chaves de configuração (e-mails e cores) ─────────────────
var _KEY_EMAILS_GERAL     = 'cdv_emails_geral';
var _KEY_EMAILS_ALERTA    = 'cdv_emails_alerta';
var _KEY_ALERTA_DEST      = 'cdv_alerta_dest';   // 'todos' | 'cc'
var _KEY_EMAILS_TRANSF    = 'cdv_emails_transf'; // destinatários alertas de transferência vencida
var _KEY_ADMINS_CONFIG    = 'cdv_admins_config'; // e-mails extras autorizados nas Configurações
var _KEY_CARGOS           = 'cdv_cargos';    // JSON: CargoItem[]
var _KEY_USUARIOS         = 'cdv_usuarios';  // JSON: UsuarioItem[]
var _KEY_CORES            = 'cdv_cores';
var _KEY_READONLY         = 'cdv_modo_somente_leitura';
var _KEY_EMAIL_TEMPLATES  = 'cdv_email_templates';   // JSON: { avaria: {assunto, corpo}, vencimento: {...}, ... }
var _KEY_CC_FORN          = 'cdv_cc_fornecedores';   // JSON: { "Ambev": { cc: "...", bcc: "..." }, ... }
var _KEY_CC_ALERTA        = 'cdv_cc_alerta';          // JSON: { "atraso": {cc,bcc}, "semanal": {cc,bcc}, "pendencias": {cc,bcc}, "mensal": {cc,bcc}, "transferencia": {cc,bcc} }
var _KEY_PERMISSOES       = 'cdv_permissoes_modulos'; // JSON: { "notas": ["email1","email2"], "lancamento": [...] }
var _KEY_PERMISSOES_RO    = 'cdv_permissoes_ro_modulos'; // JSON: { "notas": true, "transferencias": true }
var _KEY_ASSINATURAS      = 'cdv_assinaturas';        // JSON: { "email@": "driveFileId", ... }
var _KEY_EMAILS_AGENDADOS = 'cdv_emails_agendados';   // JSON: [{ id, params, dataEnvio, usuario }]
var _KEY_CONFIG_HISTORICO = 'cdv_config_historico';   // JSON: [{ ts, usuario, snapshot }] (últimos 5)
var _KEY_WEBHOOK_CONF     = 'cdv_webhook_conf';        // JSON: { ativo, tipo, telegram:{token,chatIds[]}, whatsapp:{url,ctoken,phones[]} }

// ── Dashboard: sentinela e células de filtro ─────────────────
var DASH_SENTINEL_CELL    = 'K1';
var DASH_SENTINEL_VALUE   = 'v7.0';
var DASH_DATA_INI_CELL    = 'C4';
var DASH_DATA_FIM_CELL    = 'C5';

// ── Dashboard: grupos de colunas (qtd + valor) ───────────────
var DASH_COLS = [
  { c: 2, label: 'BRITANIA',       cor: '#2563EB' },
  { c: 4, label: 'UNILEVER',       cor: '#059669' },
  { c: 6, label: 'FORN. VARIADOS', cor: '#D97706' },
  { c: 8, label: 'TOTAL GERAL',    cor: '#7C3AED' }
];

// ── Dashboard: paleta de cores ───────────────────────────────
var DC = {
  HEADER  : '#1A3557', SUB    : '#243F63',
  BRANCO  : '#FFFFFF', CINZA  : '#F0F2F5', BORDA : '#E5E7EB',
  PEND_BG : '#EBF3FF', PEND   : '#2563EB',
  TR_BG   : '#CFFAFE', TR     : '#0891B2', // Em Transferência — cyan
  DEV_BG  : '#ECFDF5', DEV    : '#059669',
  VENDA_BG: '#FFF7ED', VENDA  : '#D97706',
  TOT_BG  : '#F5F3FF', TOT    : '#7C3AED',
  TEXTO   : '#111827', TEXTO_L: '#6B7280'
};

// ── Backup ───────────────────────────────────────────────────
var BACKUP_ABA       = '_Backup_Snapshot';
var BACKUP_TOTAL_COL = 22; // 1(aba) + 20(dados) + 1(timestamp)


// ════════════════════════════════════════════════════════════
//   CONFIGURAÇÕES (constantes)
// ════════════════════════════════════════════════════════════

const EMAILS_DESTINATARIOS   = ['datandarosabarbosa@gmail.com'];
const ID_MODELO_DOC          = '1i8pIoeL-UtRgUyfZogjxH1F55Dia3B6MbInBcTOWbLE';
const ID_LOGO_TRANSBEN       = '1xzzAzf7cej96m5rxR2Y9vVL1ou4y-hap';
const ID_PASTA_DESTINO       = '1Los345XSVx_1R5WgvvqW_IAIryK876jJ';
const ID_PASTA_DESTINO_VENDA = '1sNSbDEoWnQlUQcqQhqy62MRWQDo9y8uX';
const ID_PASTA_ANEXOS        = '1zCGh-DE-m1piQoEfzcO6KG9TNICokWwR';

// ── Cores ────────────────────────────────────────────────────
const COR_AZUL          = '#DDEEFF';
const COR_VERDE         = '#DDFFDD';
const COR_LARANJA       = '#FFE5CC';
const COR_ALERTA_30DIAS = '#FFD5D5';
const COR_HEADER        = '#1A3557';
const COR_VERMELHO      = '#FFD5D5';
const COR_TRANSF        = '#CFFAFE'; // Em Transferência — cyan-100

// ── Colunas (1-based) ────────────────────────────────────────
const COL_NFD         = 1;
const COL_NF          = 2;
const COL_DATA        = 3;
const COL_FORN        = 4;
const COL_TIPO        = 5;
const COL_MOTIVO      = 6;
const COL_DESC        = 7;
const COL_QTD         = 8;
const COL_VL_UNIT     = 9;
const COL_VL_TOT      = 10;
const COL_STATUS      = 11;
const COL_PEND_CHK    = 12;
const COL_DEV_CHK     = 13;
const COL_VENDA_CHK   = 14;
const COL_OBS         = 15;
const COL_RESP        = 16;
const COL_ANEXO       = 17;
// v6.1 — colunas adicionadas ao final (não deslocam nenhuma coluna existente)
const COL_DIAS_ARMAZ  = 18;  // dias em estoque desde a Data de Entrada (fórmula automática)
const COL_FRETE_TIPO  = 19;  // Tabela | Valor + ICMS | Valor | Cortesia
const COL_FRETE_VALOR = 20;  // valor do frete (R$), quando aplicável
const TOTAL_COLUNAS   = 20;
const LINHA_DADOS     = 4;
const MAX_LINHAS_ABA  = 200;
const LIMITE_PROTECOES = 380;
const ULTIMA_LINHA_DADOS = LINHA_DADOS + MAX_LINHAS_ABA - 1; // última linha de dados possível (203)

// ── Índices de array (0-based) ───────────────────────────────
const IDX_NFD       = COL_NFD       - 1;
const IDX_NF        = COL_NF        - 1;
const IDX_DATA      = COL_DATA      - 1;
const IDX_FORN      = COL_FORN      - 1;
const IDX_TIPO      = COL_TIPO      - 1;
const IDX_MOTIVO    = COL_MOTIVO    - 1;
const IDX_DESC      = COL_DESC      - 1;
const IDX_QTD       = COL_QTD       - 1;
const IDX_VL_UNIT   = COL_VL_UNIT   - 1;
const IDX_VL_TOT    = COL_VL_TOT    - 1;
const IDX_STATUS    = COL_STATUS    - 1;
const IDX_PEND_CHK  = COL_PEND_CHK  - 1;
const IDX_DEV_CHK   = COL_DEV_CHK   - 1;
const IDX_VENDA_CHK = COL_VENDA_CHK - 1;
const IDX_OBS       = COL_OBS       - 1;
const IDX_RESP      = COL_RESP      - 1;
const IDX_ANEXO     = COL_ANEXO     - 1;
const IDX_DIAS_ARMAZ  = COL_DIAS_ARMAZ  - 1;
const IDX_FRETE_TIPO  = COL_FRETE_TIPO  - 1;
const IDX_FRETE_VALOR = COL_FRETE_VALOR - 1;

// ── Abas operacionais ────────────────────────────────────────
const ABAS_OPERACIONAIS = ['Britania', 'Unilever', 'Fornecedores Variados'];

/** Retorna abas extras criadas via criarNovoFornecedor (salvas em PropertiesService). */
function _getAbasExtras() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('cdv_abas_extras') || '[]';
    return JSON.parse(raw);
  } catch(_) { return []; }
}

/** Retorna todas as abas operacionais: as padrão + as extras criadas pelo usuário. */
function _getTodasAbas() {
  var extras = _getAbasExtras();
  return ABAS_OPERACIONAIS.concat(extras.filter(function(e) {
    return ABAS_OPERACIONAIS.indexOf(e) === -1;
  }));
}

/** Retorna JSON com a lista de abas extras (para uso nos formulários). */
function obterAbasExtras() {
  return JSON.stringify({ extras: _getAbasExtras() });
}

// ── Frete (programação de devolução) ─────────────────────────
const TIPOS_FRETE = ['Tabela', 'Valor + ICMS', 'Valor', 'Cortesia'];

// ════════════════════════════════════════════════════════════
//   v7.0 — WEB APP (mesma planilha, acesso por link/URL)
// ════════════════════════════════════════════════════════════
// [P43] ID fixo da planilha — necessário porque, quando o projeto é acessado
//       como Web App (doGet, fora do Google Sheets), SpreadsheetApp.getActiveSpreadsheet()
//       retorna null (não existe "planilha ativa" nesse contexto). Substitua o valor
//       abaixo pelo ID real da sua planilha (está na URL, entre /d/ e /edit):
//       https://docs.google.com/spreadsheets/d/ESTE_TRECHO_AQUI/edit
const SPREADSHEET_ID = 'COLOQUE_AQUI_O_ID_DA_SUA_PLANILHA';

/**
 * [P44] Substituto universal de SpreadsheetApp.getActiveSpreadsheet().
 * Dentro do Google Sheets (menus/diálogos) continua retornando a planilha ativa,
 * normalmente. Quando chamado a partir do Web App (sem UI do Sheets em volta),
 * cai para SpreadsheetApp.openById(SPREADSHEET_ID) — mesma planilha, mesmos dados.
 * Todas as funções do sistema foram migradas de getActiveSpreadsheet() para getSS()
 * para funcionar identicamente nos dois contextos.
 */
function getSS() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (_) {}
  // Permite sobrescrever o ID via PropertiesService ('SPREADSHEET_ID'), sem alterar o código
  var id = '';
  try { id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''; } catch(_) {}
  return SpreadsheetApp.openById(id || SPREADSHEET_ID);
}


// ════════════════════════════════════════════════════════════
//   HELPERS DE CACHE/PROPERTIES
// ════════════════════════════════════════════════════════════

/** Lê o contador de itens concluídos do PropertiesService. */
function _lerContadorConcluidos() {
  return parseInt(PropertiesService.getScriptProperties()
    .getProperty(_PROP_KEY_CONCLUIDOS) || '0');
}

/** Incrementa o contador e retorna o novo valor. */
function _incrementarContadorConcluidos() {
  var props = PropertiesService.getScriptProperties();
  var n = parseInt(props.getProperty(_PROP_KEY_CONCLUIDOS) || '0') + 1;
  props.setProperty(_PROP_KEY_CONCLUIDOS, String(n));
  return n;
}

/** Decrementa o contador (usado ao arquivar). */
function _decrementarContadorConcluidos(qtd) {
  var props = PropertiesService.getScriptProperties();
  var n = Math.max(0, parseInt(props.getProperty(_PROP_KEY_CONCLUIDOS) || '0') - (qtd || 1));
  props.setProperty(_PROP_KEY_CONCLUIDOS, String(n));
}

/** Zera o contador de concluídos (após arquivamento). */
function _zerarContadorConcluidos() {
  PropertiesService.getScriptProperties().setProperty(_PROP_KEY_CONCLUIDOS, '0');
}

/** Lê o total de proteções ativas (cache em Properties). */
function _lerTotalProtecoes() {
  return parseInt(PropertiesService.getScriptProperties()
    .getProperty(_PROP_KEY_PROTECOES) || '0');
}

/** Incrementa o contador de proteções. */
function _incrementarProtecoes() {
  var props = PropertiesService.getScriptProperties();
  var n = parseInt(props.getProperty(_PROP_KEY_PROTECOES) || '0') + 1;
  props.setProperty(_PROP_KEY_PROTECOES, String(n));
}

/** Decrementa o contador de proteções. */
function _decrementarProtecoes(qtd) {
  var props = PropertiesService.getScriptProperties();
  var n = Math.max(0, parseInt(props.getProperty(_PROP_KEY_PROTECOES) || '0') - (qtd || 1));
  props.setProperty(_PROP_KEY_PROTECOES, String(n));
}

/** Reseta apenas os contadores de cache (usado em configurarPlanilha). */
function _resetarContadores() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(_PROP_KEY_CONCLUIDOS);
  props.deleteProperty(_PROP_KEY_PROTECOES);
  try { CacheService.getScriptCache().removeAll([_CACHE_KEY_DASH, _CACHE_KEY_CORES, _CACHE_KEY_SENTINEL]); } catch(_) {}
}


// ════════════════════════════════════════════════════════════
//   HELPERS GENÉRICOS
// ════════════════════════════════════════════════════════════

/**
 * Verifica se qualquer termo da lista bate com a NFD ou a NF da linha.
 * Retorna { bate: bool, termoBateu: string|null }
 */
function _baterTermos(termos, nfd, nf) {
  var nfdStr = String(nfd || '').trim();
  var nfStr  = String(nf  || '').trim();
  for (var i = 0; i < termos.length; i++) {
    var t = termos[i];
    if ((nfdStr && nfdStr === t) || (nfStr && nfStr === t)) {
      return { bate: true, termoBateu: t };
    }
  }
  return { bate: false, termoBateu: null };
}

/** Última linha com NF preenchida (âncora: COL_NF). */
function obterUltimaLinhaDados(ws) {
  var lastRow;
  try { lastRow = ws.getLastRow(); } catch (_) { return LINHA_DADOS - 1; }
  if (lastRow < LINHA_DADOS) return LINHA_DADOS - 1;
  var vals = ws.getRange(LINHA_DADOS, COL_NF, lastRow - LINHA_DADOS + 1, 1).getValues();
  var ultima = LINHA_DADOS - 1;
  vals.forEach(function(r, i) {
    if (r[0] !== '' && r[0] != null) ultima = LINHA_DADOS + i;
  });
  return ultima;
}

/** Cor de fundo por status. */
function corPorStatus(status) {
  switch (status) {
    case 'Pendente':        return COR_AZUL;
    case 'Devolvido':       return COR_VERDE;
    case 'Venda':           return COR_LARANJA;
    case 'Em Transferência': return COR_TRANSF;
    default:                return '#FFFFFF';
  }
}

/** Escapa caracteres HTML para uso seguro em templates de e-mail. */
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extrai ID de arquivo a partir de URL do Drive. */
function _extrairIdDriveUrl(url) {
  if (!url) return null;
  var m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
          url.match(/[?&]id=([a-zA-Z0-9_-]+)/)     ||
          url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Tenta apagar arquivo do Drive pela URL; falha silenciosamente. */
function _apagarAnexoDrive(url) {
  if (!url || !url.startsWith('http')) return;
  try {
    var id = _extrairIdDriveUrl(url);
    if (id) DriveApp.getFileById(id).setTrashed(true);
  } catch (_) {}
}

/** Pasta de anexos: usa ID_PASTA_ANEXOS se configurado, senão ID_PASTA_DESTINO. */
function _pastaAnexos() {
  return (ID_PASTA_ANEXOS && !ID_PASTA_ANEXOS.startsWith('INSIRA'))
    ? DriveApp.getFolderById(ID_PASTA_ANEXOS)
    : DriveApp.getFolderById(ID_PASTA_DESTINO);
}

/**
 * Garante subpasta Drive: AnexosNFs/{aba}/{NF_nf}
 * Retorna a pasta; silencioso em caso de erro.
 */
function _garantirPastaNF(aba, nf) {
  try {
    var raiz = _pastaAnexos();
    // Subpasta por aba/fornecedor
    var abaIter = raiz.getFoldersByName(aba);
    var pastaAba = abaIter.hasNext() ? abaIter.next() : raiz.createFolder(aba);
    // Subpasta por NF
    var nfNome = 'NF_' + String(nf).replace(/[\/\\:*?"<>|]/g, '_');
    var nfIter = pastaAba.getFoldersByName(nfNome);
    return nfIter.hasNext() ? nfIter.next() : pastaAba.createFolder(nfNome);
  } catch(e) { return null; }
}

/**
 * Apaga (move para lixeira do Drive) a pasta e arquivos de uma NF.
 * Tenta pelos nomes NF_nfd e NF_nf. Silencioso em caso de erro.
 */
function _apagarPastaNFDrive(aba, nf, nfd) {
  try {
    var raiz = _pastaAnexos();
    var abaIter = raiz.getFoldersByName(aba);
    if (!abaIter.hasNext()) return;
    var pastaAba = abaIter.next();
    var nomes = [];
    if (nfd) nomes.push('NF_' + String(nfd).replace(/[\/\\:*?"<>|]/g, '_'));
    if (nf)  nomes.push('NF_' + String(nf).replace(/[\/\\:*?"<>|]/g, '_'));
    nomes.forEach(function(nome) {
      var iter = pastaAba.getFoldersByName(nome);
      if (iter.hasNext()) iter.next().setTrashed(true);
    });
  } catch(e) { console.warn('_apagarPastaNFDrive: ' + e); }
}

/** Fórmula de valor total para a linha `row` da planilha. */
function _formulaTotal(row) {
  return '=IF(OR(H' + row + '="";I' + row + '="");"";H' + row + '*I' + row + ')';
}

/** Fórmula de "dias armazenado" (hoje − Data de Entrada) para a linha `row`. */
function _formulaDiasArmazenado(row) {
  return '=IF(C' + row + '="";"";TODAY()-C' + row + ')';
}

/** Fórmulas do resumo da linha 2 (somatórios de itens Pendentes). */
function _formulasResumoPendentes() {
  var li = LINHA_DADOS, lf = ULTIMA_LINHA_DADOS;
  return {
    produtos: '="📦 Produtos Pendentes:  " & TEXT(SUMIFS($H$' + li + ':$H$' + lf + ';$K$' + li + ':$K$' + lf + ';"Pendente");"#.##0") & " un."',
    nfs:      '="🧾 NFs Pendentes:  " & COUNTIFS($K$' + li + ':$K$' + lf + ';"Pendente")',
    valor:    '="💰 Valor Pendente:  R$ " & TEXT(SUMIFS($J$' + li + ':$J$' + lf + ';$K$' + li + ':$K$' + lf + ';"Pendente");"#.##0,00")'
  };
}

/** Formata número como valor monetário sem símbolo R$. */
function _fmtVal(n) {
  return (parseFloat(n) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Converte 'YYYY-MM-DD' em Date (início do dia). */
function _parseDateStr(s, fimDia) {
  if (!s) return null;
  var p = s.split('-');
  if (p.length < 3) return null;
  var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  if (isNaN(d.getTime())) return null;
  if (fimDia) d.setHours(23, 59, 59, 999);
  return d;
}

/** Formata Date como dd/MM/yyyy usando timezone da planilha. */
function _fmtDt(dt, tz) {
  return Utilities.formatDate(dt, tz, 'dd/MM/yyyy');
}

/** Nome legível da coluna para o log. */
function obterNomeColuna(col) {
  var mapa = {
    1:'NFD', 2:'NF', 3:'Data', 4:'Fornecedor', 5:'Tipo', 6:'Motivo', 7:'Descrição', 8:'Qtd',
    9:'Vl Unit', 10:'Vl Total', 11:'Status',
    12:'Pendente✓', 13:'Devolvido✓', 14:'Venda✓', 15:'Obs', 16:'Responsável', 17:'Anexo',
    18:'Dias Armazenado', 19:'Tipo Frete', 20:'Valor Frete'
  };
  return mapa[col] || ('Col' + col);
}

/** Retorna array de fornecedores únicos dos itens. */
function _fornecedoresUnicos(itens) {
  return itens.reduce(function(a, it) {
    if (a.indexOf(it.forn) === -1) a.push(it.forn);
    return a;
  }, []);
}

/** Monta assunto/título do e-mail com base nos tipos dos itens. */
function _montarTituloEmail(itens, forn) {
  var tipos = itens.reduce(function(a, it) {
    if (it.tipo && a.indexOf(it.tipo) === -1) a.push(it.tipo);
    return a;
  }, []);
  var temFalta    = tipos.indexOf('Falta')    !== -1;
  var temAvaria   = tipos.indexOf('Avaria')   !== -1;
  var temRejeicao = tipos.indexOf('Rejeição') !== -1;
  var tipoStr;
  if (temRejeicao && !temFalta && !temAvaria) {
    tipoStr = 'NF REJEITADA';
  } else if (temRejeicao && (temFalta || temAvaria)) {
    tipoStr = 'NFD DE DEVOLUÇÃO E REJEIÇÃO';
  } else if (temFalta && temAvaria) {
    tipoStr = 'NFD DE AVARIA E FALTA';
  } else if (tipos.length === 1) {
    tipoStr = 'NFD DE ' + tipos[0].toUpperCase();
  } else {
    tipoStr = 'NFD';
  }
  return tipoStr + ' (' + forn.toUpperCase() + ')';
}

/** Monta lista de destinatários: base + extras do formulário. */
function _montarDestinatarios(emailsExtras) {
  // Lê do PropertiesService (configurado via tela de configurações)
  // Se não houver nada salvo, cai na constante do código
  var dest = _getEmailsGeral().slice();
  
  if (emailsExtras) {
    emailsExtras.split(/[;,\n]/).forEach(function(e) {
      var em = e.trim();
      if (em && dest.indexOf(em) === -1) dest.push(em);
    });
  }
  return dest;
}

/** Retorna quais pastas serão varridas de acordo com o tipo selecionado.
 *  IMPORTANTE: ID_PASTA_ANEXOS (fotos/PDFs das NFs originais) NUNCA é incluída. */
function _pastasParaLimpar(tipo) {
  var pastas = [];
  if (tipo === 'relatorios' || tipo === 'tudo' || tipo === 'devolucoes')
    pastas.push({ id: ID_PASTA_DESTINO, label: 'Relatórios / PDFs de Devolução' });
  if (tipo === 'vendas' || tipo === 'tudo')
    pastas.push({ id: ID_PASTA_DESTINO_VENDA, label: 'PDFs de Venda' });
  var vistos = {};
  return pastas.filter(function(p) {
    if (!p.id || p.id.startsWith('INSIRA') || vistos[p.id]) return false;
    vistos[p.id] = true;
    return true;
  });
}

/** Acumula totais por status em 1 loop. */
function _acumular(linhas) {
  var acc = { tP:0, tD:0, tV:0, vP:0, vD:0, vV:0, vTotal:0 };
  linhas.forEach(function(l) {
    acc.vTotal += l.val;
    if      (l.st === 'Pendente')  { acc.tP++; acc.vP += l.val; }
    else if (l.st === 'Devolvido') { acc.tD++; acc.vD += l.val; }
    else if (l.st === 'Venda')     { acc.tV++; acc.vV += l.val; }
  });
  acc.taxa = linhas.length > 0
    ? Math.round((acc.tD + acc.tV) / linhas.length * 100)
    : 0;
  return acc;
}

/** Monta array de KPIs para o corpo do e-mail. */
function _kpisEmail(acc) {
  return [
    { label: 'Pendentes',  cor: '#2563EB', valor: acc.tP + ' itens', sub: 'R$ ' + _fmtVal(acc.vP) },
    { label: 'Devolvidos', cor: '#059669', valor: acc.tD + ' itens', sub: 'R$ ' + _fmtVal(acc.vD) },
    { label: 'Vendas',     cor: '#D97706', valor: acc.tV + ' itens', sub: 'R$ ' + _fmtVal(acc.vV) },
    { label: 'Taxa',
      cor:   acc.taxa >= 70 ? '#059669' : acc.taxa >= 40 ? '#D97706' : '#DC2626',
      valor: acc.taxa + '%', sub: 'de resolução' }
  ];
}

function verificarEmailsJaEnviados(nfdsRaw) {
  var nfds = nfdsRaw.split(/[\n,]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (!nfds.length) return JSON.stringify({ jaEnviadas: [] });

  var ss = getSS();
  var ws = ss.getSheetByName('_EmailsEnviados');
  if (!ws) return JSON.stringify({ jaEnviadas: [] });

  try {
    var ul = ws.getLastRow();
    if (ul < 2) return JSON.stringify({ jaEnviadas: [] });

    var dados = ws.getRange(2, 1, ul - 1, 8).getValues();
    var contagem = {};

    dados.forEach(function(l) {
      if (!l[0]) return;
      var nfdsColuna = String(l[4] || '');
      nfds.forEach(function(nfd) {
        if (nfdsColuna.indexOf(nfd) !== -1) {
          if (!contagem[nfd]) contagem[nfd] = { total: 0, data: '' };
          contagem[nfd].total++;
          contagem[nfd].data = String(l[0]);
        }
      });
    });

    var jaEnviadas = Object.keys(contagem).map(function(nfd) {
      return { nfd: nfd, total: contagem[nfd].total, data: contagem[nfd].data };
    });

    return JSON.stringify({ jaEnviadas: jaEnviadas });
  } catch(e) {
    return JSON.stringify({ jaEnviadas: [] });
  }
}

// ════════════════════════════════════════════════════════════
//   LOG
// ════════════════════════════════════════════════════════════

function garantirAbaLog(ss) {
  var ws = ss.getSheetByName('_Log');
  if (!ws) {
    ws = ss.insertSheet('_Log');
    ws.hideSheet();
  }
  var cabecalho = '';
  try { cabecalho = ws.getRange('A1').getValue(); } catch (_) {}
  if (cabecalho !== 'Data/Hora') {
    ws.getRange(1, 1, 1, 8)
      .setValues([['Data/Hora','Usuário','Aba','Linha','Coluna','Valor Anterior','Novo Valor','Ação']])
      .setBackground('#444444').setFontColor('#FFFFFF').setFontWeight('bold');
    ws.setFrozenRows(1);
    [160, 220, 160, 60, 100, 200, 200, 150].forEach(function(w, i) {
      ws.setColumnWidth(i + 1, w);
    });
  }
  return ws;
}

function garantirAbaAcesso(ss) {
  var ws = ss.getSheetByName('_AcessoLog');
  if (!ws) {
    ws = ss.insertSheet('_AcessoLog');
    ws.hideSheet();
    ws.getRange(1, 1, 1, 4)
      .setValues([['Data/Hora','Usuário','Página','Agente']])
      .setBackground('#25419A').setFontColor('#FFFFFF').setFontWeight('bold');
    ws.setFrozenRows(1);
    [160, 230, 140, 200].forEach(function(w, i){ ws.setColumnWidth(i + 1, w); });
  }
  return ws;
}

function registrarAcesso(pagina) {
  try {
    var ss = getSS();
    var ws = ss.getSheetByName('_AcessoLog') || garantirAbaAcesso(ss);
    var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var user  = Session.getActiveUser().getEmail() || 'sistema';
    var next  = ws.getLastRow() + 1;
    ws.getRange(next, 1, 1, 4).setValues([[agora, user, pagina || '', '']]);
  } catch(e) { console.error('registrarAcesso: ' + e); }
}

function obterLogAcesso(limite) {
  try {
    var ss = getSS();
    var ws = ss.getSheetByName('_AcessoLog');
    if (!ws || ws.getLastRow() < 2) return JSON.stringify({ linhas: [] });
    var n   = Math.min(parseInt(limite, 10) || 200, 500);
    var ul  = ws.getLastRow();
    var ini = Math.max(2, ul - n + 1);
    var vals = ws.getRange(ini, 1, ul - ini + 1, 4).getValues();
    var linhas = vals.reverse().map(function(r) {
      return { dt: String(r[0]||''), user: String(r[1]||''), pagina: String(r[2]||''), agente: String(r[3]||'') };
    });
    return JSON.stringify({ linhas: linhas });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function registrarLog(ss, nomeAba, row, col, valorAnterior, novoValor, acao) {
  try {
    var ws    = ss.getSheetByName('_Log') || garantirAbaLog(ss);
    var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    // [P11] getLastRow+setValues é ~30% mais rápido que appendRow
    var nextRow = ws.getLastRow() + 1;
    ws.getRange(nextRow, 1, 1, 8).setValues([[
      agora,
      Session.getActiveUser().getEmail() || 'sistema',
      nomeAba, row, obterNomeColuna(col),
      valorAnterior, novoValor, acao
    ]]);
  } catch (e) {
    console.error('Log: ' + e);
  }
}

/**
 * Helper que lê NF/NFD de uma linha e chama registrarLog com campos padronizados.
 * [P09] Lê NFD (col1) e NF (col2) em batch: 1 getRange 1×2 → 2 valores de uma vez.
 */
function _registrarLogAba(ss, ws, nomeAba, row, col, statusAnterior, novoStatus, prefixoAcao) {
  var nfLog = '', nfdLog = '';
  try {
    var vals = ws.getRange(row, COL_NFD, 1, 2).getValues()[0];
    nfdLog = String(vals[0] || '').trim();
    nfLog  = String(vals[1] || '').trim();
  } catch (_) {}
  var ref = nfLog || nfdLog || statusAnterior;
  registrarLog(ss, nomeAba, row, col, ref, novoStatus,
    prefixoAcao + (nfLog ? ' — NF: ' + nfLog : ''));
}


// ════════════════════════════════════════════════════════════
//   CONFIGURAÇÃO INICIAL
// ════════════════════════════════════════════════════════════

function configurarPlanilha() {
  if (!_usuarioEhAdmin()) { return _negarAcessoConfig('Configurar/Reinstalar Sistema'); }
  const ss = getSS();

  try {
    var requests = ss.getSheets().map(function(s) {
      return { clearBasicFilter: { sheetId: s.getSheetId() } };
    });
    if (requests.length) {
      Sheets.Spreadsheets.batchUpdate({ requests: requests }, ss.getId());
    }
  } catch (_) {
    ss.getSheets().forEach(function(s) {
      try { var ff = s.getFilter(); if (ff) ff.remove(); } catch (_2) {}
    });
  }
  SpreadsheetApp.flush();

  ss.getSheets().forEach(function(s) {
    try { s.setConditionalFormatRules([]); } catch (_) {}
  });

  garantirAba(ss, 'Britania',              'Britania');
  garantirAba(ss, 'Unilever',              'Unilever');
  garantirAba(ss, 'Fornecedores Variados', 'Fornecedores Variados');
  garantirAbaLog(ss);

  ABAS_OPERACIONAIS.forEach(function(nome) {
    reaplicarCoresAba(ss.getSheetByName(nome));
  });

  _criarLayoutDashboard(ss);
  _atualizarMetricasDashboard(ss);

  // [P10] Reseta todos os contadores de cache ao reconfigurar
  _resetarContadores();

  instalarTriggers();
  var _msgOk = '✅ Sistema v6.2 configurado!\n\n' +
    '• Otimizações de performance aplicadas\n' +
    '• onEdit mais rápido (batch writes + contadores)\n' +
    '• Dashboard com debounce (evita releituras desnecessárias)\n' +
    '• onOpen com cache de cores (reabertura mais rápida)\n' +
    '• Painel de Auditoria unificado (NF + E-mails + Log)\n' +
    '• Linha 2 com resumo de Pendentes (Produtos, NFs, Valor)\n' +
    '• Coluna "Dias Armazenado" por NF\n' +
    '• Novo: 🚚 Programar Frete da Devolução\n' +
    '• Novo: 🔐 Configurações restritas ao dono + administradores cadastrados';
  try { SpreadsheetApp.getUi().alert(_msgOk); } catch (_) {}
  return JSON.stringify({ sucesso: _msgOk });
}

/**
 * Manutenção Rápida: reaplica cores, atualiza dashboard e reinstala triggers
 * sem recriar ou apagar nenhuma aba. Ideal para corrigir pequenos problemas
 * sem risco de perder dados.
 */
function manutencaoSistema() {
  if (!_usuarioEhAdmin()) { return _negarAcessoConfig('Manutenção do Sistema'); }
  const ss = getSS();

  // Reaplica cores em todas as abas (incluindo extras)
  _getTodasAbas().forEach(function(nome) {
    reaplicarCoresAba(ss.getSheetByName(nome));
  });

  // Força atualização do dashboard (remove cache de debounce antes)
  try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
  _atualizarMetricasDashboard(ss);

  // Reinstala triggers
  instalarTriggers();

  var msg = '✅ Manutenção rápida concluída!\n\n' +
    '• Cores reaplicadas em todas as abas\n' +
    '• Dashboard atualizado\n' +
    '• Triggers verificados e reinstalados\n' +
    '• Nenhuma aba foi recriada ou limpa';
  try { SpreadsheetApp.getUi().alert(msg); } catch (_) {}
  return JSON.stringify({ sucesso: msg });
}

function instalarTriggers() {
  var handlers = [
    'onEditInstalado',
    'enviarResumoSemanal',
    'verificarAtrasosEEnviarAlerta',
    'verificarTransferenciasVencidas',
    'reaplicarCoresTodas'
  ];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('onEditInstalado')
    .forSpreadsheet(getSS())
    .onEdit().create();

  ScriptApp.newTrigger('enviarResumoSemanal')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();

  ScriptApp.newTrigger('verificarAtrasosEEnviarAlerta')
    .timeBased().everyDays(1).atHour(9).create();

  // Alerta diário de transferências com agendamento vencido
  ScriptApp.newTrigger('verificarTransferenciasVencidas')
    .timeBased().everyDays(1).atHour(8).create();

  ScriptApp.newTrigger('reaplicarCoresTodas')
    .timeBased().everyDays(1).atHour(2).create();
}


// ════════════════════════════════════════════════════════════
//   FORMATAÇÃO DE ABAS
// ════════════════════════════════════════════════════════════

function garantirAba(ss, nomeAba, nomeFornecedor) {
  var ws = ss.getSheetByName(nomeAba);
  if (ws) {
    try {
      if (ss.getSheets().filter(function(s) { return !s.isSheetHidden(); }).length === 1) {
        ss.insertSheet('_tmp_del_');
      }
      ss.deleteSheet(ws);
    } catch (_) {}
  }

  ws = ss.insertSheet(nomeAba);
  formatarAba(ws, nomeFornecedor, nomeAba !== 'Fornecedores Variados');

  var tmp = ss.getSheetByName('_tmp_del_');
  if (tmp) try { ss.deleteSheet(tmp); } catch (_) {}

  return ws;
}

function formatarAba(ws, nomeFornecedor, fixarFornecedor) {
  try {
    Sheets.Spreadsheets.batchUpdate(
      { requests: [{ clearBasicFilter: { sheetId: ws.getSheetId() } }] },
      ws.getParent().getId()
    );
  } catch (_) {
    try { var f = ws.getFilter(); if (f) f.remove(); } catch (_2) {}
  }

  try { ws.setConditionalFormatRules([]); } catch (_) {}
  ws.clear();
  ws.setFrozenRows(0);
  ws.setFrozenColumns(0);

  ws.setRowHeight(1, 40);
  ws.getRange(1, 1, 1, TOTAL_COLUNAS).setBackground(COR_HEADER);
  ws.getRange(1, 2, 1, TOTAL_COLUNAS - 1).merge()
    .setValue('CONTROLE DE DEVOLUÇÕES – ' + nomeFornecedor.toUpperCase())
    .setBackground(COR_HEADER).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  ws.setFrozenRows(3);
  ws.setFrozenColumns(1);

  // ── Linha 2: resumo ao vivo dos itens Pendentes (produtos, NFs, valor) ──
  ws.setRowHeight(2, 24);
  ws.getRange(2, 1, 1, TOTAL_COLUNAS).setBackground('#E8F0F8');
  var resumo = _formulasResumoPendentes();
  var blocosResumo = [
    { c1: 2,  c2: 4,  formula: resumo.produtos },
    { c1: 5,  c2: 6,  formula: resumo.nfs },
    { c1: 7,  c2: 11, formula: resumo.valor }
  ];
  blocosResumo.forEach(function(b) {
    ws.getRange(2, b.c1, 1, b.c2 - b.c1 + 1).merge()
      .setFormula(b.formula)
      .setFontWeight('bold').setFontSize(10.5).setFontColor(COR_HEADER)
      .setHorizontalAlignment('left').setVerticalAlignment('middle');
  });

  ws.setRowHeight(3, 32);
  var headers  = ['NFD','Nº NF','Data Entrada','Fornecedor','Tipo','Motivo','Descrição do Produto',
                  'Qtd','Valor Unit (R$)','Valor Total (R$)','Status',
                  'Pendente ✓','Devolvido ✓','Venda ✓','Obs / Hora','Responsável','📎 Anexo NF',
                  'Dias Armazenado','Tipo de Frete','Valor Frete (R$)'];
  var larguras = [100,100,120,180,90,200,320,60,120,130,120,95,100,85,280,200,160,110,140,120];
  headers.forEach(function(h, i) {
    ws.setColumnWidth(i + 1, larguras[i]);
    ws.getRange(3, i + 1).setValue(h)
      .setBackground(COR_HEADER).setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  });

  var fmt = 'R$ #,##0.00;;"";""';
  var formulasTotal = [], fmtUnit = [], fmtTot = [], fmtData = [], valForn = [], valStatus = [];
  var formulasDias = [], fmtDias = [], fmtFreteValor = [];
  var ultimaLinha = LINHA_DADOS + MAX_LINHAS_ABA - 1;

  for (var row = LINHA_DADOS; row <= ultimaLinha; row++) {
    formulasTotal.push([_formulaTotal(row)]);
    fmtUnit.push([fmt]);
    fmtTot.push([fmt]);
    fmtData.push(['dd/mm/yyyy']);
    valForn.push([fixarFornecedor ? nomeFornecedor : '']);
    valStatus.push(['']);
    formulasDias.push([_formulaDiasArmazenado(row)]);
    fmtDias.push(['0" dias"']);
    fmtFreteValor.push([fmt]);
  }

  ws.setRowHeights(LINHA_DADOS, MAX_LINHAS_ABA, 22);
  ws.getRange(LINHA_DADOS, COL_VL_TOT,  MAX_LINHAS_ABA, 1).setFormulas(formulasTotal);
  ws.getRange(LINHA_DADOS, COL_VL_UNIT, MAX_LINHAS_ABA, 1).setNumberFormats(fmtUnit);
  ws.getRange(LINHA_DADOS, COL_VL_TOT,  MAX_LINHAS_ABA, 1).setNumberFormats(fmtTot);
  ws.getRange(LINHA_DADOS, COL_DATA,    MAX_LINHAS_ABA, 1).setNumberFormats(fmtData);
  ws.getRange(LINHA_DADOS, COL_STATUS,  MAX_LINHAS_ABA, 1).setValues(valStatus);
  ws.getRange(LINHA_DADOS, COL_DIAS_ARMAZ,  MAX_LINHAS_ABA, 1).setFormulas(formulasDias);
  ws.getRange(LINHA_DADOS, COL_DIAS_ARMAZ,  MAX_LINHAS_ABA, 1).setNumberFormats(fmtDias);
  ws.getRange(LINHA_DADOS, COL_FRETE_VALOR, MAX_LINHAS_ABA, 1).setNumberFormats(fmtFreteValor);

  ws.getRange(LINHA_DADOS, COL_PEND_CHK,  MAX_LINHAS_ABA, 1).insertCheckboxes();
  ws.getRange(LINHA_DADOS, COL_DEV_CHK,   MAX_LINHAS_ABA, 1).insertCheckboxes();
  ws.getRange(LINHA_DADOS, COL_VENDA_CHK, MAX_LINHAS_ABA, 1).insertCheckboxes();

  if (fixarFornecedor) {
    ws.getRange(LINHA_DADOS, COL_FORN, MAX_LINHAS_ABA, 1)
      .setValues(valForn).setFontColor('#555555').setFontStyle('italic');
  }

  ws.getRange(LINHA_DADOS, 1, MAX_LINHAS_ABA, TOTAL_COLUNAS)
    .setBackground('#FFFFFF').setHorizontalAlignment('center').setVerticalAlignment('middle');
  ws.getRange(LINHA_DADOS, COL_DESC, MAX_LINHAS_ABA, 1).setHorizontalAlignment('left').setWrap(true);
  ws.getRange(LINHA_DADOS, COL_OBS,  MAX_LINHAS_ABA, 1).setHorizontalAlignment('left').setWrap(true);

  ws.getRange(LINHA_DADOS, COL_TIPO, MAX_LINHAS_ABA, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Falta', 'Avaria', 'Rejeição'], true).setAllowInvalid(true).build());

  // Devolvido e Em Transferência são gerenciados pelo sistema — não aparecem no dropdown manual
  ws.getRange(LINHA_DADOS, COL_STATUS, MAX_LINHAS_ABA, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Pendente', 'Venda'], true).setAllowInvalid(true).build());

  ws.getRange(LINHA_DADOS, COL_FRETE_TIPO, MAX_LINHAS_ABA, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(TIPOS_FRETE, true).setAllowInvalid(true).build());
}


// ════════════════════════════════════════════════════════════
//   ON EDIT
// ════════════════════════════════════════════════════════════

function onEditInstalado(e) {
  if (!e) return;
  var ws     = e.range.getSheet();
  var nomAba = ws.getName();
  var col    = e.range.getColumn();
  var row    = e.range.getRow();
  var ss     = getSS();

  if (nomAba === 'Dashboard' && (row === 4 || row === 5) && col === 3) {
    _atualizarMetricasDashboard(ss);
    return;
  }

  if (_getTodasAbas().indexOf(nomAba) === -1 || row < LINHA_DADOS) return;

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(8000)) {
    ss.toast('Sistema ocupado. Tente novamente em instantes.', '⏳ Aguarde', 4);
    return;
  }

  try {
    var novoValor     = e.range.getValue();
    var valorAnterior = e.oldValue != null ? e.oldValue : '';

    if (col === COL_DATA) {
      // [P05] Passa a data nova diretamente
      var stAtualData = ws.getRange(row, COL_STATUS).getValue();
      if (stAtualData === 'Pendente') aplicarCorLinha(ws, row, 'Pendente', novoValor instanceof Date ? novoValor : null);
    }

    // [P12] valoresNF só é lido quando a coluna editada é COL_NF
    if (col === COL_NF && novoValor !== '') {
      var ultimaLinha = obterUltimaLinhaDados(ws);
      var valoresNF   = ultimaLinha >= LINHA_DADOS
        ? ws.getRange(LINHA_DADOS, COL_NF, ultimaLinha - LINHA_DADOS + 1, 1).getValues()
        : [];
      if (_nfDuplicada(valoresNF, row, novoValor)) {
        SpreadsheetApp.getUi().alert('⚠️ NF "' + novoValor + '" já lançada nesta aba. Verifique duplicidade.');
      }
      if (!ws.getRange(row, COL_RESP).getValue()) {
        ws.getRange(row, COL_RESP).setValue(Session.getActiveUser().getEmail() || 'Não identificado');
      }
    }

    if (col === COL_STATUS) {
      _aplicarStatus(ss, ws, nomAba, row, novoValor, valorAnterior);
    }

    // [P13] 3 blocos if separados → 1 bloco com 1 único getValue compartilhado
    if ((col === COL_PEND_CHK || col === COL_DEV_CHK || col === COL_VENDA_CHK) && novoValor === true) {
      var stAtualChk = ws.getRange(row, COL_STATUS).getValue();
      var novoStChk  = col === COL_PEND_CHK ? 'Pendente'
                     : col === COL_DEV_CHK   ? 'Devolvido' : 'Venda';
      _aplicarStatus(ss, ws, nomAba, row, novoStChk, stAtualChk);
    }

    if (_lerContadorConcluidos() >= 40) {
      _zerarContadorConcluidos();
      arquivarItensConcluidos();
    }

  } catch (erro) {
    console.error('onEdit: ' + erro);
  } finally {
    trava.releaseLock();
  }
}

/** Aplica status, checkboxes, cor, obs, proteção, log e atualiza métricas. */
function _aplicarStatus(ss, ws, nomAba, row, novoStatus, statusAnterior, _sistemaFlag) {
  // Bloqueia definição manual de "Devolvido" e "Em Transferência" (exclusivos do sistema)
  if ((novoStatus === 'Devolvido' || novoStatus === 'Em Transferência') && !_sistemaFlag) {
    try {
      SpreadsheetApp.getUi().alert(
        '⚠️ Status "' + novoStatus + '" não pode ser definido manualmente.\n\n' +
        (novoStatus === 'Devolvido'
          ? 'Use "Gerar PDF Devolução" ou confirme a baixa em Transferências.'
          : 'Programar uma devolução via "Programar Devolução" define este status automaticamente.')
      );
    } catch (_) {}
    // Reverte para o status anterior
    ws.getRange(row, COL_STATUS).setValue(statusAnterior || 'Pendente');
    return;
  }

  var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var obsVal = novoStatus === 'Devolvido' ? 'Devolvido em: ' + agora
             : novoStatus === 'Venda'     ? 'Enviado para o Fábio em: ' + agora
             : '';
  // [P14] status + 3 checkboxes + obs em 1 setValues (cols 11-15 são adjacentes)
  ws.getRange(row, COL_STATUS, 1, 5).setValues([[
    novoStatus,
    novoStatus === 'Pendente',
    novoStatus === 'Devolvido',
    novoStatus === 'Venda',
    obsVal
  ]]);

  aplicarCorLinha(ws, row, novoStatus);

  if (novoStatus === 'Devolvido' || novoStatus === 'Venda') {
    protegerLinhaConcluida(ss, ws, row, novoStatus);
    if (statusAnterior !== 'Devolvido' && statusAnterior !== 'Venda') {
      _incrementarContadorConcluidos();
    }
  }
  _atualizarMetricasDashboard(ss);
  _registrarLogAba(ss, ws, nomAba, row, COL_STATUS, statusAnterior, novoStatus, 'Status alterado');
}

function _nfDuplicada(valoresNF, rowAtual, valorNF) {
  return valoresNF.some(function(r, idx) {
    return (LINHA_DADOS + idx) !== rowAtual &&
           String(r[0]).trim() === String(valorNF).trim();
  });
}


// ── Helpers de visual ─────────────────────────────────────────

// [P01] Mantida para compatibilidade externa (restauração, reabertura, exportarPDF)
function syncCheckboxesComStatus(ws, row, status) {
  ws.getRange(row, COL_PEND_CHK, 1, 3).setValues([[
    status === 'Pendente',
    status === 'Devolvido',
    status === 'Venda'
  ]]);
}

// [P08] Mantida para compatibilidade externa
function registrarObs(ws, row, status) {
  var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var obsVal = status === 'Devolvido' ? 'Devolvido em: ' + agora
             : status === 'Venda'     ? 'Enviado para o Fábio em: ' + agora
             : '';
  ws.getRange(row, COL_OBS).setValue(obsVal);
}

// [P05] Aceita dtOpcional para evitar getValue extra quando a data já é conhecida
function aplicarCorLinha(ws, row, status, dtOpcional) {
  var cor = corPorStatus(status);
  if (status === 'Pendente') {
    try {
      var dt = (dtOpcional instanceof Date) ? dtOpcional : ws.getRange(row, COL_DATA).getValue();
      if (dt instanceof Date && !isNaN(dt)) {
        if (Math.floor((new Date() - dt) / 864e5) > 30) cor = COR_ALERTA_30DIAS;
      }
    } catch (_) {}
  }
  ws.getRange(row, 1, 1, TOTAL_COLUNAS).setBackground(cor);
}

function reaplicarCoresAba(ws) {
  if (!ws) return;
  var ul = obterUltimaLinhaDados(ws);
  if (ul < LINHA_DADOS) return;

  var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
  var hoje  = new Date();
  var cores = dados.map(function(l) {
    var cor = '#FFFFFF';
    if (l[IDX_NF]) {
      cor = corPorStatus(l[IDX_STATUS]);
      if (l[IDX_STATUS] === 'Pendente' && l[IDX_DATA] instanceof Date && !isNaN(l[IDX_DATA])) {
        if (Math.floor((hoje - l[IDX_DATA]) / 864e5) > 30) cor = COR_ALERTA_30DIAS;
      }
    }
    return Array(TOTAL_COLUNAS).fill(cor);
  });
  ws.getRange(LINHA_DADOS, 1, dados.length, TOTAL_COLUNAS).setBackgrounds(cores);
}

function reaplicarCoresTodas() {
  var ss = getSS();
  _getTodasAbas().forEach(function(nome) {
    reaplicarCoresAba(ss.getSheetByName(nome));
  });
  // Backup automático diário executado junto com a reaplicação de cores (trigger 2h)
  try {
    executarBackup();
    var props = PropertiesService.getScriptProperties();
    props.setProperty('cdv_ultimo_backup',
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
  } catch (eBkp) {
    console.error('reaplicarCoresTodas — backup: ' + eBkp);
  }
}

function protegerLinhaConcluida(ss, ws, row, status) {
  if (status !== 'Devolvido' && status !== 'Venda') return;

  var protAtivas = ws.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  if (protAtivas.some(function(p) {
    return p.getRange().getRow() === row && p.getRange().getNumRows() === 1;
  })) return;

  // [P04] Usa contador em PropertiesService em vez de iterar todas as abas
  var total = _lerTotalProtecoes();
  if (total >= LIMITE_PROTECOES) {
    registrarLog(ss, ws.getName(), row, COL_STATUS, '', status, '⚠️ Limite de proteções atingido.');
    return;
  }

  try {
    var p     = ws.getRange(row, 1, 1, TOTAL_COLUNAS).protect()
                  .setDescription('Linha ' + row + ' – ' + status);
    var owner = ss.getOwner() ? ss.getOwner().getEmail() : '';
    try {
      p.getEditors().forEach(function(u) {
        if (u.getEmail() !== owner) p.removeEditor(u);
      });
    } catch (_) {}
    if (p.canDomainEdit()) p.setDomainEdit(false);
    _incrementarProtecoes();
  } catch (e) {
    console.error('protegerLinhaConcluida: ' + e);
  }
}

// [P02] Mantida para uso em diagnóstico manual ou chamadas externas.
function contarTotalConcluidos(ss) {
  return _getTodasAbas().reduce(function(tot, nome) {
    var ws = ss.getSheetByName(nome);
    if (!ws) return tot;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return tot;
    return tot + ws.getRange(LINHA_DADOS, COL_STATUS, ul - LINHA_DADOS + 1, 1).getValues()
      .filter(function(r) { return r[0] === 'Devolvido' || r[0] === 'Venda'; }).length;
  }, 0);
}


// ════════════════════════════════════════════════════════════
//   ARQUIVAMENTO
// ════════════════════════════════════════════════════════════

function _garantirHistorico(ss) {
  var hist = ss.getSheetByName('Historico_Arquivo');
  if (!hist) hist = ss.insertSheet('Historico_Arquivo');

  if (hist.getRange('A1').getValue() !== 'NFD') {
    hist.getRange(1, 1, 1, TOTAL_COLUNAS + 1).setValues([[
      'NFD','Nº NF','Data Entrada','Fornecedor','Tipo','Motivo','Descrição do Produto',
      'Qtd','Valor Unit (R$)','Valor Total (R$)','Status',
      'Pendente ✓','Devolvido ✓','Venda ✓','Obs / Hora','Responsável','📎 Anexo NF',
      'Dias Armazenado','Tipo de Frete','Valor Frete (R$)',
      'Arquivado em'
    ]]).setBackground('#444444').setFontColor('#FFFFFF').setFontWeight('bold');
    hist.setFrozenRows(1);
    [100,100,120,180,90,200,320,60,120,130,120,95,100,85,280,200,160,110,140,120,160]
      .forEach(function(w, i) { hist.setColumnWidth(i + 1, w); });
  }
  return hist;
}

function _reconstruirAba(ss, ws, nomeAba, restantes) {
  var ul = obterUltimaLinhaDados(ws);
  var linhasLimpar = Math.max(ul - LINHA_DADOS + 1, 0);
  if (linhasLimpar > 0) {
    ws.getRange(LINHA_DADOS, 1, linhasLimpar, TOTAL_COLUNAS).clearContent().setBackground('#FFFFFF');
  }

  var fmt    = 'R$ #,##0.00;;"";""';
  var bloco  = [], cores = [], fmulas = [], fu = [], ft = [], fd = [], fdias = [];

  for (var i = 0; i < MAX_LINHAS_ABA; i++) {
    var l  = i < restantes.length ? restantes[i] : null;
    var lv = l ? l.slice() : Array(TOTAL_COLUNAS).fill('');
    if (!l) {
      lv[IDX_PEND_CHK]  = false;
      lv[IDX_DEV_CHK]   = false;
      lv[IDX_VENDA_CHK] = false;
      if (nomeAba !== 'Fornecedores Variados') lv[IDX_FORN] = nomeAba;
    }
    bloco.push(lv);
    cores.push(Array(TOTAL_COLUNAS).fill(corPorStatus(lv[IDX_STATUS])));
    var row = LINHA_DADOS + i;
    fmulas.push([_formulaTotal(row)]);
    fu.push([fmt]); ft.push([fmt]); fd.push(['dd/mm/yyyy']);
    fdias.push([_formulaDiasArmazenado(row)]);
  }

  var rng = ws.getRange(LINHA_DADOS, 1, MAX_LINHAS_ABA, TOTAL_COLUNAS);
  rng.setValues(bloco).setBackgrounds(cores);
  ws.getRange(LINHA_DADOS, COL_VL_TOT,  MAX_LINHAS_ABA, 1).setFormulas(fmulas);
  ws.getRange(LINHA_DADOS, COL_VL_UNIT, MAX_LINHAS_ABA, 1).setNumberFormats(fu);
  ws.getRange(LINHA_DADOS, COL_VL_TOT,  MAX_LINHAS_ABA, 1).setNumberFormats(ft);
  ws.getRange(LINHA_DADOS, COL_DATA,    MAX_LINHAS_ABA, 1).setNumberFormats(fd);
  ws.getRange(LINHA_DADOS, COL_DIAS_ARMAZ, MAX_LINHAS_ABA, 1).setFormulas(fdias);
  if (nomeAba !== 'Fornecedores Variados') {
    ws.getRange(LINHA_DADOS, COL_FORN, MAX_LINHAS_ABA, 1)
      .setFontColor('#555555').setFontStyle('italic');
  }
  rng.setHorizontalAlignment('center').setVerticalAlignment('middle');
  ws.getRange(LINHA_DADOS, COL_DESC, MAX_LINHAS_ABA, 1).setHorizontalAlignment('left').setWrap(true);
  ws.getRange(LINHA_DADOS, COL_OBS,  MAX_LINHAS_ABA, 1).setHorizontalAlignment('left').setWrap(true);

  restantes.forEach(function(l, idx) {
    var st = l[IDX_STATUS];
    if (st === 'Devolvido' || st === 'Venda') {
      protegerLinhaConcluida(ss, ws, LINHA_DADOS + idx, st);
    }
  });
}

/**
 * Move linhas de `dados` cujos índices estão em `linhasAlvoSet` para o histórico.
 * [P15] N appendRow individuais → 1 setValues batch por chamada.
 */
function _moverParaHistorico(hist, dados, linhasAlvoSet) {
  var restantes        = [];
  var linhasHistorico  = [];
  var total            = 0;
  var agora            = new Date();

  dados.forEach(function(l, idx) {
    var linhaAtual = LINHA_DADOS + idx;
    if (linhasAlvoSet.has(linhaAtual)) {
      linhasHistorico.push(l.concat([agora]));
      total++;
      _apagarAnexoDrive(String(l[IDX_ANEXO] || '').trim());
    } else if (l[IDX_NF]) {
      restantes.push(l);
    }
  });

  if (linhasHistorico.length) {
    var nextRow = hist.getLastRow() + 1;
    hist.getRange(nextRow, 1, linhasHistorico.length, TOTAL_COLUNAS + 1)
        .setValues(linhasHistorico);
  }

  return { restantes: restantes, total: total };
}

function arquivarItensConcluidos() {
  var ss   = getSS();
  var hist = _garantirHistorico(ss);
  var total = 0;
  var totalProtRemovidas = 0;

  _getTodasAbas().forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;

    var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();

    var linhasConcluidas = new Set();
    dados.forEach(function(l, idx) {
      if (l[IDX_NF] && (l[IDX_STATUS] === 'Devolvido' || l[IDX_STATUS] === 'Venda')) {
        linhasConcluidas.add(LINHA_DADOS + idx);
      }
    });
    ws.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function(p) {
      if (linhasConcluidas.has(p.getRange().getRow())) {
        p.remove();
        totalProtRemovidas++;
      }
    });

    var resultado = _moverParaHistorico(hist, dados, linhasConcluidas);
    total += resultado.total;
    _reconstruirAba(ss, ws, nomeAba, resultado.restantes);
  });

  _zerarContadorConcluidos();
  _decrementarProtecoes(totalProtRemovidas);

  SpreadsheetApp.flush();
  _atualizarMetricasDashboard(ss);
  if (total > 0) {
    try { SpreadsheetApp.getUi().alert('📦 ' + total + ' itens arquivados.'); } catch (_) {}
  }
  return JSON.stringify({ sucesso: total > 0 ? ('📦 ' + total + ' itens arquivados.') : '✅ Nenhum item pendente de arquivamento (nada com status Devolvido/Venda fora do histórico).', total: total });
}

function _arquivarLinhasEspecificas(ss, linhasParaArquivar) {
  if (!linhasParaArquivar || !linhasParaArquivar.length) return 0;

  var hist = _garantirHistorico(ss);
  var porAba = {};
  linhasParaArquivar.forEach(function(ref) {
    if (!porAba[ref.nomeAba]) porAba[ref.nomeAba] = new Set();
    porAba[ref.nomeAba].add(ref.linha);
  });

  var total = 0;

  Object.keys(porAba).forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;

    var linhasAlvo = porAba[nomeAba];
    var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();

    ws.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function(p) {
      if (linhasAlvo.has(p.getRange().getRow())) p.remove();
    });

    var resultado = _moverParaHistorico(hist, dados, linhasAlvo);
    total += resultado.total;
    _reconstruirAba(ss, ws, nomeAba, resultado.restantes);
  });

  SpreadsheetApp.flush();
  return total;
}


// ════════════════════════════════════════════════════════════
//   DASHBOARD
//
//  Estrutura:
//  Linha  1    : Título
//  Linha  2    : Subtítulo
//  Linhas 3–5  : Filtro de datas (col B–D) | Taxa (col F–I)
//  Linha  6    : Separador
//  Linhas 7–8  : Cabeçalhos de coluna (fornecedores)
//  Linhas 9–17 : Blocos PENDENTE / DEVOLVIDO / VENDA
//  Linhas 18–21: KPIs globais
//  Linha  23+  : Gráficos
// ════════════════════════════════════════════════════════════

function garantirDashboard(ss) {
  var ws = ss.getSheetByName('Dashboard');
  if (!ws) ws = ss.insertSheet('Dashboard');
  var sentinel = '';
  try { sentinel = ws.getRange(DASH_SENTINEL_CELL).getValue(); } catch(_) {}
  if (sentinel !== DASH_SENTINEL_VALUE) _criarLayoutDashboard(ss);
  _atualizarMetricasDashboard(ss);
}

function _criarLayoutDashboard(ss) {
  var ws = ss.getSheetByName('Dashboard');
  if (!ws) ws = ss.insertSheet('Dashboard');

  try { var f = ws.getFilter(); if (f) f.remove(); } catch(_) {}
  try { ws.setConditionalFormatRules([]); } catch(_) {}
  ws.clear();
  ws.setHiddenGridlines(true);
  ws.setFrozenRows(2);

  ws.getRange(1, 1, 55, 11).setBackground(DC.CINZA);

  ws.setColumnWidth(1, 12);
  for (var ci = 2; ci <= 9; ci++) ws.setColumnWidth(ci, 130);
  ws.setColumnWidth(10, 12);
  try { ws.hideColumns(11, 20); } catch(_) {}

  // Row map (25 rows visible):
  // 1:title 2:sub 3:sep 4:ini 5:fim 6:sep 7:header 8:sep
  // 9:PEND_label 10:PEND_vals 11:sep
  // 12:TR_label  13:TR_vals   14:sep  ← NEW Em Transferência
  // 15:DEV_label 16:DEV_vals  17:sep
  // 18:VENDA_label 19:VENDA_vals 20:sep
  // 21:KPI_hdr 22:KPI_num 23:KPI_val 24:KPI_sub 25:sep
  [48,24,8,30,30,8,22,6, 22,38,8, 22,38,8, 22,38,8, 22,38,10, 22,42,24,18,10]
    .forEach(function(h, i) { ws.setRowHeight(i + 1, h); });
  ws.setRowHeights(26, 20, 22);

  // ── Título ────────────────────────────────────────────────
  ws.getRange(1, 1, 1, 10).setBackground(DC.HEADER);
  ws.getRange(1, 2, 1, 8).merge()
    .setValue('CONTROLE DE DEVOLUÇÕES  ·  PAINEL DE GESTÃO')
    .setFontColor(DC.BRANCO).setFontWeight('bold').setFontSize(15)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  ws.getRange(DASH_SENTINEL_CELL).setValue(DASH_SENTINEL_VALUE)
    .setFontColor(DC.CINZA).setBackground(DC.CINZA);

  // ── Subtítulo ─────────────────────────────────────────────
  ws.getRange(2, 1, 1, 10).setBackground(DC.SUB);
  ws.getRange(2, 2, 1, 8).merge()
    .setValue('Atualizado automaticamente  ·  Edite as datas abaixo para filtrar o período')
    .setFontColor('#93B4D4').setFontSize(9).setFontStyle('italic')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');

  // ── Filtro de datas ───────────────────────────────────────
  ws.getRange(4, 2).setValue('Início:').setFontSize(9).setFontColor(DC.TEXTO_L)
    .setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');
  ws.getRange(5, 2).setValue('Fim:').setFontSize(9).setFontColor(DC.TEXTO_L)
    .setFontWeight('bold').setHorizontalAlignment('right').setVerticalAlignment('middle');

  var ano = new Date().getFullYear();
  ws.getRange(4, 3).setValue(new Date(ano, 0, 1)).setNumberFormat('dd/mm/yyyy')
    .setBackground('#F0F7FF').setFontColor(DC.PEND).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  ws.getRange(5, 3).setValue(new Date(ano, 11, 31)).setNumberFormat('dd/mm/yyyy')
    .setBackground('#F0F7FF').setFontColor(DC.PEND).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // ── Taxa de resolução ─────────────────────────────────────
  ws.getRange(3, 6, 3, 4).setBackground(DC.BRANCO)
    .setBorder(true, true, true, true, false, false, DC.BORDA, SpreadsheetApp.BorderStyle.SOLID);
  ws.getRange(3, 6, 1, 4).merge()
    .setValue('🏆 TAXA DE RESOLUÇÃO')
    .setFontWeight('bold').setFontSize(9).setFontColor(DC.TEXTO_L)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  ws.getRange(4, 6, 2, 2).merge()
    .setValue('—').setFontWeight('bold').setFontSize(26).setFontColor(DC.DEV)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setNumberFormat('0%');
  ws.getRange(4, 8, 2, 2).merge()
    .setValue('itens resolvidos\nsobre o total').setFontSize(8).setWrap(true)
    .setFontColor(DC.TEXTO_L).setHorizontalAlignment('left').setVerticalAlignment('middle');

  // ── Cabeçalhos fornecedores ───────────────────────────────
  ws.getRange(7, 1, 1, 10).setBackground(DC.CINZA);
  DASH_COLS.forEach(function(g) {
    ws.getRange(7, g.c, 1, 2).merge()
      .setValue(g.label).setBackground(g.cor).setFontColor(DC.BRANCO)
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  });

  // ── Blocos de status ──────────────────────────────────────
  var blocks = [
    { label: '⏳ PENDENTE',           acc: DC.PEND,  bg: DC.PEND_BG,  rL: 9,  rV: 10 },
    { label: '🚚 EM TRANSFERÊNCIA',   acc: DC.TR,    bg: DC.TR_BG,    rL: 12, rV: 13 }, // NEW
    { label: '✅ DEVOLVIDO',          acc: DC.DEV,   bg: DC.DEV_BG,   rL: 15, rV: 16 },
    { label: '🛒 VENDA',             acc: DC.VENDA, bg: DC.VENDA_BG, rL: 18, rV: 19 }
  ];
  blocks.forEach(function(b) {
    ws.getRange(b.rL, 1, 1, 10).setBackground(b.acc);
    ws.getRange(b.rL, 2, 1, 8).merge()
      .setValue(b.label).setFontColor(DC.BRANCO).setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('left').setVerticalAlignment('middle');
    DASH_COLS.forEach(function(g, gi) {
      var acc = gi === 3 ? DC.TOT : b.acc;
      var bg  = gi === 3 ? DC.TOT_BG : b.bg;
      ws.getRange(b.rV, g.c).setBackground(bg).setFontColor(acc)
        .setFontWeight('bold').setFontSize(18)
        .setHorizontalAlignment('center').setVerticalAlignment('middle').setValue('—');
      ws.getRange(b.rV, g.c + 1).setBackground(bg).setFontColor(DC.TEXTO_L)
        .setFontSize(9).setFontWeight('bold')
        .setHorizontalAlignment('right').setVerticalAlignment('middle')
        .setNumberFormat('R$ #,##0.00').setValue(0);
    });
  });

  // ── KPIs globais (rows 21-24) ─────────────────────────────
  var kpis = [
    { label: 'TOTAL PENDENTE',       sub: 'aguardando resolução',  acc: DC.PEND,  bg: DC.PEND_BG,  col: 2 },
    { label: 'EM TRANSFERÊNCIA',     sub: 'em trânsito',           acc: DC.TR,    bg: DC.TR_BG,    col: 4 }, // NEW
    { label: 'TOTAL DEVOLVIDO',      sub: 'devoluções OK',         acc: DC.DEV,   bg: DC.DEV_BG,   col: 6 },
    { label: 'TOTAL RESOLVIDO',      sub: 'devolvidos + vendas',   acc: DC.TOT,   bg: DC.TOT_BG,   col: 8 }
  ];
  kpis.forEach(function(k) {
    ws.getRange(21, k.col, 4, 2).setBackground(k.bg)
      .setBorder(true, true, true, true, false, false, k.acc, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    ws.getRange(21, k.col, 1, 2).merge()
      .setValue(k.label).setBackground(k.acc).setFontColor(DC.BRANCO)
      .setFontWeight('bold').setFontSize(8)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    ws.getRange(22, k.col, 1, 2).merge().setValue('—')
      .setFontColor(k.acc).setFontWeight('bold').setFontSize(22)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    ws.getRange(23, k.col, 1, 2).merge().setValue(0)
      .setFontColor(DC.TEXTO_L).setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setNumberFormat('R$ #,##0.00');
    ws.getRange(24, k.col, 1, 2).merge().setValue(k.sub)
      .setFontColor(DC.TEXTO_L).setFontSize(8).setFontStyle('italic')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  });

  // ── Dados auxiliares gráficos (col 11+, hidden) ───────────
  ws.getRange(1, 11, 5, 2).setValues([
    ['Status','Qtd'],['Pendente',0],['Em Transferência',0],['Devolvido',0],['Venda',0]
  ]);
  ws.getRange(1, 14, 13, 4).setValues(
    [['Mês','Pendente','Devolvido','Venda']].concat(
      ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
        .map(function(m) { return [m, 0, 0, 0]; })
    )
  );

  // ── Gráficos (a partir da row 27) ────────────────────────
  ws.getCharts().forEach(function(ch) { ws.removeChart(ch); });
  ws.insertChart(ws.newChart().setChartType(Charts.ChartType.PIE)
    .addRange(ws.getRange(1, 11, 5, 2)).setPosition(27, 2, 0, 0)
    .setOption('title', 'Distribuição por Status')
    .setOption('width', 320).setOption('height', 200)
    .setOption('colors', [DC.PEND, DC.TR, DC.DEV, DC.VENDA])
    .setOption('pieHole', 0.4).setOption('pieSliceText', 'percentage')
    .setOption('legend', { position: 'bottom', textStyle: { fontSize: 9 } })
    .setOption('backgroundColor', DC.CINZA).build());
  ws.insertChart(ws.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(ws.getRange(1, 14, 13, 4)).setPosition(27, 5, 0, 0)
    .setOption('title', 'Lançamentos por Mês — ' + new Date().getFullYear())
    .setOption('width', 480).setOption('height', 200)
    .setOption('colors', [DC.PEND, DC.DEV, DC.VENDA])
    .setOption('legend', { position: 'bottom', textStyle: { fontSize: 9 } })
    .setOption('backgroundColor', DC.CINZA)
    .setOption('vAxis', { textStyle: { fontSize: 8 } })
    .setOption('hAxis', { textStyle: { fontSize: 8 } }).build());

  SpreadsheetApp.flush();
}

// [P03] Debounce de _DASH_DEBOUNCE_SEG segundos para evitar releituras desnecessárias
function _atualizarMetricasDashboard(ss) {
  var cache = CacheService.getScriptCache();
  if (cache.get(_CACHE_KEY_DASH)) return;
  cache.put(_CACHE_KEY_DASH, '1', _DASH_DEBOUNCE_SEG);

  var ws = ss.getSheetByName('Dashboard');
  if (!ws) { _criarLayoutDashboard(ss); return; }

  if (!cache.get(_CACHE_KEY_SENTINEL)) {
    var sentinel = '';
    try { sentinel = ws.getRange(DASH_SENTINEL_CELL).getValue(); } catch(_) {}
    if (sentinel !== DASH_SENTINEL_VALUE) {
      _criarLayoutDashboard(ss);
      ws = ss.getSheetByName('Dashboard');
    }
    cache.put(_CACHE_KEY_SENTINEL, '1', 1800);
  }

  var rawIni = ws.getRange(DASH_DATA_INI_CELL).getValue();
  var rawFim = ws.getRange(DASH_DATA_FIM_CELL).getValue();
  var ano    = new Date().getFullYear();
  var dataIni = (rawIni instanceof Date && !isNaN(rawIni)) ? rawIni : new Date(ano, 0, 1);
  var dataFim = (rawFim instanceof Date && !isNaN(rawFim)) ? rawFim : new Date(ano, 11, 31);

  var b = _processarAba(ss.getSheetByName('Britania'),              dataIni, dataFim);
  var u = _processarAba(ss.getSheetByName('Unilever'),              dataIni, dataFim);
  var v = _processarAba(ss.getSheetByName('Fornecedores Variados'), dataIni, dataFim);

  // Abas extras (criadas via "Adicionar Novo Fornecedor") somadas em Fornecedores Variados
  _getAbasExtras().forEach(function(nome) {
    var ex = _processarAba(ss.getSheetByName(nome), dataIni, dataFim);
    v.pQtd += ex.pQtd; v.pValor += ex.pValor;
    v.dQtd += ex.dQtd; v.dValor += ex.dValor;
    v.vQtd += ex.vQtd; v.vValor += ex.vValor;
    v.tQtd += ex.tQtd; v.tValor += ex.tValor;
  });

  // Contagem de "Em Transferência" por aba de origem (Transferências tab)
  var trTot = { bQtd:0,bVal:0, uQtd:0,uVal:0, vQtd:0,vVal:0, totQtd:0,totVal:0 };
  var wsTrDash = ss.getSheetByName(ABA_TRANSFERENCIAS);
  if (wsTrDash && wsTrDash.getLastRow() >= 2) {
    wsTrDash.getRange(2, 1, wsTrDash.getLastRow() - 1, TRANSF_TOTAL_COL).getValues()
      .forEach(function(l) {
        var stTr = String(l[TRANSF_COL_STATUS - 1] || '').trim();
        if (stTr !== 'Em Transferência') return;
        var val  = parseFloat(l[IDX_VL_TOT] || 0) || 0;
        var dtNF = l[IDX_DATA];
        if (dtNF instanceof Date && (dtNF < dataIni || dtNF > dataFim)) return;
        var aba  = String(l[TRANSF_COL_ABA_ORIGEM - 1] || '').trim();
        trTot.totQtd++; trTot.totVal += val;
        if      (aba === 'Britania')              { trTot.bQtd++; trTot.bVal += val; }
        else if (aba === 'Unilever')              { trTot.uQtd++; trTot.uVal += val; }
        else                                      { trTot.vQtd++; trTot.vVal += val; }
      });
  }

  var tP  = b.pQtd + u.pQtd + v.pQtd;   var tPv = b.pValor + u.pValor + v.pValor;
  var tTR = trTot.totQtd;                 var tTRv= trTot.totVal;
  var tD  = b.dQtd + u.dQtd + v.dQtd;   var tDv = b.dValor + u.dValor + v.dValor;
  var tV  = b.vQtd + u.vQtd + v.vQtd;   var tVv = b.vValor + u.vValor + v.vValor;
  var tR  = tD + tV;                     var tRv = tDv + tVv;
  var taxa = (tP + tTR + tR) > 0 ? tR / (tP + tTR + tR) : 0;

  ws.getRange(4, 6, 2, 2).merge().setValue(taxa).setNumberFormat('0%')
    .setFontWeight('bold').setFontSize(26)
    .setFontColor(taxa >= 0.7 ? DC.DEV : taxa >= 0.4 ? DC.VENDA : '#DC2626')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // Rows: PEND=10, EM TRANSFERÊNCIA=13, DEV=16, VENDA=19
  var sd = [
    { rV: 10, qtds: [b.pQtd, u.pQtd, v.pQtd, tP], vals: [b.pValor, u.pValor, v.pValor, tPv], acc: DC.PEND  },
    { rV: 13, qtds: [trTot.bQtd, trTot.uQtd, trTot.vQtd, tTR], vals: [trTot.bVal, trTot.uVal, trTot.vVal, tTRv], acc: DC.TR },
    { rV: 16, qtds: [b.dQtd, u.dQtd, v.dQtd, tD], vals: [b.dValor, u.dValor, v.dValor, tDv], acc: DC.DEV   },
    { rV: 19, qtds: [b.vQtd, u.vQtd, v.vQtd, tV], vals: [b.vValor, u.vValor, v.vValor, tVv], acc: DC.VENDA }
  ];
  sd.forEach(function(s) {
    DASH_COLS.forEach(function(g, gi) {
      var acc = gi === 3 ? DC.TOT : s.acc;
      ws.getRange(s.rV, g.c).setValue(s.qtds[gi]).setFontColor(acc)
        .setFontWeight('bold').setFontSize(18)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
      ws.getRange(s.rV, g.c + 1).setValue(s.vals[gi]).setNumberFormat('R$ #,##0.00')
        .setFontColor(DC.TEXTO_L).setFontWeight('bold').setFontSize(9)
        .setHorizontalAlignment('right').setVerticalAlignment('middle');
    });
  });

  // KPIs: PEND=col2, EM TRANSF=col4, DEV=col6, RESOLVIDO=col8 — rows 22-23
  var kd = [[tP, tPv], [tTR, tTRv], [tD, tDv], [tR, tRv]];
  var ka = [DC.PEND, DC.TR, DC.DEV, DC.TOT];
  [2, 4, 6, 8].forEach(function(col, i) {
    ws.getRange(22, col, 1, 2).merge().setValue(kd[i][0])
      .setFontColor(ka[i]).setFontWeight('bold').setFontSize(22)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    ws.getRange(23, col, 1, 2).merge().setValue(kd[i][1]).setNumberFormat('R$ #,##0.00')
      .setFontColor(DC.TEXTO_L).setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
  });

  // Pie chart data (col 11)
  ws.getRange(2, 12).setValue(tP);
  ws.getRange(3, 12).setValue(tTR);
  ws.getRange(4, 12).setValue(tD);
  ws.getRange(5, 12).setValue(tV);

  _atualizarGraficoMensal(ss);
}

function _processarAba(ws, dataIni, dataFim) {
  var r = { pQtd:0, pValor:0, dQtd:0, dValor:0, vQtd:0, vValor:0, tQtd:0, tValor:0 };
  if (!ws) return r;
  var ul = obterUltimaLinhaDados(ws);
  if (ul < LINHA_DADOS) return r;
  ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
    .forEach(function(l) {
      var nf = l[IDX_NF], dt = l[IDX_DATA], val = parseFloat(l[IDX_VL_TOT]) || 0, st = l[IDX_STATUS];
      if (!nf || !(dt instanceof Date) || dt < dataIni || dt > dataFim) return;
      r.tQtd++; r.tValor += val;
      if      (st === 'Pendente')  { r.pQtd++; r.pValor += val; }
      else if (st === 'Devolvido') { r.dQtd++; r.dValor += val; }
      else if (st === 'Venda')     { r.vQtd++; r.vValor += val; }
    });
  return r;
}

function _atualizarGraficoMensal(ss) {
  var ws = ss.getSheetByName('Dashboard');
  if (!ws) return;
  var ano  = new Date().getFullYear();
  var meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var cnt  = { Pendente: new Array(12).fill(0), Devolvido: new Array(12).fill(0), Venda: new Array(12).fill(0) };
  _getTodasAbas().forEach(function(nome) {
    var wsA = ss.getSheetByName(nome);
    if (!wsA) return;
    var ul = obterUltimaLinhaDados(wsA);
    if (ul < LINHA_DADOS) return;
    wsA.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l) {
        var nf = l[IDX_NF], dt = l[IDX_DATA], st = l[IDX_STATUS];
        if (!nf || !(dt instanceof Date) || dt.getFullYear() !== ano) return;
        if (cnt[st] !== undefined) cnt[st][dt.getMonth()]++;
      });
  });
  var tab = [['Mês','Pendente','Devolvido','Venda']];
  for (var m = 0; m < 12; m++) tab.push([meses[m], cnt['Pendente'][m], cnt['Devolvido'][m], cnt['Venda'][m]]);
  ws.getRange(1, 14, 13, 4).setValues(tab);
}

// Stubs mantidos por compatibilidade com chamadas legadas
function _renderQuadro() {}
function _criarGraficoMensal() {}


// ════════════════════════════════════════════════════════════
//   EXPORTAR PDF
// ════════════════════════════════════════════════════════════

function abrirFormularioExportarPDF() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormExportarPDF').setWidth(460).setHeight(370),
    '📄 Gerar PDF Devolução'
  );
}

/**
 * Gera e salva o PDF de devolução para as NFs informadas.
 * v7: NÃO altera status — apenas gera e salva o PDF no Drive.
 * O status "Devolvido" é definido exclusivamente via darBaixaTransferencia.
 */
function executarExportarPDF(txtNfsRaw) {
  var nfsDigitadas = txtNfsRaw.split(/[\n,]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (!nfsDigitadas.length) return JSON.stringify({ erro: 'Nenhuma NF válida identificada.' });

  if (!ID_MODELO_DOC || ID_MODELO_DOC.startsWith('INSIRA'))
    return JSON.stringify({ erro: 'Configure ID_MODELO_DOC no topo do script.' });
  if (!ID_PASTA_DESTINO || ID_PASTA_DESTINO.startsWith('INSIRA'))
    return JSON.stringify({ erro: 'Configure ID_PASTA_DESTINO no topo do script.' });

  var ss             = getSS();
  var itens          = [];
  var naoLocalizadas = nfsDigitadas.slice();

  // Busca em abas operacionais (Pendente) e em Transferências (Em Transferência)
  var fontes = _getTodasAbas().map(function(nome) { return { aba: nome, cols: TOTAL_COLUNAS, isTransf: false }; });
  var wsTrCheck = ss.getSheetByName(ABA_TRANSFERENCIAS);
  if (wsTrCheck) fontes.push({ aba: ABA_TRANSFERENCIAS, cols: TRANSF_TOTAL_COL, isTransf: true });

  fontes.forEach(function(fonte) {
    var ws = ss.getSheetByName(fonte.aba);
    if (!ws) return;
    var ul = fonte.isTransf ? ws.getLastRow() : obterUltimaLinhaDados(ws);
    if (ul < (fonte.isTransf ? 2 : LINHA_DADOS)) return;
    var startRow = fonte.isTransf ? 2 : LINHA_DADOS;
    var dados = ws.getRange(startRow, 1, ul - startRow + 1, fonte.cols).getValues();
    dados.forEach(function(l) {
      var nfd = String(l[IDX_NFD]).trim();
      var nf  = String(l[IDX_NF]).trim();
      var st  = fonte.isTransf
        ? String(l[TRANSF_COL_STATUS - 1] || '').trim()
        : String(l[IDX_STATUS]).trim();
      var bat = _baterTermos(nfsDigitadas, nfd, nf);
      if (bat.bate && (st === 'Pendente' || st === 'Em Transferência')) {
        var forn = fonte.isTransf
          ? String(l[IDX_FORN] || '').trim()
          : String(l[IDX_FORN]).trim();
        itens.push({ nf: nf, nfd: nfd, fornecedor: forn });
        var idx = naoLocalizadas.indexOf(bat.termoBateu);
        if (idx > -1) naoLocalizadas.splice(idx, 1);
      }
    });
  });

  if (!itens.length) return JSON.stringify({ erro: "Nenhuma NF com status 'Pendente' ou 'Em Transferência' localizada." });

  var forns = itens.reduce(function(acc, it) {
    if (acc.indexOf(it.fornecedor) === -1) acc.push(it.fornecedor);
    return acc;
  }, []);
  if (forns.length > 1)
    return JSON.stringify({ erro: 'NFs de fornecedores diferentes (' + forns.join(', ') + '). Use apenas NFs do mesmo fornecedor.' });

  var listaNfs = itens.map(function(it) { return it.nfd || it.nf; });
  var dataExp  = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy');

  try {
    var tempFile = DriveApp.getFileById(ID_MODELO_DOC).makeCopy('Temp_PDF_Dev');
    var doc      = DocumentApp.openById(tempFile.getId());
    var body     = doc.getBody();
    body.replaceText('\\{\\{\\s*nf\\s*\\}\\}',   listaNfs.join(' / '));
    body.replaceText('\\{\\{\\s*data\\s*\\}\\}',  dataExp);
    body.replaceText('\\{\\{\\s*forn\\s*\\}\\}',  forns[0]);
    doc.saveAndClose();

    var nomePdf = 'Devolucao_' + listaNfs.slice(0, 3).join('-') + (listaNfs.length > 3 ? '_etc' : '') + '.pdf';
    var pdf     = DriveApp.getFolderById(ID_PASTA_DESTINO)
                    .createFile(tempFile.getAs(MimeType.PDF).setName(nomePdf));
    tempFile.setTrashed(true);

    registrarLog(ss, 'SISTEMA', 0, 0, '', listaNfs.join(', '),
      '📄 PDF gerado (sem alterar status) — NFs: ' + listaNfs.join(', ') + ' · ' + forns[0]);

    var aviso = naoLocalizadas.length
      ? '\n⚠️ Não localizadas: ' + naoLocalizadas.join(', ') : '';
    return JSON.stringify({
      sucesso: '✅ PDF gerado para ' + listaNfs.length + ' NF(s) — ' + forns[0] + '.\nStatus não alterado.' + aviso,
      urlPdf: pdf.getUrl()
    });
  } catch (e) {
    registrarLog(ss, 'SISTEMA', 0, 0, '', '', '❌ Erro PDF: ' + e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}


// ════════════════════════════════════════════════════════════
//   PROGRAMAR FRETE DA DEVOLUÇÃO
// ════════════════════════════════════════════════════════════

function abrirProgramarFrete() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormProgramarFrete').setWidth(480).setHeight(640),
    '🚚 Programar Frete da Devolução'
  );
}

/**
 * Busca NF(s)/NFD Pendente(s) que correspondam ao termo, para programar o frete.
 * Retorna { itens: [...] } com todos os itens Pendentes encontrados, ou { erro }.
 */
function buscarNFParaProgramar(termo) {
  termo = String(termo || '').trim();
  if (!termo) return JSON.stringify({ erro: 'Informe a NF ou NFD.' });

  var ss  = getSS();
  var tz  = ss.getSpreadsheetTimeZone();
  var itens = [];

  _getTodasAbas().forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;

    var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
    dados.forEach(function(l, i) {
      var nfd = String(l[IDX_NFD] || '').trim();
      var nf  = String(l[IDX_NF]  || '').trim();
      if (nf !== termo && nfd !== termo) return;

      var st = String(l[IDX_STATUS] || '').trim();
      if (st !== 'Pendente') return;

      var dt = l[IDX_DATA];
      itens.push({
        nf:         nf,
        nfd:        nfd,
        forn:       String(l[IDX_FORN] || nomeAba).trim(),
        desc:       String(l[IDX_DESC] || '').trim().substring(0, 80),
        data:       dt instanceof Date ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
        freteTipo:  String(l[IDX_FRETE_TIPO]  || '').trim(),
        freteValor: parseFloat(l[IDX_FRETE_VALOR]) || 0,
        aba:        nomeAba,
        linha:      LINHA_DADOS + i
      });
    });
  });

  if (!itens.length)
    return JSON.stringify({ erro: 'NF/NFD "' + termo + '" não encontrada como Pendente em nenhuma aba.' });

  return JSON.stringify({ itens: itens });
}

/**
 * Busca NFs/NFDs Pendentes para prévia — sem alterar dados.
 * Retorna { itens: [{nfd,nf,forn,tipo,motivo,qtd,vlTot,data}] } ou { erro }.
 */
function buscarPreviewNFs(txtNfsRaw) {
  var nfsDigitadas = String(txtNfsRaw || '').split(/[\n,;]+/).map(function(s){ return s.trim(); }).filter(Boolean);
  if (!nfsDigitadas.length) return JSON.stringify({ erro: 'Nenhuma NF válida identificada.' });

  var ss    = getSS();
  var tz    = ss.getSpreadsheetTimeZone();
  var itens = [];
  var naoLocalizadas = nfsDigitadas.slice();

  _getTodasAbas().forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;

    var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
    dados.forEach(function(l) {
      var nfd = String(l[IDX_NFD] || '').trim();
      var nf  = String(l[IDX_NF]  || '').trim();
      var st  = String(l[IDX_STATUS] || '').trim();
      var bat = _baterTermos(nfsDigitadas, nfd, nf);
      if (!bat.bate || st !== 'Pendente') return;

      var dt = l[IDX_DATA];
      itens.push({
        nfd:    nfd,
        nf:     nf,
        forn:   String(l[IDX_FORN]   || '').trim(),
        tipo:   String(l[IDX_TIPO]   || '').trim(),
        motivo: String(l[IDX_MOTIVO] || '').trim(),
        qtd:    parseFloat(l[IDX_QTD]    || 0) || 0,
        vlTot:  parseFloat(l[IDX_VL_TOT] || 0) || 0,
        data:   dt instanceof Date ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : ''
      });
      var idx = naoLocalizadas.indexOf(bat.termoBateu);
      if (idx > -1) naoLocalizadas.splice(idx, 1);
    });
  });

  if (!itens.length) return JSON.stringify({ erro: "Nenhuma NF com status 'Pendente' localizada." });
  return JSON.stringify({ itens: itens, naoLocalizadas: naoLocalizadas });
}

/**
 * Salva o tipo e o valor de frete de um item Pendente.
 * params: { aba, linha, freteTipo, freteValor }
 */
function salvarProgramacaoFrete(params) {
  if (!params || !params.aba || !params.linha)
    return JSON.stringify({ erro: 'Dados incompletos para salvar a programação de frete.' });

  var freteTipo = String(params.freteTipo || '').trim();
  if (TIPOS_FRETE.indexOf(freteTipo) === -1)
    return JSON.stringify({ erro: 'Tipo de frete inválido. Selecione uma das opções disponíveis.' });

  var precisaValor = (freteTipo === 'Valor + ICMS' || freteTipo === 'Valor');
  var freteValor = '';
  if (precisaValor) {
    freteValor = Number(String(params.freteValor || '').replace(',', '.'));
    if (isNaN(freteValor) || freteValor < 0)
      return JSON.stringify({ erro: 'Informe um valor de frete válido.' });
  } else if (freteTipo === 'Cortesia') {
    freteValor = 0; // Cortesia = frete sem custo
  }
  // Tabela: valor calculado externamente pelo TMS/CTe — fica em branco aqui de propósito.

  var ss = getSS();
  var ws = ss.getSheetByName(params.aba);
  if (!ws) return JSON.stringify({ erro: 'Aba "' + params.aba + '" não encontrada.' });

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(8000)) return JSON.stringify({ erro: 'Sistema ocupado. Tente novamente.' });

  try {
    var linha = Number(params.linha);
    var statusAtual = ws.getRange(linha, COL_STATUS).getValue();
    if (statusAtual !== 'Pendente')
      return JSON.stringify({ erro: 'O item não está mais Pendente (status atual: "' + statusAtual +
        '"). A programação de frete só é permitida antes da baixa final.' });

    var nf  = ws.getRange(linha, COL_NF).getValue();
    var nfd = ws.getRange(linha, COL_NFD).getValue();
    var freteAnterior = String(ws.getRange(linha, COL_FRETE_TIPO).getValue() || '').trim();

    ws.getRange(linha, COL_FRETE_TIPO, 1, 2).setValues([[freteTipo, freteValor]]);

    var nfLabel = nfd ? 'NFD ' + nfd + ' / NF ' + nf : 'NF ' + nf;
    registrarLog(ss, params.aba, linha, COL_FRETE_TIPO, freteAnterior || '(não programado)',
      freteTipo + (precisaValor ? ' — R$ ' + _fmtVal(freteValor) : ''),
      '🚚 Frete programado — ' + nfLabel);

    return JSON.stringify({
      ok: '✅ Frete programado para ' + nfLabel + ': ' + freteTipo +
          (precisaValor ? ' — R$ ' + _fmtVal(freteValor) : '') + '.'
    });
  } finally {
    trava.releaseLock();
  }
}


// ════════════════════════════════════════════════════════════
//   TRANSFERÊNCIAS — Programação de Devoluções com Agendamento
//   v7: linha move fisicamente origin → Transferências e vice-versa
// ════════════════════════════════════════════════════════════

const ABA_TRANSFERENCIAS         = 'Transferencias';
// Schema: cols 1-20 = dados originais da nota | cols 21-30 = controle de transferência
const TRANSF_TOTAL_COL           = 30;
const TRANSF_COL_LOTE_ID         = 30;
const TRANSF_COL_ABA_ORIGEM      = 21;
const TRANSF_COL_TRANSPORTADORA  = 22;
const TRANSF_COL_DATA_AGEND      = 23;
const TRANSF_COL_STATUS          = 24; // 'Em Transferência' | 'Concluída' | 'Cancelada'
const TRANSF_COL_RESP            = 25;
const TRANSF_COL_DATA_CAD        = 26;
const TRANSF_COL_DATA_BAIXA      = 27;
const TRANSF_COL_COMPROVANTE     = 28;
const TRANSF_COL_OBS             = 29;

function _garantirAbaTransferencias(ss) {
  var ws = ss.getSheetByName(ABA_TRANSFERENCIAS);
  if (ws) {
    // Verifica se o schema já é o v7 (29 colunas com 'Aba Origem' na col 21)
    try {
      var cabVal  = String(ws.getRange(1, TRANSF_COL_ABA_ORIGEM).getValue()).trim();
      var cabLote = String(ws.getRange(1, TRANSF_COL_LOTE_ID).getValue()).trim();
      if (cabVal === 'Aba Origem' && cabLote === 'Lote ID') return ws;
      if (cabVal === 'Aba Origem' && cabLote !== 'Lote ID') {
        ws.getRange(1, TRANSF_COL_LOTE_ID).setValue('Lote ID')
          .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
        ws.setColumnWidth(TRANSF_COL_LOTE_ID, 280);
        return ws;
      }
    } catch(_) {}
  } else {
    ws = ss.insertSheet(ABA_TRANSFERENCIAS);
  }
  ws.clearContents();
  // Colunas 1-20: espelham as 20 colunas da aba de origem
  var cabOrig = [
    'NFD','Nº NF','Data Entrada','Fornecedor','Tipo','Motivo','Descrição',
    'Qtd','Vl Unit','Vl Total','Status','Pend✓','Dev✓','Venda✓',
    'Obs','Responsável','Anexo','Dias Armaz.','Tipo Frete','Valor Frete'
  ];
  // Colunas 21-29: controle da transferência
  var cabCtrl = [
    'Aba Origem','Nº Pedido','Agendamento','Status Transf.',
    'Resp. Transf.','Cadastrado em','Data Baixa','Comprovante','Obs Cancelamento',
    'Lote ID'
  ];
  var header = cabOrig.concat(cabCtrl);
  ws.getRange(1, 1, 1, TRANSF_TOTAL_COL).setValues([header])
    .setBackground('#0891B2').setFontColor('#fff').setFontWeight('bold');
  ws.setFrozenRows(1);
  // Larguras para as 29 colunas
  [80,100,110,160,80,120,220,60,90,100,
   110,60,60,60,160,160,60,80,100,100,
   160,160,120,120,160,140,120,200,200,280].forEach(function(w,i){
    ws.setColumnWidth(i+1, w);
  });
  return ws;
}

/**
 * Programa uma devolução: move a linha fisicamente da aba de origem
 * para a aba Transferências, marcando o status como "Em Transferência".
 */
function salvarProgramacaoDevolucao(params) {
  if (!params || !params.aba || !params.linha)
    return JSON.stringify({ erro: 'Dados incompletos.' });
  var freteTipo = String(params.freteTipo || '').trim();
  if (TIPOS_FRETE.indexOf(freteTipo) === -1)
    return JSON.stringify({ erro: 'Tipo de frete inválido.' });
  var precisaValor = (freteTipo === 'Valor + ICMS' || freteTipo === 'Valor');
  var freteValor = '';
  if (precisaValor) {
    freteValor = Number(String(params.freteValor || '').replace(',', '.'));
    if (isNaN(freteValor) || freteValor < 0)
      return JSON.stringify({ erro: 'Informe um valor de frete válido.' });
  } else if (freteTipo === 'Cortesia') {
    freteValor = 0;
  }
  var dataAgend = null;
  if (params.dataAgendamento) {
    try { dataAgend = new Date(params.dataAgendamento); if (isNaN(dataAgend.getTime())) dataAgend = null; } catch(_){}
  }
  var transportadora = String(params.numeroPedido || params.transportadora || '').trim();

  var ss = getSS();
  var ws = ss.getSheetByName(params.aba);
  if (!ws) return JSON.stringify({ erro: 'Aba "' + params.aba + '" não encontrada.' });
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(8000)) return JSON.stringify({ erro: 'Sistema ocupado. Tente novamente.' });
  try {
    var linha = Number(params.linha);
    var dadosLinha = ws.getRange(linha, 1, 1, TOTAL_COLUNAS).getValues()[0];
    var statusAtual = String(dadosLinha[IDX_STATUS] || '').trim();
    if (statusAtual !== 'Pendente')
      return JSON.stringify({ erro: 'Item não está Pendente (status atual: "' + statusAtual + '").' });

    var nf   = String(dadosLinha[IDX_NF]  || '').trim();
    var nfd  = String(dadosLinha[IDX_NFD] || '').trim();
    var tz   = Session.getScriptTimeZone();
    var agora  = new Date();
    var usuario = Session.getActiveUser().getEmail() || 'sistema';

    // Atualiza dados da linha com frete e status Em Transferência (antes de mover)
    var rowData = dadosLinha.slice();
    rowData[IDX_STATUS]       = 'Em Transferência';
    rowData[IDX_PEND_CHK]     = false;
    rowData[IDX_DEV_CHK]      = false;
    rowData[IDX_VENDA_CHK]    = false;
    rowData[IDX_FRETE_TIPO]   = freteTipo;
    rowData[IDX_FRETE_VALOR]  = freteValor !== '' ? freteValor : '';

    // Monta linha completa em Transferências (29 colunas)
    var rowTransf = rowData.concat([
      params.aba,                       // col 21: Aba Origem
      transportadora,                   // col 22: Transportadora
      dataAgend || '',                  // col 23: Data Agendamento
      'Em Transferência',               // col 24: Status Transf
      usuario,                          // col 25: Resp. Transf
      agora,                            // col 26: Cadastrado em
      '',                               // col 27: Data Baixa
      '',                               // col 28: Comprovante
      String(params.obs || ''),         // col 29: Obs
      String(params.loteId || '')       // col 30: Lote ID
    ]);

    // Adiciona na aba Transferências
    var wsTr = _garantirAbaTransferencias(ss);
    wsTr.appendRow(rowTransf);

    // Limpa a linha de origem (mantém fórmulas e estrutura mas apaga dados)
    ws.getRange(linha, 1, 1, TOTAL_COLUNAS).clearContent();
    ws.getRange(linha, COL_PEND_CHK).setValue(false);
    ws.getRange(linha, COL_DEV_CHK).setValue(false);
    ws.getRange(linha, COL_VENDA_CHK).setValue(false);
    ws.getRange(linha, 1, 1, TOTAL_COLUNAS).setBackground('#FFFFFF');
    // Reaplica fórmulas para manter a estrutura da linha
    ws.getRange(linha, COL_VL_TOT).setFormula(_formulaTotal(linha));
    ws.getRange(linha, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(linha));

    var nfLabel  = nfd ? 'NFD ' + nfd + ' / NF ' + nf : 'NF ' + nf;
    var agendStr = dataAgend ? ' · Agendado: ' + Utilities.formatDate(dataAgend, tz, 'dd/MM/yyyy') : '';
    registrarLog(ss, params.aba, linha, COL_STATUS,
      'Pendente', 'Em Transferência',
      '🚚 Devolução programada — ' + nfLabel + agendStr +
      (transportadora ? ' · Transportadora: ' + transportadora : '') +
      ' — ' + usuario);

    try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
    _atualizarMetricasDashboard(ss);

    return JSON.stringify({ ok: '✅ Devolução programada!\n' + nfLabel + ' · ' + freteTipo +
      (precisaValor ? ' — R$ ' + _fmtVal(freteValor) : '') + agendStr +
      '\n\n📋 Item movido para Transferências.' });
  } finally {
    trava.releaseLock();
  }
}

/**
 * Confirma a baixa de uma transferência: move a linha de volta para a aba de origem
 * com status "Devolvido". O registro em Transferências é marcado como "Concluída".
 * params: { linha, obs, base64, mimeType, nomeArquivo }
 */
function darBaixaTransferencia(params) {
  try {
    var ss   = getSS();
    var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (!wsTr) return JSON.stringify({ erro: 'Aba Transferências não encontrada.' });

    var linhaTransf = Number(params.linha);
    if (!linhaTransf || linhaTransf < 2)
      return JSON.stringify({ erro: 'Linha de transferência inválida.' });

    var rowData = wsTr.getRange(linhaTransf, 1, 1, TRANSF_TOTAL_COL).getValues()[0];
    var stTransf = String(rowData[TRANSF_COL_STATUS - 1] || '').trim();
    if (stTransf !== 'Em Transferência')
      return JSON.stringify({ erro: 'Transferência não está "Em Transferência" (status atual: "' + stTransf + '").' });

    var abaOrigem = String(rowData[TRANSF_COL_ABA_ORIGEM - 1] || '').trim();
    var wsOrig    = ss.getSheetByName(abaOrigem);
    if (!wsOrig) return JSON.stringify({ erro: 'Aba de origem "' + abaOrigem + '" não encontrada.' });

    var usuario = Session.getActiveUser().getEmail() || 'sistema';
    var agora   = new Date();
    var tz      = Session.getScriptTimeZone();

    // Upload do comprovante (CTe / protocolo) se fornecido
    var urlComprovante = '';
    if (params.base64 && params.mimeType && params.nomeArquivo) {
      try {
        var blob = Utilities.newBlob(
          Utilities.base64Decode(params.base64), params.mimeType, params.nomeArquivo
        );
        var arqComp = _pastaAnexos().createFile(blob);
        var nfRef   = String(rowData[IDX_NF] || rowData[IDX_NFD] || 'TR');
        arqComp.setName('Comprovante_' + nfRef + '_' + params.nomeArquivo);
        urlComprovante = arqComp.getUrl();
      } catch (eComp) {
        console.error('darBaixaTransferencia — comprovante: ' + eComp);
      }
    }

    // Monta os 20 cols de dados originais com status "Devolvido"
    var dadosOrig = rowData.slice(0, TOTAL_COLUNAS);
    dadosOrig[IDX_STATUS]    = 'Devolvido';
    dadosOrig[IDX_PEND_CHK]  = false;
    dadosOrig[IDX_DEV_CHK]   = true;
    dadosOrig[IDX_VENDA_CHK] = false;
    var obsDevol = 'Devolvido em: ' + Utilities.formatDate(agora, tz, 'dd/MM/yyyy HH:mm:ss');
    dadosOrig[IDX_OBS]       = obsDevol + (params.obs ? ' | ' + params.obs : '');

    // Encontra próxima linha disponível na aba de origem
    var ulOrig = obterUltimaLinhaDados(wsOrig);
    var destOrig = (ulOrig >= LINHA_DADOS ? ulOrig : LINHA_DADOS - 1) + 1;
    if (destOrig > ULTIMA_LINHA_DADOS)
      return JSON.stringify({ erro: 'Aba "' + abaOrigem + '" está cheia. Faça o arquivamento primeiro.' });

    // Grava na aba de origem
    wsOrig.getRange(destOrig, 1, 1, TOTAL_COLUNAS).setValues([dadosOrig]);
    wsOrig.getRange(destOrig, COL_VL_TOT).setFormula(_formulaTotal(destOrig));
    wsOrig.getRange(destOrig, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(destOrig));
    wsOrig.getRange(destOrig, 1, 1, TOTAL_COLUNAS).setBackground(COR_VERDE);

    // Protege a linha devolvida na aba de origem
    protegerLinhaConcluida(ss, wsOrig, destOrig, 'Devolvido');
    _incrementarContadorConcluidos();

    // Marca transferência como Concluída (mantém para auditoria)
    wsTr.getRange(linhaTransf, TRANSF_COL_STATUS).setValue('Concluída');
    wsTr.getRange(linhaTransf, TRANSF_COL_DATA_BAIXA).setValue(agora);
    if (urlComprovante) wsTr.getRange(linhaTransf, TRANSF_COL_COMPROVANTE).setValue(urlComprovante);
    if (params.obs) wsTr.getRange(linhaTransf, TRANSF_COL_OBS).setValue(params.obs);

    // Baixa em todas as linhas irmãs do mesmo lote
    var loteId = String(rowData[TRANSF_COL_LOTE_ID - 1] || '').trim();
    if (loteId) {
      var ulTr = wsTr.getLastRow();
      if (ulTr >= 2) {
        var todosDados = wsTr.getRange(2, 1, ulTr - 1, TRANSF_TOTAL_COL).getValues();
        for (var ti = 0; ti < todosDados.length; ti++) {
          var lRow  = todosDados[ti];
          var linha2 = ti + 2;
          if (linha2 === linhaTransf) continue;
          var loteId2 = String(lRow[TRANSF_COL_LOTE_ID - 1] || '').trim();
          var st2     = String(lRow[TRANSF_COL_STATUS   - 1] || '').trim();
          if (loteId2 !== loteId || st2 !== 'Em Transferência') continue;

          var abaOrig2 = String(lRow[TRANSF_COL_ABA_ORIGEM - 1] || '').trim();
          var wsOrig2  = ss.getSheetByName(abaOrig2);
          if (!wsOrig2) continue;

          var dadosOrig2 = lRow.slice(0, TOTAL_COLUNAS);
          dadosOrig2[IDX_STATUS]    = 'Devolvido';
          dadosOrig2[IDX_PEND_CHK]  = false;
          dadosOrig2[IDX_DEV_CHK]   = true;
          dadosOrig2[IDX_VENDA_CHK] = false;
          dadosOrig2[IDX_OBS]       = obsDevol + (params.obs ? ' | ' + params.obs : '');

          var ulOrig2 = obterUltimaLinhaDados(wsOrig2);
          var dest2   = (ulOrig2 >= LINHA_DADOS ? ulOrig2 : LINHA_DADOS - 1) + 1;
          if (dest2 > ULTIMA_LINHA_DADOS) continue;

          wsOrig2.getRange(dest2, 1, 1, TOTAL_COLUNAS).setValues([dadosOrig2]);
          wsOrig2.getRange(dest2, COL_VL_TOT).setFormula(_formulaTotal(dest2));
          wsOrig2.getRange(dest2, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(dest2));
          wsOrig2.getRange(dest2, 1, 1, TOTAL_COLUNAS).setBackground(COR_VERDE);
          protegerLinhaConcluida(ss, wsOrig2, dest2, 'Devolvido');
          _incrementarContadorConcluidos();

          wsTr.getRange(linha2, TRANSF_COL_STATUS).setValue('Concluída');
          wsTr.getRange(linha2, TRANSF_COL_DATA_BAIXA).setValue(agora);
          if (urlComprovante) wsTr.getRange(linha2, TRANSF_COL_COMPROVANTE).setValue(urlComprovante);
          if (params.obs) wsTr.getRange(linha2, TRANSF_COL_OBS).setValue(params.obs);
        }
      }
    }

    var nf  = String(rowData[IDX_NF]  || '').trim();
    var nfd = String(rowData[IDX_NFD] || '').trim();
    var nfLabel = nfd ? 'NFD ' + nfd + ' / NF ' + nf : 'NF ' + nf;

    registrarLog(ss, ABA_TRANSFERENCIAS, linhaTransf, TRANSF_COL_STATUS,
      'Em Transferência', 'Concluída',
      '✅ Baixa confirmada — ' + nfLabel + ' → ' + abaOrigem + ' linha ' + destOrig +
      (urlComprovante ? ' + comprovante' : '') + ' — ' + usuario);
    registrarLog(ss, abaOrigem, destOrig, COL_STATUS, 'Em Transferência', 'Devolvido',
      '✅ Item devolvido via Transferências — ' + nfLabel);

    try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
    _atualizarMetricasDashboard(ss);

    return JSON.stringify({ ok: '✅ Baixa confirmada! ' + nfLabel + ' devolvido para ' + abaOrigem + '.' +
      (urlComprovante ? '\n📎 Comprovante salvo.' : '') });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * Cancela uma transferência: move a linha de volta para a aba de origem como "Pendente".
 * O registro em Transferências é mantido como "Cancelada" para auditoria.
 * params: { linha, obs } — obs é obrigatório
 */
function cancelarTransferencia(params) {
  try {
    if (!params || !params.linha) return JSON.stringify({ erro: 'Linha não informada.' });
    var obs = String(params.obs || '').trim();
    if (!obs) return JSON.stringify({ erro: 'Informe o motivo do cancelamento.' });

    var ss   = getSS();
    var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (!wsTr) return JSON.stringify({ erro: 'Aba Transferências não encontrada.' });

    var linhaTransf = Number(params.linha);
    var rowData = wsTr.getRange(linhaTransf, 1, 1, TRANSF_TOTAL_COL).getValues()[0];
    var stTransf = String(rowData[TRANSF_COL_STATUS - 1] || '').trim();
    if (stTransf !== 'Em Transferência')
      return JSON.stringify({ erro: 'Transferência não está "Em Transferência" (status: "' + stTransf + '").' });

    var abaOrigem = String(rowData[TRANSF_COL_ABA_ORIGEM - 1] || '').trim();
    var wsOrig    = ss.getSheetByName(abaOrigem);
    if (!wsOrig) return JSON.stringify({ erro: 'Aba de origem "' + abaOrigem + '" não encontrada.' });

    var usuario = Session.getActiveUser().getEmail() || 'sistema';
    var agora   = new Date();
    var tz      = Session.getScriptTimeZone();

    // Monta linha original com status "Pendente"
    var dadosOrig = rowData.slice(0, TOTAL_COLUNAS);
    dadosOrig[IDX_STATUS]    = 'Pendente';
    dadosOrig[IDX_PEND_CHK]  = true;
    dadosOrig[IDX_DEV_CHK]   = false;
    dadosOrig[IDX_VENDA_CHK] = false;
    var obsCancel = 'Cancelado em: ' + Utilities.formatDate(agora, tz, 'dd/MM/yyyy HH:mm:ss') + ' | ' + obs;
    dadosOrig[IDX_OBS] = obsCancel;

    // Encontra próxima linha disponível na aba de origem
    var ulOrig = obterUltimaLinhaDados(wsOrig);
    var destOrig = (ulOrig >= LINHA_DADOS ? ulOrig : LINHA_DADOS - 1) + 1;
    if (destOrig > ULTIMA_LINHA_DADOS)
      return JSON.stringify({ erro: 'Aba "' + abaOrigem + '" está cheia. Faça o arquivamento primeiro.' });

    // Grava na aba de origem como Pendente
    wsOrig.getRange(destOrig, 1, 1, TOTAL_COLUNAS).setValues([dadosOrig]);
    wsOrig.getRange(destOrig, COL_VL_TOT).setFormula(_formulaTotal(destOrig));
    wsOrig.getRange(destOrig, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(destOrig));
    aplicarCorLinha(wsOrig, destOrig, 'Pendente', dadosOrig[IDX_DATA] instanceof Date ? dadosOrig[IDX_DATA] : null);

    // Mantém o registro em Transferências como Cancelada (auditoria)
    wsTr.getRange(linhaTransf, TRANSF_COL_STATUS).setValue('Cancelada');
    wsTr.getRange(linhaTransf, TRANSF_COL_DATA_BAIXA).setValue(agora);
    wsTr.getRange(linhaTransf, TRANSF_COL_OBS).setValue(obs);

    var nf  = String(rowData[IDX_NF]  || '').trim();
    var nfd = String(rowData[IDX_NFD] || '').trim();
    var nfLabel = nfd ? 'NFD ' + nfd + ' / NF ' + nf : 'NF ' + nf;

    registrarLog(ss, ABA_TRANSFERENCIAS, linhaTransf, TRANSF_COL_STATUS,
      'Em Transferência', 'Cancelada',
      '❌ Cancelamento — ' + nfLabel + ' | Motivo: ' + obs + ' — ' + usuario);
    registrarLog(ss, abaOrigem, destOrig, COL_STATUS, 'Em Transferência', 'Pendente',
      '↩️ Item retornou após cancelamento de transferência — ' + nfLabel);

    try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
    _atualizarMetricasDashboard(ss);

    return JSON.stringify({ ok: '✅ Transferência cancelada. ' + nfLabel + ' retornou como Pendente em ' + abaOrigem + '.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * Reagenda a data de agendamento de uma transferência sem cancelar.
 * params: { linha, dataAgendamento, obs }
 */
function reagendarTransferencia(params) {
  try {
    if (!params || !params.linha) return JSON.stringify({ erro: 'Linha não informada.' });
    var novaData = null;
    try { novaData = new Date(params.dataAgendamento); if (isNaN(novaData.getTime())) novaData = null; } catch(_){}
    if (!novaData) return JSON.stringify({ erro: 'Data de reagendamento inválida.' });

    var ss   = getSS();
    var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (!wsTr) return JSON.stringify({ erro: 'Aba Transferências não encontrada.' });

    var linhaTransf = Number(params.linha);
    var rowData = wsTr.getRange(linhaTransf, 1, 1, TRANSF_TOTAL_COL).getValues()[0];
    var stTransf = String(rowData[TRANSF_COL_STATUS - 1] || '').trim();
    if (stTransf !== 'Em Transferência')
      return JSON.stringify({ erro: 'Só é possível reagendar transferências "Em Transferência".' });

    var tz = Session.getScriptTimeZone();
    var dataAnterior = rowData[TRANSF_COL_DATA_AGEND - 1];
    var dataAntStr   = dataAnterior instanceof Date
      ? Utilities.formatDate(dataAnterior, tz, 'dd/MM/yyyy') : String(dataAnterior || 'não definida');
    var novaDataStr  = Utilities.formatDate(novaData, tz, 'dd/MM/yyyy');

    wsTr.getRange(linhaTransf, TRANSF_COL_DATA_AGEND).setValue(novaData);
    var obsAtual = String(rowData[TRANSF_COL_OBS - 1] || '');
    var obsNova  = (obsAtual ? obsAtual + '\n' : '') +
      'Reagendado em ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm') +
      ': ' + dataAntStr + ' → ' + novaDataStr +
      (params.obs ? ' (' + params.obs + ')' : '');
    wsTr.getRange(linhaTransf, TRANSF_COL_OBS).setValue(obsNova);

    var usuario = Session.getActiveUser().getEmail() || 'sistema';
    var nf  = String(rowData[IDX_NF]  || '').trim();
    var nfd = String(rowData[IDX_NFD] || '').trim();
    var nfLabel = nfd ? 'NFD ' + nfd + ' / NF ' + nf : 'NF ' + nf;
    registrarLog(ss, ABA_TRANSFERENCIAS, linhaTransf, TRANSF_COL_DATA_AGEND,
      dataAntStr, novaDataStr,
      '📅 Reagendamento — ' + nfLabel + ': ' + dataAntStr + ' → ' + novaDataStr + ' — ' + usuario);

    return JSON.stringify({ ok: '✅ Reagendado! ' + nfLabel + ' · Nova data: ' + novaDataStr });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterTransferencias(filtros) {
  try {
    var ss   = getSS();
    var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (!wsTr) return JSON.stringify({ itens: [] });
    var ul = wsTr.getLastRow();
    if (ul < 2) return JSON.stringify({ itens: [] });
    var dados = wsTr.getRange(2, 1, ul - 1, TRANSF_TOTAL_COL).getValues();
    var filtStatus = (filtros && filtros.status) || '';
    var tz   = Session.getScriptTimeZone();
    var hoje = new Date();
    var itens = dados.map(function(l, i) {
      var nf  = String(l[IDX_NF]  || '').trim();
      if (!nf) return null;
      var abaOrigem      = String(l[TRANSF_COL_ABA_ORIGEM     - 1] || '').trim();
      var numeroPedido   = String(l[TRANSF_COL_TRANSPORTADORA  - 1] || '').trim();
      var dataAgend      = l[TRANSF_COL_DATA_AGEND    - 1];
      var stTransf       = String(l[TRANSF_COL_STATUS          - 1] || '').trim();
      var respTransf     = String(l[TRANSF_COL_RESP             - 1] || '').trim();
      var dataCad        = l[TRANSF_COL_DATA_CAD      - 1];
      var dataBaixa      = l[TRANSF_COL_DATA_BAIXA    - 1];
      var comprovante    = String(l[TRANSF_COL_COMPROVANTE      - 1] || '').trim();
      var obsCancel      = String(l[TRANSF_COL_OBS              - 1] || '').trim();
      var diasAteFrete   = (dataAgend instanceof Date && !isNaN(dataAgend))
        ? Math.ceil((dataAgend - hoje) / 864e5) : null;
      var diasEmTransf   = (dataCad instanceof Date && !isNaN(dataCad))
        ? Math.floor((hoje - dataCad) / 864e5) : 0;
      return {
        linha:          i + 2,
        nfd:            String(l[IDX_NFD]  || '').trim(),
        nf:             nf,
        data:           l[IDX_DATA] instanceof Date ? Utilities.formatDate(l[IDX_DATA], tz, 'dd/MM/yyyy') : '',
        forn:           String(l[IDX_FORN] || '').trim(),
        tipo:           String(l[IDX_TIPO] || '').trim(),
        desc:           String(l[IDX_DESC] || '').trim().substring(0, 60),
        qtd:            parseFloat(l[IDX_QTD] || 0) || 0,
        vlTot:          parseFloat(l[IDX_VL_TOT] || 0) || 0,
        freteTipo:      String(l[IDX_FRETE_TIPO]   || '').trim(),
        freteValor:     parseFloat(l[IDX_FRETE_VALOR] || 0) || 0,
        abaOrigem:      abaOrigem,
        numeroPedido:   numeroPedido,
        dataAgend:      dataAgend instanceof Date ? Utilities.formatDate(dataAgend, tz, 'dd/MM/yyyy') : String(dataAgend || ''),
        diasAteFrete:   diasAteFrete,
        stTransf:       stTransf,
        respTransf:     respTransf,
        dataCad:        dataCad instanceof Date ? Utilities.formatDate(dataCad, tz, 'dd/MM/yyyy HH:mm') : '',
        dataBaixa:      dataBaixa instanceof Date ? Utilities.formatDate(dataBaixa, tz, 'dd/MM/yyyy') : '',
        comprovante:    comprovante,
        obsCancel:      obsCancel,
        diasEmTransf:   diasEmTransf,
        atrasado:       dataAgend instanceof Date && dataAgend < hoje && stTransf === 'Em Transferência',
        loteId:         String(l[TRANSF_COL_LOTE_ID - 1] || '').trim()
      };
    }).filter(function(it) {
      return it && it.nf && (!filtStatus || it.stTransf === filtStatus);
    });
    itens.sort(function(a, b) {
      if (a.stTransf !== b.stTransf) return a.stTransf === 'Em Transferência' ? -1 : 1;
      return 0;
    });
    return JSON.stringify({ itens: itens });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ════════════════════════════════════════════════════════════
//   NOTAS LANÇADAS — Tabela do WebApp
// ════════════════════════════════════════════════════════════

function obterNotasParaTabela(filtros) {
  try {
    var ss           = getSS();
    var filtStatus   = (filtros && filtros.status)   || '';
    var filtAba      = (filtros && filtros.aba)      || '';
    var filtDtIni    = _parseDateStr(filtros && filtros.dataIni);
    var filtDtFim    = _parseDateStr(filtros && filtros.dataFim, true);
    var filtSemFrete = !!(filtros && filtros.semFrete);
    var nfsComEmail  = {};
    var wsEmail = ss.getSheetByName('_EmailsEnviados');
    if (wsEmail) {
      var ulE = wsEmail.getLastRow();
      if (ulE >= 2) wsEmail.getRange(2,1,ulE-1,5).getValues().forEach(function(r){
        var d = r[0];
        String(r[4]||'').split(/[,\n;]/).forEach(function(n){
          n = n.trim();
          if (n) nfsComEmail[n] = d instanceof Date ? d.toISOString() : String(d);
        });
      });
    }
    var hoje = new Date(), tz = Session.getScriptTimeZone(), resultado = [];
    var abas = filtAba ? [filtAba] : _getTodasAbas();
    abas.forEach(function(nomeAba) {
      var ws = ss.getSheetByName(nomeAba);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS,1,ul-LINHA_DADOS+1,TOTAL_COLUNAS).getValues().forEach(function(l,i){
        var nf = String(l[IDX_NF]||'').trim();
        if (!nf) return;
        var nfd=String(l[IDX_NFD]||'').trim(), dt=l[IDX_DATA];
        var forn=String(l[IDX_FORN]||'').trim(), tipo=String(l[IDX_TIPO]||'').trim();
        var motivo=String(l[IDX_MOTIVO]||'').trim(), desc=String(l[IDX_DESC]||'').trim();
        var qtd=parseFloat(l[IDX_QTD]||0)||0, vlUnit=parseFloat(l[IDX_VL_UNIT]||0)||0;
        var vlTot=parseFloat(l[IDX_VL_TOT]||0)||0, status=String(l[IDX_STATUS]||'').trim();
        var obs=String(l[IDX_OBS]||'').trim(), resp=String(l[IDX_RESP]||'').trim();
        var anexo=String(l[IDX_ANEXO]||'').trim();
        var freteTipo=String(l[IDX_FRETE_TIPO]||'').trim();
        var freteValor=parseFloat(l[IDX_FRETE_VALOR]||0)||0;
        var diasArm=0;
        if (dt instanceof Date && !isNaN(dt)) diasArm=Math.floor((hoje-dt)/864e5);
        if (filtStatus && status !== filtStatus) return;
        if (filtDtIni && (!(dt instanceof Date)||dt<filtDtIni)) return;
        if (filtDtFim && (!(dt instanceof Date)||dt>filtDtFim)) return;
        if (filtSemFrete && freteTipo) return;
        var emailData = nfsComEmail[nfd] || nfsComEmail[nf] || '';
        resultado.push({
          nfd:nfd, nf:nf,
          data:dt instanceof Date ? Utilities.formatDate(dt,tz,'dd/MM/yyyy') : '',
          forn:forn, tipo:tipo, motivo:motivo, desc:desc.substring(0,80),
          qtd:qtd, vlUnit:vlUnit, vlTot:vlTot, status:status,
          obs:obs, resp:resp, temAnexo:!!anexo, freteTipo:freteTipo, freteValor:freteValor,
          diasArm:diasArm, aba:nomeAba, linha:LINHA_DADOS+i,
          emailEnviado:!!emailData, emailData:emailData,
          alerta:status==='Pendente'&&diasArm>30
        });
      });
    });

    // Inclui itens da aba Transferências como "Em Transferência" (quando não filtrar por aba específica)
    if (!filtAba || filtAba === ABA_TRANSFERENCIAS) {
      var wsTrN = ss.getSheetByName(ABA_TRANSFERENCIAS);
      if (wsTrN && wsTrN.getLastRow() >= 2) {
        wsTrN.getRange(2, 1, wsTrN.getLastRow() - 1, TRANSF_TOTAL_COL).getValues()
          .forEach(function(l, i) {
            var nf  = String(l[IDX_NF]  || '').trim();
            if (!nf) return;
            var stTr = String(l[TRANSF_COL_STATUS - 1] || '').trim();
            if (stTr !== 'Em Transferência') return;
            if (filtStatus && filtStatus !== 'Em Transferência') return;
            var nfd  = String(l[IDX_NFD]  || '').trim();
            var dt   = l[IDX_DATA];
            var diasArm = dt instanceof Date ? Math.floor((hoje - dt) / 864e5) : 0;
            if (filtDtIni && (!(dt instanceof Date) || dt < filtDtIni)) return;
            if (filtDtFim && (!(dt instanceof Date) || dt > filtDtFim)) return;
            var emailData = nfsComEmail[nfd] || nfsComEmail[nf] || '';
            resultado.push({
              nfd:    nfd,
              nf:     nf,
              data:   dt instanceof Date ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
              forn:   String(l[IDX_FORN]  || '').trim(),
              tipo:   String(l[IDX_TIPO]  || '').trim(),
              motivo: String(l[IDX_MOTIVO]|| '').trim(),
              desc:   String(l[IDX_DESC]  || '').trim().substring(0, 80),
              qtd:    parseFloat(l[IDX_QTD] || 0) || 0,
              vlUnit: parseFloat(l[IDX_VL_UNIT] || 0) || 0,
              vlTot:  parseFloat(l[IDX_VL_TOT]  || 0) || 0,
              status: 'Em Transferência',
              obs:    String(l[IDX_OBS]   || '').trim(),
              resp:   String(l[TRANSF_COL_RESP - 1] || '').trim(),
              temAnexo: false,
              freteTipo:  String(l[IDX_FRETE_TIPO]   || '').trim(),
              freteValor: parseFloat(l[IDX_FRETE_VALOR] || 0) || 0,
              diasArm:    diasArm,
              aba:    ABA_TRANSFERENCIAS,
              linha:  i + 2,
              emailEnviado: !!emailData, emailData: emailData,
              alerta: false,
              transportadora: String(l[TRANSF_COL_TRANSPORTADORA - 1] || '').trim(),
              dataAgend: (function(da) {
                return da instanceof Date ? Utilities.formatDate(da, tz, 'dd/MM/yyyy') : '';
              })(l[TRANSF_COL_DATA_AGEND - 1])
            });
          });
      }
    }

    resultado.sort(function(a,b){return b.diasArm-a.diasArm;});
    var limite = (filtros && filtros.limite) ? parseInt(filtros.limite) : 0;
    var temMais = limite > 0 && resultado.length > limite;
    var itens = temMais ? resultado.slice(0, limite) : resultado;
    return JSON.stringify({ itens: itens, abas: _getTodasAbas(), temMais: temMais });
  } catch(e){ return JSON.stringify({ erro: e.toString() }); }
}

/**
 * Retorna métricas consolidadas para o dashboard da web app.
 * Inclui contagens por status, alertas e itens recentes.
 */
function verificarSaudeSistema() {
  try {
    var ss    = getSS();
    var tz    = Session.getScriptTimeZone();
    var abas  = _getTodasAbas();
    var checks = [];
    var status = 'ok';

    // Abas de dados
    var abasOk = abas.filter(function(n){ return !!ss.getSheetByName(n); }).length;
    checks.push({ label: 'Abas de dados', ok: abasOk === abas.length,
                  valor: abasOk + '/' + abas.length });

    // Total de NFs ativas
    var totalNFs = 0;
    abas.forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul >= LINHA_DADOS) totalNFs += ul - LINHA_DADOS + 1;
    });
    checks.push({ label: 'NFs ativas', ok: true, valor: totalNFs + ' registros' });

    // Aba _Log
    var wsLog  = ss.getSheetByName('_Log');
    var logOk  = !!wsLog;
    checks.push({ label: 'Log', ok: logOk, valor: logOk ? 'OK' : 'Ausente' });

    // Anexos expirados (Pendente + anexo + > 90 dias)
    var expirados = 0;
    var hoje = new Date(); hoje.setHours(0,0,0,0);
    var limiteMs = 90 * 24 * 3600000;
    abas.forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues().forEach(function(r) {
        if (String(r[IDX_STATUS]||'') !== 'Pendente') return;
        if (!r[IDX_ANEXO]) return;
        var dt = r[IDX_DATA]; if (!(dt instanceof Date)) return;
        if ((hoje - dt) > limiteMs) expirados++;
      });
    });
    if (expirados > 0) {
      checks.push({ label: 'Anexos sem resolução +90d', ok: false, valor: expirados + ' NF(s)' });
      if (status === 'ok') status = 'warn';
    }

    // Ocupação das abas (alerta quando ≥ 80% de MAX_LINHAS_ABA)
    var abasAlerta = [];
    abas.forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      var usadas = Math.max(0, ul - LINHA_DADOS + 1);
      var pct = Math.round((usadas / MAX_LINHAS_ABA) * 100);
      if (pct >= 80) abasAlerta.push(nome + ' ' + pct + '%');
    });
    if (abasAlerta.length > 0) {
      checks.push({ label: 'Capacidade das abas', ok: false,
                    valor: abasAlerta.join(', ') + ' — faça arquivamento' });
      if (status === 'ok') status = 'warn';
    } else {
      checks.push({ label: 'Capacidade das abas', ok: true, valor: '< 80%' });
    }

    // Status geral
    if (checks.some(function(c){ return !c.ok; })) status = 'warn';

    var agora = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    return JSON.stringify({ status: status, checks: checks, ts: agora });
  } catch(e) {
    return JSON.stringify({ status: 'err', checks: [], ts: '', erro: e.toString() });
  }
}

// ── Lixeira com recuperação ────────────────────────────────
var _NOME_ABA_LIXEIRA = 'Lixeira';

function _moverParaLixeira(ss, ws, item, motivo) {
  try {
    var lixeira = ss.getSheetByName(_NOME_ABA_LIXEIRA);
    if (!lixeira) {
      lixeira = ss.insertSheet(_NOME_ABA_LIXEIRA);
      lixeira.appendRow(['DataExclusão','Motivo','AbaOrigem','LinhaOrigem',
        'Data','NFD','NF','Fornecedor','Status','Tipo','Motivo','Desc','Qtd','VlUnit','Obs','Resp','UrlAnexo']);
    }
    var rowData = ws.getRange(item.linha, 1, 1, Math.max(TOTAL_COLUNAS,17)).getValues()[0];
    var novaLinha = [new Date(), motivo, item.aba, item.linha].concat(rowData);
    lixeira.appendRow(novaLinha);
  } catch(e) { console.warn('_moverParaLixeira: ' + e); }
}

function obterLixeira() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var lixeira = ss.getSheetByName(_NOME_ABA_LIXEIRA);
    if (!lixeira || lixeira.getLastRow() < 2) return JSON.stringify({ itens: [] });
    var ult = lixeira.getLastRow();
    var dados = lixeira.getRange(2, 1, ult - 1, 5).getValues();
    var itens = dados.map(function(row, i) {
      return {
        lixRow: i + 2,
        dataExclusao: row[0] ? new Date(row[0]).toLocaleString('pt-BR') : '',
        motivo: String(row[1]||''),
        abaOrigem: String(row[2]||''),
        linhaOrigem: row[3],
        nf: String(row[6]||''),
        nfd: String(row[5]||'')
      };
    });
    return JSON.stringify({ itens: itens });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function restaurarDaLixeira(lixRow) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var lixeira = ss.getSheetByName(_NOME_ABA_LIXEIRA);
    if (!lixeira) return JSON.stringify({ erro: 'Lixeira não encontrada.' });
    var rowData = lixeira.getRange(lixRow, 1, 1, 4).getValues()[0];
    var abaOrigem = String(rowData[2]||'');
    var ws = ss.getSheetByName(abaOrigem);
    if (!ws) return JSON.stringify({ erro: 'Aba "' + abaOrigem + '" não encontrada.' });
    var dadosNF = lixeira.getRange(lixRow, 5, 1, Math.max(TOTAL_COLUNAS,17)).getValues()[0];
    // Encontrar uma linha vazia na aba
    var ult = obterUltimaLinhaDados(ws);
    var novaLinha = ult + 1;
    ws.getRange(novaLinha, 1, 1, dadosNF.length).setValues([dadosNF]);
    lixeira.deleteRow(lixRow);
    registrarLog(ss, abaOrigem, novaLinha, 3, '', dadosNF[2] || '', '♻️ Restaurado da lixeira.');
    return JSON.stringify({ ok: '✅ Item restaurado para aba "' + abaOrigem + '".' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Versionamento de anexos (item 59) ──────────────────────
var _KEY_VERSOES_ANEXO = 'cdv_versoes_anexo'; // JSON: { "aba_linha": [{ ts, url }] }

function _registrarVersaoAnexo(aba, linha, url) {
  try {
    var raw  = PropertiesService.getScriptProperties().getProperty(_KEY_VERSOES_ANEXO) || '{}';
    var map  = JSON.parse(raw);
    var chave = aba + '_' + linha;
    if (!map[chave]) map[chave] = [];
    map[chave].push({ ts: new Date().toISOString(), url: url });
    map[chave] = map[chave].slice(-5); // manter últimas 5 versões
    PropertiesService.getScriptProperties().setProperty(_KEY_VERSOES_ANEXO, JSON.stringify(map));
  } catch(_){}
}

function obterVersoesAnexo(aba, linha) {
  var raw  = PropertiesService.getScriptProperties().getProperty(_KEY_VERSOES_ANEXO) || '{}';
  try {
    var map   = JSON.parse(raw);
    var chave = aba + '_' + linha;
    return JSON.stringify({ versoes: map[chave] || [] });
  } catch(_) { return JSON.stringify({ versoes: [] }); }
}

function salvarAnexoAdicionalNF(params) {
  if (!params || !params.aba || !params.linha || !params.urlAnexo)
    return JSON.stringify({ erro: 'Dados insuficientes.' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getSheetByName(params.aba);
    if (!ws) return JSON.stringify({ erro: 'Aba não encontrada.' });
    _registrarVersaoAnexo(params.aba, params.linha, params.urlAnexo);
    ws.getRange(params.linha, COL_ANEXO).setValue(params.urlAnexo);
    return JSON.stringify({ ok: '✅ Anexo(s) atualizados.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * Retorna todos os arquivos (fotos + documentos) da pasta Drive associada a uma NF.
 * Inclui o anexo principal (COL_ANEXO) e todos os uploads de avaria na subpasta.
 * params: { aba, linha, nf }
 */
function obterGaleriaFotos(params) {
  try {
    var ss = getSS();
    var ws = ss.getSheetByName(params.aba);
    if (!ws) return JSON.stringify({ fotos: [] });
    var l = ws.getRange(Number(params.linha), 1, 1, TOTAL_COLUNAS).getValues()[0];
    var nf  = String(l[IDX_NF]  || params.nf || '').trim();
    var nfd = String(l[IDX_NFD] || '').trim();
    var anexoPrincipal = String(l[IDX_ANEXO] || '').trim();
    var fotos = [];
    if (anexoPrincipal) {
      var idMatch = anexoPrincipal.match(/\/d\/([^\/\?]+)/);
      var fileId = idMatch ? idMatch[1] : null;
      fotos.push({
        nome: 'Anexo da NF (' + (nfd||nf) + ')',
        url:  anexoPrincipal,
        id:   fileId || '',
        tipo: 'principal'
      });
    }
    try {
      var pasta = _garantirPastaNF(params.aba, nf);
      if (pasta) {
        var iter = pasta.getFiles();
        while (iter.hasNext()) {
          var f = iter.next();
          fotos.push({
            nome: f.getName(),
            url:  f.getUrl(),
            id:   f.getId(),
            mime: f.getMimeType(),
            tipo: 'avaria'
          });
        }
      }
    } catch(_) {}
    return JSON.stringify({ fotos: fotos });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function uploadFotoAvaria(params) {
  try {
    var pasta = _garantirPastaNF(params.aba || 'Avaria', params.nf || 'NF');
    var dados = Utilities.base64Decode(params.base64);
    var nomeArq = (params.nome || 'avaria.jpg');
    // Prefixo FOTO_ garante que o filtro do enviarEmailDevolucao inclua estas fotos
    if (nomeArq.indexOf('FOTO_') !== 0) nomeArq = 'FOTO_' + nomeArq;
    var blob  = Utilities.newBlob(dados, params.mimeType || 'image/jpeg', nomeArq);
    var file  = (pasta || DriveApp.getRootFolder()).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return JSON.stringify({ url: file.getUrl(), id: file.getId() });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterComparativoPeriodos(aDe, aAte, bDe, bAte) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    function parseDt(s){ var p=s.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
    var aI=parseDt(aDe), aF=parseDt(aAte), bI=parseDt(bDe), bF=parseDt(bAte);
    aF.setHours(23,59,59); bF.setHours(23,59,59);
    function _agreg(de, ate) {
      var qtd=0, valor=0, pendentes=0, devolvidos=0, forns={}, motivos={};
      _getTodasAbas().forEach(function(nome) {
        var aba = ss.getSheetByName(nome);
        if (!aba) return;
        var ult = obterUltimaLinhaDados(aba);
        if (ult < 2) return;
        var vals = aba.getRange(2,1,ult-1,12).getValues();
        vals.forEach(function(row) {
          var dt = row[0] ? new Date(row[0]) : null;
          if (!dt || dt < de || dt > ate) return;
          qtd++;
          valor += Number(row[9]||0) * Number(row[8]||0);
          var status = String(row[3]||'');
          if (status === 'Pendente') pendentes++;
          if (status === 'Devolvido') devolvidos++;
          var forn = String(row[4]||'').trim();
          if (forn) forns[forn] = true;
          var m = String(row[7]||'').trim();
          if (m) motivos[m] = (motivos[m]||0)+1;
        });
      });
      return { qtd:qtd, valor:valor, pendentes:pendentes, devolvidos:devolvidos,
               fornecedores:Object.keys(forns).length, motivos:motivos };
    }
    var a = _agreg(aI,aF), b = _agreg(bI,bF);
    var todasMotivos = {};
    Object.keys(a.motivos).forEach(function(k){ todasMotivos[k]=true; });
    Object.keys(b.motivos).forEach(function(k){ todasMotivos[k]=true; });
    var topMotivos = Object.keys(todasMotivos).map(function(m){
      return { motivo:m, qtdA:a.motivos[m]||0, qtdB:b.motivos[m]||0 };
    }).sort(function(x,y){ return (y.qtdA+y.qtdB)-(x.qtdA+x.qtdB); }).slice(0,10);
    return JSON.stringify({ a:a, b:b, topMotivos:topMotivos });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterMotivosFrequentes() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var contagem = {};
    _getTodasAbas().forEach(function(nome) {
      var aba = ss.getSheetByName(nome);
      if (!aba) return;
      var ult = obterUltimaLinhaDados(aba);
      if (ult < 2) return;
      var vals = aba.getRange(2, 8, ult - 1, 1).getValues(); // coluna H = motivo
      vals.forEach(function(row) {
        var m = String(row[0]||'').trim().toUpperCase();
        if (m) contagem[m] = (contagem[m]||0) + 1;
      });
    });
    var sorted = Object.keys(contagem).sort(function(a,b){ return contagem[b]-contagem[a]; }).slice(0,20);
    return JSON.stringify(sorted);
  } catch(e) { return JSON.stringify([]); }
}

function obterScorecardFornecedores(filtroStatus) {
  try {
    var ss = getSS();
    var abas = _getTodasAbas();
    var mapa = {}; // { forn: { qtd, valor, motivos:{} } }
    abas.forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues().forEach(function(r) {
        var status = String(r[IDX_STATUS]||'');
        if (filtroStatus && status !== filtroStatus) return;
        var forn   = String(r[IDX_FORN]||nome).trim();
        var valor  = parseFloat(r[IDX_VL_TOT]||0)||0;
        var motivo = String(r[IDX_MOTIVO]||'').trim();
        if (!mapa[forn]) mapa[forn] = { forn:forn, qtd:0, valor:0, motivosMap:{} };
        mapa[forn].qtd++;
        mapa[forn].valor += valor;
        if (motivo) mapa[forn].motivosMap[motivo] = (mapa[forn].motivosMap[motivo]||0)+1;
      });
    });
    var lista = Object.keys(mapa).map(function(k) {
      var e = mapa[k];
      var motivos = Object.keys(e.motivosMap).sort(function(a,b){ return e.motivosMap[b]-e.motivosMap[a]; });
      return { forn:e.forn, qtd:e.qtd, valor:e.valor, motivos:motivos };
    }).sort(function(a,b){ return b.qtd - a.qtd; }).slice(0,30);
    return JSON.stringify({ fornecedores: lista });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * [P57] SLA por fornecedor — tempo médio (dias) entre entrada e resolução (Devolvido/Venda).
 * Cruza as datas de entrada das abas operacionais com os eventos do _Log.
 */
function obterSLAFornecedores() {
  try {
    var ss  = getSS();
    var tz  = Session.getScriptTimeZone();
    // Monta mapa { aba: { rowNum: { dt, forn } } }
    var entryMap = {};
    _getTodasAbas().forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      entryMap[nome] = {};
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
        .forEach(function(r, i) {
          var nf   = String(r[IDX_NF]  || '').trim();
          var forn = String(r[IDX_FORN] || '').trim();
          var dt   = r[IDX_DATA];
          if (nf && forn && dt instanceof Date) {
            entryMap[nome][LINHA_DADOS + i] = { dt: dt, forn: forn };
          }
        });
    });
    // Lê _Log: colunas [0]=Data/Hora [2]=Aba [3]=Linha [6]=Novo Valor
    var wsLog = ss.getSheetByName('_Log');
    var sla = {}; // { forn: { totalDias, count } }
    if (wsLog && wsLog.getLastRow() >= 2) {
      wsLog.getRange(2, 1, wsLog.getLastRow() - 1, 8).getValues()
        .forEach(function(r) {
          var dtRes   = r[0];
          var aba     = String(r[2] || '').trim();
          var rowNum  = parseInt(r[3]) || 0;
          var novoVal = String(r[6] || '').trim();
          if (novoVal !== 'Devolvido' && novoVal !== 'Venda') return;
          if (!(dtRes instanceof Date) || !rowNum) return;
          var entry = entryMap[aba] && entryMap[aba][rowNum];
          if (!entry) return;
          var dias = Math.max(0, Math.round((dtRes - entry.dt) / 864e5));
          if (!sla[entry.forn]) sla[entry.forn] = { totalDias: 0, count: 0 };
          sla[entry.forn].totalDias += dias;
          sla[entry.forn].count++;
        });
    }
    var lista = Object.keys(sla).map(function(f) {
      var e = sla[f];
      return { forn: f, mediaDias: Math.round(e.totalDias / e.count), totalResolvidos: e.count };
    }).sort(function(a, b) { return a.mediaDias - b.mediaDias; });
    return JSON.stringify({ sla: lista });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * [P58] Exporta trilha de auditoria do _Log como CSV (retorna string para o cliente fazer download).
 */
function exportarLogAuditoriaCSV(limite) {
  try {
    var ss    = getSS();
    var wsLog = ss.getSheetByName('_Log');
    if (!wsLog || wsLog.getLastRow() < 2) return JSON.stringify({ erro: 'Log de auditoria vazio.' });
    var n   = Math.min(parseInt(limite, 10) || 1000, 5000);
    var ul  = wsLog.getLastRow();
    var ini = Math.max(2, ul - n + 1);
    var rows = wsLog.getRange(ini, 1, ul - ini + 1, 8).getValues();
    var tz  = Session.getScriptTimeZone();
    var cabecalho = 'Data/Hora;Usuário;Aba;Linha;Coluna;Valor Anterior;Novo Valor;Ação';
    var linhas = rows.map(function(r) {
      return r.map(function(c) {
        var s = c instanceof Date
          ? Utilities.formatDate(c, tz, 'dd/MM/yyyy HH:mm:ss')
          : String(c == null ? '' : c).replace(/"/g, '""');
        return /[;\n"']/.test(s) ? '"' + s + '"' : s;
      }).join(';');
    });
    var csv = '﻿' + cabecalho + '\r\n' + linhas.join('\r\n');
    return JSON.stringify({ csv: csv, total: rows.length });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterDadosDashboard(deStr, ateStr) {
  try {
    var de  = deStr  ? new Date(deStr  + 'T00:00:00') : null;
    var ate = ateStr ? new Date(ateStr + 'T23:59:59') : null;
    if (de && isNaN(de.getTime()))  de  = null;
    if (ate && isNaN(ate.getTime())) ate = null;
    var temFiltro = !!(de || ate);
    function dentroPeriodo(dt) {
      if (!temFiltro) return true;
      if (!(dt instanceof Date)) return false;
      if (de  && dt < de)  return false;
      if (ate && dt > ate) return false;
      return true;
    }
    var cache = CacheService.getScriptCache();
    if (!temFiltro) { try { var hit = cache.get('cdv_dash_payload'); if (hit) return hit; } catch(_) {} }
    var ss  = getSS();
    var tz  = Session.getScriptTimeZone();
    var hoje = new Date();
    var counts = { Pendente: 0, EmTransferencia: 0, Devolvido: 0, Venda: 0 };
    var valores = { Pendente: 0, EmTransferencia: 0, Devolvido: 0, Venda: 0 };
    var atrasos30 = 0;
    var porFornecedor = {};

    // Contagem nas abas operacionais
    _getTodasAbas().forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
        .forEach(function(l) {
          var nf = String(l[IDX_NF] || '').trim();
          if (!nf) return;
          var st   = String(l[IDX_STATUS] || '').trim();
          var val  = parseFloat(l[IDX_VL_TOT] || 0) || 0;
          var forn = String(l[IDX_FORN] || '').trim();
          var dt   = l[IDX_DATA];
          if (!dentroPeriodo(dt)) return;
          var dias = dt instanceof Date ? Math.floor((hoje - dt) / 864e5) : 0;
          if      (st === 'Pendente')  { counts.Pendente++;  valores.Pendente  += val; if (dias > 30) atrasos30++; }
          else if (st === 'Devolvido') { counts.Devolvido++; valores.Devolvido += val; }
          else if (st === 'Venda')     { counts.Venda++;     valores.Venda     += val; }
          if (forn) {
            if (!porFornecedor[forn]) porFornecedor[forn] = {Pendente:0,Devolvido:0,Venda:0,EmTransferencia:0,atrasos:0,vlTot:0,vlPendente:0,vlDevolvido:0,vlVenda:0,vlTransf:0};
            if (st === 'Pendente' || st === 'Devolvido' || st === 'Venda') porFornecedor[forn][st]++;
            if (st === 'Pendente' && dias > 30) porFornecedor[forn].atrasos++;
            porFornecedor[forn].vlTot += val;
            if      (st === 'Pendente')  porFornecedor[forn].vlPendente  += val;
            else if (st === 'Devolvido') porFornecedor[forn].vlDevolvido += val;
            else if (st === 'Venda')     porFornecedor[forn].vlVenda     += val;
          }
        });
    });

    // Contagem de Em Transferência + transferências vencidas (leitura única reutilizada abaixo)
    var transfVencidas = 0;
    var transfRows = [];
    var wsTrD = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (wsTrD && wsTrD.getLastRow() >= 2) {
      transfRows = wsTrD.getRange(2, 1, wsTrD.getLastRow() - 1, TRANSF_TOTAL_COL).getValues();
      transfRows.forEach(function(l) {
        var stTr = String(l[TRANSF_COL_STATUS - 1] || '').trim();
        if (stTr !== 'Em Transferência') return;
        if (!dentroPeriodo(l[IDX_DATA])) return;
        var val  = parseFloat(l[IDX_VL_TOT] || 0) || 0;
        counts.EmTransferencia++;
        valores.EmTransferencia += val;
        var agend = l[TRANSF_COL_DATA_AGEND - 1];
        if (agend instanceof Date && agend < hoje) transfVencidas++;
      });
    }

    // Últimas 10 notas lançadas (mais recentes por data de entrada)
    var recentes = [];
    _getTodasAbas().forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
        .forEach(function(l, i) {
          var nf = String(l[IDX_NF] || '').trim();
          if (!nf) return;
          if (!dentroPeriodo(l[IDX_DATA])) return;
          recentes.push({
            nf:     nf,
            nfd:    String(l[IDX_NFD]  || '').trim(),
            forn:   String(l[IDX_FORN] || '').trim(),
            desc:   String(l[IDX_DESC] || '').trim(),
            qtd:    parseFloat(l[IDX_QTD]  || 0) || 0,
            status: String(l[IDX_STATUS]||'').trim(),
            vlTot:  parseFloat(l[IDX_VL_TOT] || 0) || 0,
            data:   l[IDX_DATA] instanceof Date ? Utilities.formatDate(l[IDX_DATA], tz, 'dd/MM/yyyy') : '',
            _dt:    l[IDX_DATA] instanceof Date ? l[IDX_DATA].getTime() : 0,
            aba:    nome
          });
        });
    });
    recentes.sort(function(a, b) { return b._dt - a._dt; });
    recentes = recentes.slice(0, 10);
    recentes.forEach(function(r) { delete r._dt; });

    // Adiciona EmTransferência ao porFornecedor (reutiliza transfRows, sem segunda leitura)
    transfRows.forEach(function(l) {
      var stTr = String(l[TRANSF_COL_STATUS - 1] || '').trim();
      if (stTr !== 'Em Transferência') return;
      if (!dentroPeriodo(l[IDX_DATA])) return;
      var fTr = String(l[IDX_FORN] || '').trim();
      if (!fTr) return;
      if (!porFornecedor[fTr]) porFornecedor[fTr] = {Pendente:0,Devolvido:0,Venda:0,EmTransferencia:0,atrasos:0,vlTot:0,vlPendente:0,vlDevolvido:0,vlVenda:0,vlTransf:0};
      var valTr = parseFloat(l[IDX_VL_TOT] || 0) || 0;
      porFornecedor[fTr].EmTransferencia++;
      porFornecedor[fTr].vlTransf  += valTr;
      porFornecedor[fTr].vlTot     += valTr;
    });
    var fornArr = Object.keys(porFornecedor).map(function(k) {
      var f = porFornecedor[k];
      return { forn:k, Pendente:f.Pendente, EmTransferencia:f.EmTransferencia,
               Devolvido:f.Devolvido, Venda:f.Venda, atrasos:f.atrasos, vlTot:f.vlTot,
               vlPendente:f.vlPendente, vlDevolvido:f.vlDevolvido, vlVenda:f.vlVenda, vlTransf:f.vlTransf,
               total: f.Pendente + f.EmTransferencia + f.Devolvido + f.Venda };
    }).sort(function(a, b) { return b.total - a.total; });

    var payload = JSON.stringify({
      counts:          counts,
      valores:         valores,
      atrasos30:       atrasos30,
      transfVencidas:  transfVencidas,
      recentes:        recentes,
      porFornecedor:   fornArr
    });
    if (!temFiltro) { try { cache.put('cdv_dash_payload', payload, 45); } catch(_) {} }
    return payload;
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * Busca tudo que está dentro de um período de datas, em todas as origens:
 * abas ativas (Pendente/Devolvido/Venda), Transferências e Historico_Arquivo.
 * @param {string} deStr  'yyyy-MM-dd' ou vazio
 * @param {string} ateStr 'yyyy-MM-dd' ou vazio
 */
function buscarPorPeriodoDashboard(deStr, ateStr) {
  try {
    var ss = getSS();
    var tz = Session.getScriptTimeZone();
    var de  = deStr  ? new Date(deStr  + 'T00:00:00') : null;
    var ate = ateStr ? new Date(ateStr + 'T23:59:59') : null;
    if (de && isNaN(de.getTime()))  de  = null;
    if (ate && isNaN(ate.getTime())) ate = null;
    if (!de && !ate) return JSON.stringify({ erro: 'Informe pelo menos uma data.' });

    var itens = [];
    var resumo = { Pendente:0, Devolvido:0, Venda:0, 'Em Transferência':0, Arquivado:0 };

    function dentro(dt) {
      if (!(dt instanceof Date)) return false;
      if (de  && dt < de)  return false;
      if (ate && dt > ate) return false;
      return true;
    }
    function push(l, origem, status, aba, contarComo) {
      var nf = String(l[IDX_NF] || '').trim(), nfd = String(l[IDX_NFD] || '').trim();
      if (!nf && !nfd) return;
      var dt = l[IDX_DATA];
      if (!dentro(dt)) return;
      var chave = contarComo || status;
      itens.push({
        origem: origem,
        aba:    aba,
        nf:     nf,
        nfd:    nfd,
        forn:   String(l[IDX_FORN] || '').trim(),
        desc:   String(l[IDX_DESC] || '').trim().substring(0, 55),
        qtd:    parseFloat(l[IDX_QTD] || 0) || 0,
        valor:  parseFloat(l[IDX_VL_TOT] || 0) || 0,
        status: status,
        data:   Utilities.formatDate(dt, tz, 'dd/MM/yyyy'),
        _dt:    dt.getTime()
      });
      if (resumo[chave] !== undefined) resumo[chave]++;
    }

    // Abas ativas
    _getTodasAbas().forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
        .forEach(function(l) {
          push(l, 'ativo', String(l[IDX_STATUS] || '').trim(), nome);
        });
    });

    // Transferências
    var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (wsTr) {
      var ulT = obterUltimaLinhaDados(wsTr);
      if (ulT >= LINHA_DADOS) {
        wsTr.getRange(LINHA_DADOS, 1, ulT - LINHA_DADOS + 1, TRANSF_COL_LOTE_ID).getValues()
          .forEach(function(l) {
            var stTr = String(l[TRANSF_COL_STATUS - 1] || '').trim() || 'Em Transferência';
            push(l, 'transferencia', stTr, ABA_TRANSFERENCIAS);
          });
      }
    }

    // Arquivados
    var hist = ss.getSheetByName('Historico_Arquivo');
    if (hist && hist.getLastRow() >= 2) {
      var ncols = Math.min(TOTAL_COLUNAS, hist.getLastColumn());
      hist.getRange(2, 1, hist.getLastRow() - 1, ncols).getValues().forEach(function(l) {
        var stH = String(l[IDX_STATUS] || '').trim();
        push(l, 'arquivado', stH, 'Historico_Arquivo', 'Arquivado');
      });
    }

    itens.sort(function(a, b) { return b._dt - a._dt; });
    var temMais = itens.length > 500;
    if (temMais) itens = itens.slice(0, 500);
    itens.forEach(function(it) { delete it._dt; });

    return JSON.stringify({ itens: itens, resumo: resumo, temMais: temMais });
  } catch (e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * Retorna agrupamento mensal de lançamentos para o gráfico de tendência.
 * @param {number} periodo  Número de meses para trás (3, 6 ou 12).
 */
function obterTendencia(periodo) {
  try {
    var meses = parseInt(periodo, 10) || 6;
    var ss    = getSS();
    var tz    = Session.getScriptTimeZone();
    var hoje  = new Date();

    // Montar mapa de chaves "MM/AAAA" para os últimos N meses
    var buckets = {};
    var labels  = [];
    for (var m = meses - 1; m >= 0; m--) {
      var d = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
      var chave = Utilities.formatDate(d, tz, 'MM/yyyy');
      var label = Utilities.formatDate(d, tz, 'MMM/yy');
      buckets[chave] = { mes: label, total: 0, pendente: 0 };
      labels.push(chave);
    }

    _getTodasAbas().forEach(function(nome) {
      var ws = ss.getSheetByName(nome);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
        .forEach(function(l) {
          var nf = String(l[IDX_NF] || '').trim();
          if (!nf) return;
          var dt = l[IDX_DATA];
          if (!(dt instanceof Date)) return;
          var chave = Utilities.formatDate(dt, tz, 'MM/yyyy');
          if (!buckets[chave]) return;
          buckets[chave].total++;
          if (String(l[IDX_STATUS] || '').trim() === 'Pendente') buckets[chave].pendente++;
        });
    });

    var tendencia = labels.map(function(k) { return buckets[k]; });
    return JSON.stringify({ tendencia: tendencia });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

/**
 * Retorna contagem de transferências "Em Transferência" e quantas estão vencidas.
 * Usado pelo sidebar badge (S).
 */
function obterBadgeCount() {
  try {
    var ss   = getSS();
    var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (!wsTr || wsTr.getLastRow() < 2) return JSON.stringify({ total: 0, vencidas: 0 });
    var hoje  = new Date();
    var total = 0, vencidas = 0;
    wsTr.getRange(2, 1, wsTr.getLastRow() - 1, TRANSF_TOTAL_COL).getValues()
      .forEach(function(l) {
        var stTr = String(l[TRANSF_COL_STATUS - 1] || '').trim();
        if (stTr !== 'Em Transferência') return;
        total++;
        var agend = l[TRANSF_COL_DATA_AGEND - 1];
        if (agend instanceof Date && agend < hoje) vencidas++;
      });
    return JSON.stringify({ total: total, vencidas: vencidas });
  } catch(e) { return JSON.stringify({ total: 0, vencidas: 0 }); }
}

function executarAcaoEmLoteNotas(params) {
  try {
    var ss=getSS(), acao=String(params.acao||''), itens=params.itens||[];
    var usuario=Session.getActiveUser().getEmail()||'sistema';
    if (!itens.length) return JSON.stringify({ erro: 'Nenhum item selecionado.' });
    if (acao === 'frete') {
      var fp=params.freteParams||{}, ok=0, erros=[];
      var loteId = itens.length > 1 ? Utilities.getUuid() : '';
      for (var fi = 0; fi < itens.length; fi++) {
        var it = itens[fi];
        try {
          var r=JSON.parse(salvarProgramacaoDevolucao({
            aba:it.aba, linha:it.linha, freteTipo:fp.tipo, freteValor:fp.valor,
            dataAgendamento:fp.dataAgend, obs:fp.obs||'',
            numeroPedido:fp.numeroPedido||'',
            nf:it.nf, nfd:it.nfd, forn:it.forn, dataNF:it.data,
            loteId:loteId
          }));
          if (r.ok) ok++; else erros.push(it.nf+': '+(r.erro||'Erro'));
        } catch(e){ erros.push(it.nf+': '+e.message); }
      }
      var msg = loteId
        ? '🚚 Lote programado — '+ok+' NF(s) — '+(itens[0]&&itens[0].forn||'')+'.'
        : '🚚 '+ok+' NF(s) programadas para devolução.';
      return JSON.stringify({ ok: msg, erros: erros });
    }
    var novoStatus = acao==='venda' ? 'Venda' : 'Devolvido';
    var ok=0, erros=[];
    var trava=LockService.getScriptLock();
    if (!trava.tryLock(15000)) return JSON.stringify({ erro:'Sistema ocupado. Tente em instantes.' });
    try {
      itens.forEach(function(it){
        try {
          var ws=ss.getSheetByName(it.aba);
          if (!ws){erros.push(it.nf+': aba não encontrada');return;}
          var stAtual=ws.getRange(it.linha,COL_STATUS).getValue();
          if (stAtual!=='Pendente'){erros.push(it.nf+': status é "'+stAtual+'"');return;}
          _aplicarStatus(ss,ws,it.aba,it.linha,novoStatus,stAtual);
          registrarLog(ss,it.aba,it.linha,COL_STATUS,stAtual,novoStatus,
            'Ação em lote WebApp por '+usuario+' → '+novoStatus);
          ok++;
        } catch(e){erros.push(it.nf+': '+e.message);}
      });
    } finally { trava.releaseLock(); }
    if (ok>0) _atualizarMetricasDashboard(ss);
    return JSON.stringify({ ok:(novoStatus==='Venda'?'🛒':'✅')+' '+ok+' NF(s) marcada(s) como '+novoStatus+'.', erros:erros });
  } catch(e){ return JSON.stringify({ erro:e.toString() }); }
}

function desfazerAcaoEmLoteNotas(itens) {
  try {
    var ss = getSS();
    var usuario = Session.getActiveUser().getEmail() || 'sistema';
    if (!itens || !itens.length) return JSON.stringify({ erro: 'Nenhum item para desfazer.' });
    var ok = 0, erros = [];
    var trava = LockService.getScriptLock();
    if (!trava.tryLock(15000)) return JSON.stringify({ erro: 'Sistema ocupado. Tente em instantes.' });
    try {
      itens.forEach(function(it) {
        try {
          var ws = ss.getSheetByName(it.aba);
          if (!ws) { erros.push(it.nf + ': aba não encontrada'); return; }
          var stAtual = ws.getRange(it.linha, COL_STATUS).getValue();
          if (stAtual === 'Pendente') { erros.push(it.nf + ': já está Pendente'); return; }
          _aplicarStatus(ss, ws, it.aba, it.linha, 'Pendente', stAtual);
          registrarLog(ss, it.aba, it.linha, COL_STATUS, stAtual, 'Pendente',
            'Desfazer ação em lote por ' + usuario);
          ok++;
        } catch(e) { erros.push(it.nf + ': ' + e.message); }
      });
    } finally { trava.releaseLock(); }
    if (ok > 0) _atualizarMetricasDashboard(ss);
    return JSON.stringify({ ok: '↩ ' + ok + ' NF(s) revertida(s) para Pendente.', erros: erros });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterDetalhesNF(aba, linha) {
  try {
    var ss=getSS(), ws=ss.getSheetByName(aba);
    if (!ws) return JSON.stringify({ erro:'Aba não encontrada.' });
    var l=ws.getRange(linha,1,1,TOTAL_COLUNAS).getValues()[0];
    var tz=Session.getScriptTimeZone(), dt=l[IDX_DATA];
    var nf=String(l[IDX_NF]||'').trim(), nfd=String(l[IDX_NFD]||'').trim();
    var emailsHist=[], logHist=[];
    var wsE=ss.getSheetByName('_EmailsEnviados');
    if (wsE) {
      var ulE=wsE.getLastRow();
      if (ulE>=2) wsE.getRange(2,1,ulE-1,6).getValues().forEach(function(r){
        var nfdsCol=String(r[4]||'');
        if (nfdsCol.indexOf(nfd)!==-1||nfdsCol.indexOf(nf)!==-1)
          emailsHist.push({
            data:r[0] instanceof Date?Utilities.formatDate(r[0],tz,'dd/MM/yyyy HH:mm'):String(r[0]||''),
            para:String(r[1]||''), assunto:String(r[2]||''), nfds:nfdsCol
          });
      });
    }
    var wsL=ss.getSheetByName('_Log');
    if (wsL) {
      var ulL=wsL.getLastRow();
      if (ulL>=2) wsL.getRange(2,1,ulL-1,8).getValues().forEach(function(r){
        var ref=String(r[5]||'')+String(r[6]||'')+String(r[7]||'');
        if (ref.indexOf(nf)!==-1||(nfd&&ref.indexOf(nfd)!==-1))
          logHist.push({
            data:r[0] instanceof Date?Utilities.formatDate(r[0],tz,'dd/MM/yyyy HH:mm'):String(r[0]||''),
            usuario:String(r[1]||''), coluna:String(r[4]||''),
            anterior:String(r[5]||''), novo:String(r[6]||''), acao:String(r[7]||'')
          });
      });
      logHist=logHist.slice(-20);
    }
    return JSON.stringify({
      nfd:nfd, nf:nf,
      data:dt instanceof Date?Utilities.formatDate(dt,tz,'dd/MM/yyyy'):'',
      forn:String(l[IDX_FORN]||''), tipo:String(l[IDX_TIPO]||''),
      motivo:String(l[IDX_MOTIVO]||''), desc:String(l[IDX_DESC]||''),
      qtd:parseFloat(l[IDX_QTD]||0)||0, vlUnit:parseFloat(l[IDX_VL_UNIT]||0)||0,
      vlTot:parseFloat(l[IDX_VL_TOT]||0)||0, status:String(l[IDX_STATUS]||''),
      obs:String(l[IDX_OBS]||''), resp:String(l[IDX_RESP]||''),
      anexo:String(l[IDX_ANEXO]||''), freteTipo:String(l[IDX_FRETE_TIPO]||''),
      freteValor:parseFloat(l[IDX_FRETE_VALOR]||0)||0,
      aba:aba, linha:linha, emailsHist:emailsHist, logHist:logHist
    });
  } catch(e){ return JSON.stringify({ erro:e.toString() }); }
}

function editarNF(params) {
  try {
    var ss=getSS(), ws=ss.getSheetByName(params.aba);
    if (!ws) return JSON.stringify({ erro:'Aba não encontrada.' });
    var linha=Number(params.linha), campos=params.campos||{};
    var usuario=Session.getActiveUser().getEmail()||'sistema';
    var mapa={nfd:COL_NFD, tipo:COL_TIPO, motivo:COL_MOTIVO,
              desc:COL_DESC, qtd:COL_QTD, vlUnit:COL_VL_UNIT, obs:COL_OBS, resp:COL_RESP};
    Object.keys(campos).forEach(function(campo){
      var col=mapa[campo]; if (!col) return;
      var ant=ws.getRange(linha,col).getValue();
      ws.getRange(linha,col).setValue(campos[campo]);
      registrarLog(ss,params.aba,linha,col,ant,campos[campo],'Edição WebApp por '+usuario);
    });
    return JSON.stringify({ ok:'✅ NF atualizada com sucesso.' });
  } catch(e){ return JSON.stringify({ erro:e.toString() }); }
}

function abrirFormNotas() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormNotas').setWidth(1200).setHeight(700),
    '📋 Notas Lançadas'
  );
}

function abrirFormTransferencias() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormTransferencias').setWidth(900).setHeight(580),
    '🚛 Transferências — Devoluções Programadas'
  );
}


// ════════════════════════════════════════════════════════════
//   BAIXA PARA VENDA
// ════════════════════════════════════════════════════════════

function abrirFormularioVenda() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormVenda').setWidth(450).setHeight(320),
    '🛒 Baixa de Mercadorias para Venda'
  );
}

function executarBaixaVenda(txtNfsRaw) {
  var nfsDigitadas = txtNfsRaw.split(/[\n,]/).map(function(s) { return String(s).trim(); }).filter(Boolean);
  if (!nfsDigitadas.length) return JSON.stringify({ erro: 'Nenhuma NF válida identificada.' });

  var ss               = getSS();
  var tz               = ss.getSpreadsheetTimeZone();
  var itensEncontrados = [];
  var itensDoc         = [];
  var nfsOk            = [];
  var processados      = new Set();
  var agora            = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
  var porAba           = {};

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;

    var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
    dados.forEach(function(l, i) {
      var nfd = String(l[IDX_NFD]).trim();
      var nf  = String(l[IDX_NF]).trim();
      var st  = String(l[IDX_STATUS]).trim();
      var bat = _baterTermos(nfsDigitadas, nfd, nf);
      if (!bat.bate || st !== 'Pendente' || processados.has(bat.termoBateu)) return;

      processados.add(bat.termoBateu);
      var linha = LINHA_DADOS + i;
      itensEncontrados.push([nfd || nf, String(l[IDX_FORN]).trim(), String(l[IDX_DESC]).trim(), l[IDX_QTD] || 0]);
      var dtVenda = l[IDX_DATA];
      itensDoc.push({
        nfd:    nfd,
        nf:     nf,
        forn:   String(l[IDX_FORN]   || '').trim(),
        tipo:   String(l[IDX_TIPO]   || '').trim(),
        motivo: String(l[IDX_MOTIVO] || '').trim(),
        qtd:    parseFloat(l[IDX_QTD]    || 0) || 0,
        vlTot:  parseFloat(l[IDX_VL_TOT] || 0) || 0,
        data:   dtVenda instanceof Date ? Utilities.formatDate(dtVenda, tz, 'dd/MM/yyyy') : ''
      });

      // [P18] status + checkboxes + obs em 1 setValues
      ws.getRange(linha, COL_STATUS, 1, 5).setValues([[
        'Venda', false, false, true,
        'Enviado para o Fábio em: ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss')
      ]]);
      protegerLinhaConcluida(ss, ws, linha, 'Venda');
      registrarLog(ss, nomeAba, linha, COL_STATUS, nf, 'Venda',
        '🛒 Baixa Venda via HTML — NF: ' + (nfd || nf));
      nfsOk.push(nfd || nf);

      if (!porAba[nomeAba]) porAba[nomeAba] = { ws: ws, linhas: [] };
      porAba[nomeAba].linhas.push(linha);
    });
  });

  if (!itensEncontrados.length) return JSON.stringify({ erro: "Nenhuma NF localizada como 'Pendente'." });

  Object.keys(porAba).forEach(function(nomeAba) {
    var g   = porAba[nomeAba];
    var lns = g.linhas;
    var minL = Math.min.apply(null, lns), maxL = Math.max.apply(null, lns);
    var n    = maxL - minL + 1;
    var bg   = g.ws.getRange(minL, 1, n, TOTAL_COLUNAS).getBackgrounds();
    lns.forEach(function(r) { bg[r - minL] = Array(TOTAL_COLUNAS).fill(COR_LARANJA); });
    g.ws.getRange(minL, 1, n, TOTAL_COLUNAS).setBackgrounds(bg);
  });

  try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
  _atualizarMetricasDashboard(ss);

  if (!ID_PASTA_DESTINO_VENDA || ID_PASTA_DESTINO_VENDA.startsWith('INSIRA'))
    return JSON.stringify({
      sucesso: '✅ Baixa de ' + nfsOk.length + ' itens concluída! (PDF não gerado — configure ID_PASTA_DESTINO_VENDA).',
      itens: itensDoc
    });

  try {
    var ssTemp = SpreadsheetApp.create('Temp_Relatorio_Venda');
    var sh     = ssTemp.getSheets()[0];
    sh.getRange('A1:D1').merge()
      .setValue('RELAÇÃO DE MERCADORIAS ENVIADAS PARA VENDA')
      .setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange('A2:D2').merge()
      .setValue('Emissão: ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm'))
      .setFontSize(10).setFontStyle('italic').setHorizontalAlignment('center');
    sh.getRange('A4:D4')
      .setValues([['NF', 'FORNECEDOR', 'PRODUTO', 'QUANTIDADE']])
      .setFontWeight('bold').setBackgroundColor('#2C3E50')
      .setFontColor('#FFFFFF').setHorizontalAlignment('center');
    sh.getRange(5, 1, itensEncontrados.length, 4).setValues(itensEncontrados);
    var lt = 5 + itensEncontrados.length;
    sh.getRange('A' + lt + ':C' + lt).merge()
      .setValue('Total:').setFontWeight('bold').setHorizontalAlignment('right');
    sh.getRange('D' + lt).setFormula('=SUM(D5:D' + (lt - 1) + ')').setFontWeight('bold');
    [90, 160, 240, 90].forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
    SpreadsheetApp.flush();

    var url  = ssTemp.getUrl().replace(/\/edit.*$/, '') +
      '/export?exportFormat=pdf&format=pdf&size=letter&portrait=true&fitw=true';
    var blob = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    }).getBlob().setName('Relacao_Venda_' + nfsOk.length + '_itens.pdf');
    var arquivo = DriveApp.getFolderById(ID_PASTA_DESTINO_VENDA).createFile(blob);
    DriveApp.getFileById(ssTemp.getId()).setTrashed(true);
    return JSON.stringify({
      sucesso: '✅ Baixa de ' + nfsOk.length + ' itens concluída!',
      urlPdf: arquivo.getUrl(),
      itens: itensDoc
    });
  } catch (e) {
    return JSON.stringify({
      sucesso: '✅ Baixa de ' + nfsOk.length + ' itens concluída! ⚠️ Erro no PDF: ' + e.toString(),
      itens: itensDoc
    });
  }
}


// ════════════════════════════════════════════════════════════
//   FORMULÁRIO DE LANÇAMENTO
// ════════════════════════════════════════════════════════════

function abrirFormularioLancamento() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormLancamento').setWidth(500).setHeight(600),
    '➕ Lançar / Excluir Devolução'
  );
}

function salvarLancamentoForm(dados) {
  _validarDadosForm(dados);
  var ss = getSS();
  var ws = ss.getSheetByName(dados.abaSelecao);
  if (!ws) throw new Error('Aba "' + dados.abaSelecao + '" não encontrada.');
  // [P19] Uma única leitura de COL_NF cobre: lastRow + verificação de duplicata + busca de buracos
  var lastRow = ws.getLastRow();
  var nfVals  = lastRow >= LINHA_DADOS
    ? ws.getRange(LINHA_DADOS, COL_NF, lastRow - LINHA_DADOS + 1, 1).getValues() : [];
  var ul = LINHA_DADOS - 1;
  nfVals.forEach(function(r, i) { if (r[0] !== '' && r[0] != null) ul = LINHA_DADOS + i; });
  if (_nfDuplicada(nfVals, -1, dados.nf))
    return JSON.stringify({ aviso: 'NF "' + dados.nf + '" já existe nesta aba. Confirme para lançar mesmo assim.' });
  return _gravarLancamento(ss, ws, dados, ul, nfVals);
}

function salvarLancamentoFormConfirmado(dados) {
  _validarDadosForm(dados);
  var ss = getSS();
  var ws = ss.getSheetByName(dados.abaSelecao);
  if (!ws) throw new Error('Aba "' + dados.abaSelecao + '" não encontrada.');
  return _gravarLancamento(ss, ws, dados, null, null);
}

function _validarDadosForm(dados) {
  if (!dados.abaSelecao || !dados.nf || !dados.descricao || !dados.qtd || !dados.valorUnit)
    throw new Error('Preencha todos os campos obrigatórios.');
  // Normalização automática: remove espaços duplicados e capitaliza primeira letra
  if (dados.fornecedor) {
    dados.fornecedor = dados.fornecedor.replace(/\s+/g,' ').trim()
      .replace(/\b(\w)/g, function(c){ return c.toUpperCase(); });
  }
  if (dados.descricao) dados.descricao = dados.descricao.replace(/\s+/g,' ').trim();
  if (dados.motivo)    dados.motivo    = dados.motivo.replace(/\s+/g,' ').trim();
}

function _gravarLancamento(ss, ws, dados, ulPre, nfsPre) {
  var valorUnit = Number(String(dados.valorUnit).replace(',', '.'));
  var qtd       = Number(dados.qtd);
  if (isNaN(valorUnit) || valorUnit < 0) throw new Error('Valor unitário inválido.');
  if (isNaN(qtd) || qtd <= 0)            throw new Error('Quantidade inválida.');

  // [P20] Upload do anexo ANTES do lock — usa subpasta da NF se disponível
  var urlAnexo = '';
  var pastaNF = _garantirPastaNF(dados.abaSelecao, dados.nf);
  if (dados.base64 && dados.mimeType && dados.nomeArquivo) {
    try {
      var blob    = Utilities.newBlob(Utilities.base64Decode(dados.base64), dados.mimeType, dados.nomeArquivo);
      var destPasta = pastaNF || _pastaAnexos();
      var arquivo = destPasta.createFile(blob);
      arquivo.setName('NF_' + dados.nf + '_' + dados.nomeArquivo);
      urlAnexo = arquivo.getUrl();
    } catch (eAnexo) {
      console.error('Erro ao salvar anexo: ' + eAnexo);
      registrarErroSistema('_gravarLancamento.anexo', eAnexo.message || eAnexo.toString());
    }
  }
  // Fotos extras (múltiplas — salvas na mesma pasta com prefixo FOTO_)
  if (dados.fotos && dados.fotos.length) {
    var destPastaFotos = pastaNF || _pastaAnexos();
    dados.fotos.forEach(function(foto, idx) {
      try {
        var fb = Utilities.newBlob(Utilities.base64Decode(foto.base64), foto.mime, foto.nome);
        var arq = destPastaFotos.createFile(fb);
        arq.setName('FOTO_' + (idx + 1) + '_NF_' + dados.nf + '_' + foto.nome);
      } catch (eFoto) { console.error('Erro ao salvar foto ' + foto.nome + ': ' + eFoto); registrarErroSistema('_gravarLancamento.foto', eFoto.message || eFoto.toString()); }
    });
  }

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(8000)) throw new Error('Sistema ocupado. Tente novamente.');
  try {
    var ul = (ulPre !== null && ulPre !== undefined) ? ulPre : obterUltimaLinhaDados(ws);
    var nfsExistentes = nfsPre || (ul >= LINHA_DADOS
      ? ws.getRange(LINHA_DADOS, COL_NF, ul - LINHA_DADOS + 1, 1).getValues() : []);

    var dest = ul + 1;
    for (var i = 0; i < nfsExistentes.length; i++) {
      if (nfsExistentes[i][0] === '' || nfsExistentes[i][0] == null) {
        dest = LINHA_DADOS + i;
        break;
      }
    }
    if (dest > LINHA_DADOS + MAX_LINHAS_ABA - 1)
      throw new Error('Aba cheia. Faça o arquivamento antes de lançar novos itens.');

    var rowVals = [
      dados.nfd     || '',
      dados.nf,
      new Date(),
      dados.fornecedor || ws.getName(),
      dados.tipo    || '',
      dados.motivo  || '',
      dados.descricao,
      qtd,
      valorUnit,
      '',
      'Pendente',
      true, false, false,
      '',
      Session.getActiveUser().getEmail() || 'Não identificado',
      urlAnexo,
      '',  // COL_DIAS_ARMAZ — fórmula gravada abaixo
      '',  // COL_FRETE_TIPO — definido depois via "Programar Frete da Devolução"
      ''   // COL_FRETE_VALOR
    ];

    ws.getRange(dest, 1, 1, TOTAL_COLUNAS).setValues([rowVals]);
    ws.getRange(dest, COL_VL_TOT).setFormula(_formulaTotal(dest));
    ws.getRange(dest, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(dest));
    aplicarCorLinha(ws, dest, 'Pendente', new Date());
    _atualizarMetricasDashboard(ss);
    registrarLog(ss, dados.abaSelecao, dest, COL_NF, '', dados.nf,
      '➕ Lançamento via Formulário' + (urlAnexo ? ' + anexo' : ''));
    return JSON.stringify({
      ok: '✅ NF ' + dados.nf + ' lançada na linha ' + dest + ' — ' + dados.abaSelecao +
          (urlAnexo ? '\n📎 Anexo salvo no Drive.' : '') + '.'
    });
  } finally {
    trava.releaseLock();
  }
}

/**
 * Salva um lote de lançamentos de uma só vez.
 * Recebe array de objetos com os mesmos campos de salvarLancamentoForm.
 * Upload de anexos fora do lock; gravação de todas as linhas dentro de 1 lock.
 */
function salvarLoteLancamentos(itens) {
  if (!itens || !itens.length) return JSON.stringify({ erro: 'Nenhum item recebido.' });

  var ss = getSS();

  // [P20-lote] Upload de todos os anexos ANTES do lock
  var urlsAnexo = itens.map(function(it) {
    if (!it.base64 || !it.mimeType || !it.nomeArquivo) return '';
    try {
      var blob    = Utilities.newBlob(Utilities.base64Decode(it.base64), it.mimeType, it.nomeArquivo);
      var arquivo = _pastaAnexos().createFile(blob);
      arquivo.setName('NF_' + it.nf + '_' + it.nomeArquivo);
      return arquivo.getUrl();
    } catch (e) {
      console.error('Erro ao salvar anexo NF ' + it.nf + ': ' + e);
      registrarErroSistema('salvarLoteLancamentos.anexo', e.message || e.toString());
      return '';
    }
  });

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(15000)) return JSON.stringify({ erro: 'Sistema ocupado. Tente novamente.' });

  try {
    var resp     = Session.getActiveUser().getEmail() || 'Não identificado';
    var agora    = new Date();
    var salvos   = [];
    var erros    = [];

    // Agrupa itens por aba para minimizar leituras
    var porAba = {};
    itens.forEach(function(it, i) {
      if (!porAba[it.abaSelecao]) porAba[it.abaSelecao] = [];
      porAba[it.abaSelecao].push({ it: it, idx: i });
    });

    Object.keys(porAba).forEach(function(nomeAba) {
      var ws = ss.getSheetByName(nomeAba);
      if (!ws) {
        porAba[nomeAba].forEach(function(e) {
          erros.push('NF ' + e.it.nf + ': aba "' + nomeAba + '" não encontrada.');
        });
        return;
      }

      // Lê coluna NF uma vez por aba
      var lastRow = ws.getLastRow();
      var nfVals  = lastRow >= LINHA_DADOS
        ? ws.getRange(LINHA_DADOS, COL_NF, lastRow - LINHA_DADOS + 1, 1).getValues() : [];
      var ul = LINHA_DADOS - 1;
      nfVals.forEach(function(r, i) { if (r[0] !== '' && r[0] != null) ul = LINHA_DADOS + i; });

      porAba[nomeAba].forEach(function(entry) {
        var it      = entry.it;
        var urlAnexo = urlsAnexo[entry.idx];

        var valorUnit = Number(String(it.valorUnit).replace(',', '.'));
        var qtd       = Number(it.qtd);
        if (isNaN(valorUnit) || valorUnit < 0) { erros.push('NF ' + it.nf + ': valor inválido.'); return; }
        if (isNaN(qtd) || qtd <= 0)            { erros.push('NF ' + it.nf + ': quantidade inválida.'); return; }

        // Encontra próxima linha disponível
        var dest = ul + 1;
        for (var i = 0; i < nfVals.length; i++) {
          if (nfVals[i][0] === '' || nfVals[i][0] == null) {
            dest = LINHA_DADOS + i;
            break;
          }
        }
        if (dest > LINHA_DADOS + MAX_LINHAS_ABA - 1) {
          erros.push('NF ' + it.nf + ': aba "' + nomeAba + '" cheia.');
          return;
        }

        var rowVals = [
          it.nfd       || '',
          it.nf,
          agora,
          it.fornecedor || ws.getName(),
          it.tipo      || '',
          it.motivo    || '',
          it.descricao,
          qtd,
          valorUnit,
          '',           // COL_VL_TOT — fórmula gravada abaixo
          'Pendente',
          true, false, false,
          '',
          resp,
          urlAnexo,
          '',           // COL_DIAS_ARMAZ — fórmula gravada abaixo
          '',           // COL_FRETE_TIPO
          ''            // COL_FRETE_VALOR
        ];

        ws.getRange(dest, 1, 1, TOTAL_COLUNAS).setValues([rowVals]);
        ws.getRange(dest, COL_VL_TOT).setFormula(_formulaTotal(dest));
        ws.getRange(dest, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(dest));
        aplicarCorLinha(ws, dest, 'Pendente', agora);
        registrarLog(ss, nomeAba, dest, COL_NF, '', it.nf,
          '➕ Lançamento em lote' + (urlAnexo ? ' + anexo' : ''));

        salvos.push('NF ' + it.nf + ' → linha ' + dest);

        // Avança ponteiro para o próximo espaço disponível
        nfVals[dest - LINHA_DADOS] = [it.nf];
        ul = Math.max(ul, dest);
      });
    });

    try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
    _atualizarMetricasDashboard(ss);

    if (!salvos.length) return JSON.stringify({ erro: '❌ Nenhum item salvo.\n' + erros.join('\n') });

    var msg = '✅ ' + salvos.length + ' item(ns) salvo(s) com sucesso!';
    if (erros.length) msg += '\n⚠️ ' + erros.length + ' erro(s):\n' + erros.join('\n');
    return JSON.stringify({ ok: msg });

  } finally {
    trava.releaseLock();
  }
}

/**
 * Busca uma NF Pendente para confirmar exclusão.
 * Retorna { item: { nf, nfd, aba, linha, status, desc } } ou { erro }.
 */
function buscarNFParaExcluir(nfBusca) {
  nfBusca = String(nfBusca || '').trim();
  if (!nfBusca) return JSON.stringify({ erro: 'Informe a NF ou NFD.' });

  var ss = getSS();

  // Bloqueia exclusão se a NF está em Transferências (Em Transferência)
  var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
  if (wsTr && wsTr.getLastRow() >= 2) {
    var dadosTr = wsTr.getRange(2, 1, wsTr.getLastRow() - 1, TRANSF_TOTAL_COL).getValues();
    for (var ti = 0; ti < dadosTr.length; ti++) {
      var nfTr  = String(dadosTr[ti][IDX_NF]  || '').trim();
      var nfdTr = String(dadosTr[ti][IDX_NFD] || '').trim();
      var stTr  = String(dadosTr[ti][TRANSF_COL_STATUS - 1] || '').trim();
      if ((nfTr === nfBusca || nfdTr === nfBusca) && stTr === 'Em Transferência') {
        return JSON.stringify({ erro: '🚫 NF "' + nfBusca + '" está atualmente em Transferências.\n' +
          'Cancele a transferência antes de excluir.' });
      }
    }
  }

  var _todasAbas = _getTodasAbas();
  for (var a = 0; a < _todasAbas.length; a++) {
    var nomeAba = _todasAbas[a];
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) continue;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) continue;

    var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
    for (var i = 0; i < dados.length; i++) {
      var nfd = String(dados[i][IDX_NFD]).trim();
      var nf  = String(dados[i][IDX_NF]).trim();
      if (nf !== nfBusca && nfd !== nfBusca) continue;

      var st = String(dados[i][IDX_STATUS]).trim();
      if (st !== 'Pendente') {
        return JSON.stringify({ erro: 'NF "' + nfBusca + '" encontrada em ' + nomeAba +
          ' mas tem status "' + st + '". Só é possível excluir itens Pendentes.' });
      }
      return JSON.stringify({
        item: {
          nf:     nf,
          nfd:    nfd,
          aba:    nomeAba,
          linha:  LINHA_DADOS + i,
          status: st,
          desc:   String(dados[i][IDX_DESC]).substring(0, 60)
        }
      });
    }
  }
  return JSON.stringify({ erro: 'NF "' + nfBusca + '" não encontrada como Pendente em nenhuma aba.' });
}

/**
 * Exclui um lançamento Pendente com registro no histórico de log.
 * params: { item: { nf, nfd, aba, linha }, motivo: string }
 */
function excluirLancamento(params) {
  if (!params || !params.item || !params.motivo)
    return JSON.stringify({ erro: 'Dados incompletos para exclusão.' });

  var item   = params.item;
  var motivo = String(params.motivo).trim();
  if (!motivo) return JSON.stringify({ erro: 'Informe o motivo da exclusão.' });

  var ss = getSS();
  var ws = ss.getSheetByName(item.aba);
  if (!ws) return JSON.stringify({ erro: 'Aba "' + item.aba + '" não encontrada.' });

  // Confirma que a linha ainda é Pendente (pode ter mudado desde a busca)
  var statusAtual = ws.getRange(item.linha, COL_STATUS).getValue();
  if (statusAtual !== 'Pendente')
    return JSON.stringify({ erro: 'O item não está mais Pendente (status atual: "' + statusAtual + '"). Exclusão cancelada.' });

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(8000)) return JSON.stringify({ erro: 'Sistema ocupado. Tente novamente.' });

  try {
    var nfLabel = item.nfd ? 'NFD ' + item.nfd + ' / NF ' + item.nf : 'NF ' + item.nf;

    // Apaga o conteúdo da linha e repõe valores neutros (checkboxes + fornecedor padrão)
    ws.getRange(item.linha, 1, 1, TOTAL_COLUNAS).clearContent();
    ws.getRange(item.linha, COL_PEND_CHK).setValue(false);
    ws.getRange(item.linha, COL_DEV_CHK).setValue(false);
    ws.getRange(item.linha, COL_VENDA_CHK).setValue(false);
    if (item.aba !== 'Fornecedores Variados') {
      ws.getRange(item.linha, COL_FORN).setValue(item.aba);
    }
    ws.getRange(item.linha, 1, 1, TOTAL_COLUNAS).setBackground('#FFFFFF');
    ws.getRange(item.linha, COL_VL_TOT).setFormula(_formulaTotal(item.linha));
    ws.getRange(item.linha, COL_DIAS_ARMAZ).setFormula(_formulaDiasArmazenado(item.linha));

    // Mover para lixeira antes de limpar
    _moverParaLixeira(ss, ws, item, motivo);

    // Apagar pasta Drive da NF (fotos, anexos)
    _apagarPastaNFDrive(item.aba, item.nf, item.nfd);

    registrarLog(ss, item.aba, item.linha, COL_NF, item.nfd || '', item.nf,
      '🗑️ Exclusão manual — ' + nfLabel + ' | Motivo: ' + motivo);

    try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
    _atualizarMetricasDashboard(ss);

    return JSON.stringify({ ok: '✅ ' + nfLabel + ' excluída com sucesso.\nMotivo registrado no log.' });
  } finally {
    trava.releaseLock();
  }
}


// ════════════════════════════════════════════════════════════
//   CONFIRMAÇÃO DE RECEBIMENTO PELO FORNECEDOR
// ════════════════════════════════════════════════════════════

/**
 * Registra confirmação de recebimento pelo fornecedor.
 * Acrescenta tag "[Receb.Forn: DD/MM/AAAA - email]" ao campo OBS da linha.
 * params: { aba, linha, nf }
 */
function confirmarRecebimentoFornecedor(params) {
  if (!params || !params.aba || !params.linha)
    return JSON.stringify({ erro: 'Dados incompletos.' });
  var ss = getSS();
  var ws = ss.getSheetByName(params.aba);
  if (!ws) return JSON.stringify({ erro: 'Aba "' + params.aba + '" não encontrada.' });
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(6000)) return JSON.stringify({ erro: 'Sistema ocupado. Tente novamente.' });
  try {
    var linha = Number(params.linha);
    var rowData = ws.getRange(linha, 1, 1, TOTAL_COLUNAS).getValues()[0];
    var status = String(rowData[IDX_STATUS] || '').trim();
    if (status !== 'Devolvido')
      return JSON.stringify({ erro: 'Apenas itens com status "Devolvido" podem ter recebimento confirmado (status atual: "' + status + '").' });
    var usuario = Session.getActiveUser().getEmail() || 'sistema';
    var tz  = Session.getScriptTimeZone();
    var agora = new Date();
    var tag = '[Receb.Forn: ' + Utilities.formatDate(agora, tz, 'dd/MM/yyyy') + ' — ' + usuario + ']';
    var obsAtual = String(rowData[IDX_OBS] || '').trim();
    if (obsAtual.indexOf('[Receb.Forn:') !== -1)
      return JSON.stringify({ erro: 'Recebimento já confirmado anteriormente.' });
    var obsNova = obsAtual ? obsAtual + ' | ' + tag : tag;
    ws.getRange(linha, COL_OBS).setValue(obsNova);
    var nf  = String(rowData[IDX_NF]  || '').trim();
    var nfd = String(rowData[IDX_NFD] || '').trim();
    var nfLabel = nfd ? 'NFD ' + nfd + ' / NF ' + nf : 'NF ' + nf;
    registrarLog(ss, params.aba, linha, COL_OBS, obsAtual, obsNova,
      '🏭 Recebimento confirmado pelo fornecedor — ' + nfLabel + ' — ' + usuario);
    return JSON.stringify({ ok: '✅ Recebimento confirmado!\n' + nfLabel + '\n' + tag });
  } finally {
    trava.releaseLock();
  }
}


// ════════════════════════════════════════════════════════════
//   DESFAZER CONCLUSÃO (REABERTURA)
// ════════════════════════════════════════════════════════════

function desfazerConclusao() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormReabertura').setWidth(480).setHeight(400),
    '🔓 Reabrir Devoluções'
  );
}

function buscarNFsConcluidas(txtNfsRaw) {
  var nfsDigitadas = txtNfsRaw.split(/[\n,]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (!nfsDigitadas.length) return JSON.stringify({ erro: 'Nenhuma NF informada.' });

  var ss = getSS();
  var encontradas = [];

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l, i) {
        var nfd = String(l[IDX_NFD]).trim();
        var nf  = String(l[IDX_NF]).trim();
        if (_baterTermos(nfsDigitadas, nfd, nf).bate) {
          encontradas.push({
            nf: nf, nfd: nfd, aba: nomeAba,
            status: String(l[IDX_STATUS]).trim(),
            linha: LINHA_DADOS + i,
            desc: String(l[IDX_DESC]).substring(0, 40)
          });
        }
      });
  });

  if (!encontradas.length) return JSON.stringify({ erro: 'Nenhuma NF localizada nas abas.' });
  return JSON.stringify({ itens: encontradas });
}

/**
 * [P30] Versão otimizada de executarReabertura chamada pelo FormReabertura.
 * Recebe o array itens (com linha+aba pré-resolvidos pelo buscarNFsConcluidas).
 */
function executarReaberturaPorItens(itens, motivo) {
  if (!itens || !itens.length) return JSON.stringify({ erro: 'Nenhum item para reabrir.' });

  var ss        = getSS();
  var reabertos = [];
  var porAba    = {};
  var usuario   = Session.getActiveUser().getEmail() || 'desconhecido';
  var agora     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  var rastro    = '\n[Reaberta em ' + agora + ' por ' + usuario + (motivo ? ' | Motivo: ' + motivo : '') + ']';

  itens.forEach(function(it) {
    if (!porAba[it.aba]) porAba[it.aba] = [];
    porAba[it.aba].push(it);
  });

  Object.keys(porAba).forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;

    var loteAba = porAba[nomeAba];
    var protsAba = ws.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    var protMap  = {};
    protsAba.forEach(function(p) { protMap[p.getRange().getRow()] = p; });

    var linhasReabrir = loteAba.map(function(it) { return it.linha; });
    var minRow = Math.min.apply(null, linhasReabrir);
    var maxRow = Math.max.apply(null, linhasReabrir);
    var nRows  = maxRow - minRow + 1;
    var bgAtual = ws.getRange(minRow, 1, nRows, TOTAL_COLUNAS).getBackgrounds();

    loteAba.forEach(function(it) {
      if (protMap[it.linha]) { protMap[it.linha].remove(); _decrementarProtecoes(1); }
      var obsAtual = String(ws.getRange(it.linha, COL_OBS).getValue() || '');
      ws.getRange(it.linha, COL_STATUS, 1, 5).setValues([['Pendente', true, false, false, obsAtual + rastro]]);
      bgAtual[it.linha - minRow] = Array(TOTAL_COLUNAS).fill(COR_AZUL);
      var nfLabel = it.nfd || it.nf;
      var logMsg  = '🔓 Reabertura — Usuário: ' + usuario + (motivo ? ' | Motivo: ' + motivo : '') + ' — NF: ' + nfLabel;
      registrarLog(ss, nomeAba, it.linha, COL_STATUS, nfLabel, 'Pendente', logMsg);
      reabertos.push((it.nfd ? 'NFD ' + it.nfd + ' / ' : '') + 'NF ' + it.nf + ' (' + nomeAba + ')');
    });
    ws.getRange(minRow, 1, nRows, TOTAL_COLUNAS).setBackgrounds(bgAtual);
  });

  if (!reabertos.length) return JSON.stringify({ erro: 'Nenhuma NF foi reaberta.' });
  try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
  _atualizarMetricasDashboard(ss);
  return JSON.stringify({ sucesso: '✅ ' + reabertos.length + ' NF(s) reabertas:\n' + reabertos.join(', ') });
}

function executarReabertura(txtNfsRaw) {
  var nfsDigitadas = txtNfsRaw.split(/[\n,]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (!nfsDigitadas.length) return JSON.stringify({ erro: 'Nenhuma NF informada.' });

  var ss = getSS();
  var reabertos = [], naoEncontradas = nfsDigitadas.slice();

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;

    // [P21] Lista proteções UMA VEZ por aba
    var protsAba = ws.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    var protMap  = {};
    protsAba.forEach(function(p) { protMap[p.getRange().getRow()] = p; });

    var dados         = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
    var linhasReabrir = [];

    dados.forEach(function(l, i) {
      var nfd = String(l[IDX_NFD]).trim();
      var nf  = String(l[IDX_NF]).trim();
      var bat = _baterTermos(nfsDigitadas, nfd, nf);
      if (!bat.bate) return;
      var row = LINHA_DADOS + i;
      if (protMap[row]) { protMap[row].remove(); _decrementarProtecoes(1); }
      linhasReabrir.push({ row: row, nfd: nfd, nf: nf, bat: bat });
    });

    if (!linhasReabrir.length) return;

    // [P22] status+chk+obs em 1 setValues por linha + cores em batch por aba
    var minRow  = linhasReabrir[0].row;
    var maxRow  = linhasReabrir[linhasReabrir.length - 1].row;
    var nRows   = maxRow - minRow + 1;
    var bgAtual = ws.getRange(minRow, 1, nRows, TOTAL_COLUNAS).getBackgrounds();

    linhasReabrir.forEach(function(info) {
      ws.getRange(info.row, COL_STATUS, 1, 5).setValues([[
        'Pendente', true, false, false, ''
      ]]);
      bgAtual[info.row - minRow] = Array(TOTAL_COLUNAS).fill(COR_AZUL);
      var nfLabel = info.nfd || info.nf;
      registrarLog(ss, nomeAba, info.row, COL_STATUS, nfLabel, 'Pendente',
        '🔓 Reabertura em lote — NF: ' + nfLabel);
      reabertos.push((info.nfd ? 'NFD ' + info.nfd + ' / ' : '') + 'NF ' + info.nf + ' (' + nomeAba + ')');
      var idx = naoEncontradas.indexOf(info.bat.termoBateu);
      if (idx > -1) naoEncontradas.splice(idx, 1);
    });
    ws.getRange(minRow, 1, nRows, TOTAL_COLUNAS).setBackgrounds(bgAtual);
  });

  if (!reabertos.length) return JSON.stringify({ erro: 'Nenhuma NF foi reaberta. Verifique os números.' });
  try { CacheService.getScriptCache().remove(_CACHE_KEY_DASH); } catch(_) {}
  _atualizarMetricasDashboard(ss);

  var msg = '✅ ' + reabertos.length + ' NF(s) reabertas:\n' + reabertos.join(', ');
  if (naoEncontradas.length) msg += '\n⚠️ Não localizadas: ' + naoEncontradas.join(', ');
  return JSON.stringify({ sucesso: msg });
}


// ════════════════════════════════════════════════════════════
//   BUSCA / FILTRO RÁPIDO
// ════════════════════════════════════════════════════════════

function abrirBusca() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormBusca').setWidth(620).setHeight(500),
    '🔍 Buscar NF ou Fornecedor'
  );
}

function executarBusca(termo) {
  termo = String(termo).trim().toLowerCase();
  if (!termo) return JSON.stringify({ erro: 'Informe um termo para buscar.' });

  var ss  = getSS();
  var tz  = Session.getScriptTimeZone();
  var res = [];

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l, i) {
        var nfd  = String(l[IDX_NFD]  || '').trim();
        var nf   = String(l[IDX_NF]   || '').trim();
        var forn = String(l[IDX_FORN] || '').trim();
        var desc = String(l[IDX_DESC] || '').trim();
        if (!nf && !nfd) return;
        if ([nf, nfd, forn, desc].every(function(s) {
          return s.toLowerCase().indexOf(termo) === -1;
        })) return;
        var dt = l[IDX_DATA];
        res.push({
          origem:    'ativo',
          nf:        nf,
          nfd:       nfd,
          forn:      forn,
          desc:      desc.substring(0, 55),
          status:    String(l[IDX_STATUS] || ''),
          data:      dt instanceof Date ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
          dataArq:   '',
          valor:     parseFloat(l[IDX_VL_TOT]) || 0,
          aba:       nomeAba,
          linha:     LINHA_DADOS + i
        });
      });
  });

  // Transferências (mesmo layout cols 1–20 + extras 21–30)
  var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
  if (wsTr) {
    var ulT = obterUltimaLinhaDados(wsTr);
    if (ulT >= LINHA_DADOS) {
      wsTr.getRange(LINHA_DADOS, 1, ulT - LINHA_DADOS + 1, TRANSF_COL_LOTE_ID).getValues()
        .forEach(function(l, i) {
          var nfd  = String(l[IDX_NFD]  || '').trim();
          var nf   = String(l[IDX_NF]   || '').trim();
          var forn = String(l[IDX_FORN] || '').trim();
          var desc = String(l[IDX_DESC] || '').trim();
          if (!nf && !nfd) return;
          if ([nf, nfd, forn, desc].every(function(s) {
            return s.toLowerCase().indexOf(termo) === -1;
          })) return;
          var dt = l[IDX_DATA];
          var stTr = String(l[TRANSF_COL_STATUS - 1] || '').trim() || 'Em Transferência';
          res.push({
            origem:    'transferencia',
            nf:        nf,
            nfd:       nfd,
            forn:      forn,
            desc:      desc.substring(0, 55),
            status:    stTr,
            data:      dt instanceof Date ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
            dataArq:   '',
            valor:     parseFloat(l[IDX_VL_TOT]) || 0,
            aba:       ABA_TRANSFERENCIAS,
            linha:     LINHA_DADOS + i
          });
        });
    }
  }

  var hist = ss.getSheetByName('Historico_Arquivo');
  if (hist) {
    var ulH = hist.getLastRow();
    if (ulH >= 2) {
      var ncols = Math.min(TOTAL_COLUNAS + 1, hist.getLastColumn());
      hist.getRange(2, 1, ulH - 1, ncols).getValues().forEach(function(l) {
        var nfd  = String(l[IDX_NFD]  || '').trim();
        var nf   = String(l[IDX_NF]   || '').trim();
        var forn = String(l[IDX_FORN] || '').trim();
        var desc = String(l[IDX_DESC] || '').trim();
        if (!nf && !nfd) return;
        if ([nf, nfd, forn, desc].every(function(s) {
          return s.toLowerCase().indexOf(termo) === -1;
        })) return;
        var dt    = l[IDX_DATA];
        var dtArq = l[TOTAL_COLUNAS];
        res.push({
          origem:    'historico',
          nf:        nf,
          nfd:       nfd,
          forn:      forn,
          desc:      desc.substring(0, 55),
          status:    String(l[IDX_STATUS] || ''),
          data:      dt    instanceof Date ? Utilities.formatDate(dt,    tz, 'dd/MM/yyyy') : '',
          dataArq:   dtArq instanceof Date ? Utilities.formatDate(dtArq, tz, 'dd/MM/yyyy') : '',
          valor:     parseFloat(l[IDX_VL_TOT]) || 0,
          aba:       '',
          linha:     0
        });
      });
    }
  }

  if (!res.length)
    return JSON.stringify({ erro: 'Nenhum resultado encontrado para "' + termo + '".' });

  var _ordemOrigem = { ativo: 0, transferencia: 1, historico: 2 };
  res.sort(function(a, b) {
    if (a.origem !== b.origem) return (_ordemOrigem[a.origem] || 9) - (_ordemOrigem[b.origem] || 9);
    return (b.data || '').localeCompare(a.data || '');
  });

  return JSON.stringify({ resultados: res });
}

// [P28] flush() desnecessário removido
function navegarParaLinha(nomeAba, linha) {
  try {
    var ss = getSS();
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    ws.activate();
    ws.setActiveRange(ws.getRange(linha, 1));
  } catch (e) { console.error('navegarParaLinha: ' + e); }
}


// ════════════════════════════════════════════════════════════
//   HISTÓRICO DA NF
// ════════════════════════════════════════════════════════════

function buscarHistoricoNF(nf) {
  nf = String(nf).trim();
  if (!nf) return JSON.stringify({ erro: 'Informe o número da NF ou NFD.' });

  var ss    = getSS();
  var wsLog = ss.getSheetByName('_Log');
  if (!wsLog) return JSON.stringify({ erro: 'Aba _Log não encontrada.' });

  var registros = [];
  try {
    // [P24] Lê apenas as últimas 500 linhas em vez de toda a coluna
    var totalRows = wsLog.getMaxRows();
    var startRow  = Math.max(2, totalRows - 499);
    var blocoA    = wsLog.getRange(startRow, 1, totalRows - startRow + 1, 1).getValues();
    var ultimaLinha = startRow - 1;
    for (var k = blocoA.length - 1; k >= 0; k--) {
      if (blocoA[k][0] !== '' && blocoA[k][0] != null) { ultimaLinha = startRow + k; break; }
    }
    if (ultimaLinha < 2) return JSON.stringify({ registros: [] });

    var dados = wsLog.getRange(2, 1, ultimaLinha - 1, 8).getValues();

    var linhasNF = {};
    ABAS_OPERACIONAIS.forEach(function(nomeAba) {
      var ws = ss.getSheetByName(nomeAba);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
        .forEach(function(l, i) {
          if (String(l[IDX_NFD] || '').trim() === nf || String(l[IDX_NF] || '').trim() === nf) {
            linhasNF[nomeAba + ':' + (LINHA_DADOS + i)] = true;
          }
        });
    });

    dados.forEach(function(l) {
      var aba    = String(l[2]);
      var linha  = String(l[3]);
      var valAnt = String(l[5]);
      var valNov = String(l[6]);
      var acao   = String(l[7]);

      var bateChave = !!linhasNF[aba + ':' + linha];
      var bateTexto = valAnt === nf || valNov === nf ||
                      valAnt.indexOf(nf) !== -1 || valNov.indexOf(nf) !== -1 ||
                      acao.indexOf(nf) !== -1;
      if (!bateChave && !bateTexto) return;

      registros.push({
        data:     l[0] instanceof Date
                    ? Utilities.formatDate(l[0], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
                    : String(l[0]),
        usuario:  String(l[1]),
        aba:      aba,
        coluna:   String(l[4]),
        anterior: valAnt,
        novo:     valNov,
        acao:     acao
      });
    });
  } catch (e) {
    return JSON.stringify({ erro: 'Erro ao ler log: ' + e.toString() });
  }

  return JSON.stringify({ nf: nf, registros: registros });
}


// ════════════════════════════════════════════════════════════
//   ANEXO DE NF
// ════════════════════════════════════════════════════════════

function abrirAnexoNF() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormAnexo').setWidth(480).setHeight(360),
    '📎 Anexar Foto/PDF da NF'
  );
}

function salvarAnexoNF(dados) {
  if (!dados.nf || !dados.base64 || !dados.mimeType)
    return JSON.stringify({ erro: 'Dados incompletos para o anexo.' });

  var ss = getSS();
  var linhaEncontrada = null, wsEncontrado = null, abaEncontrada = '';

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    if (linhaEncontrada) return;
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l, i) {
        if (linhaEncontrada) return;
        var termo = String(dados.nf).trim();
        if (String(l[IDX_NFD] || '').trim() === termo || String(l[IDX_NF] || '').trim() === termo) {
          linhaEncontrada = LINHA_DADOS + i;
          wsEncontrado    = ws;
          abaEncontrada   = nomeAba;
        }
      });
  });

  if (!linhaEncontrada)
    return JSON.stringify({ erro: 'NF "' + dados.nf + '" não encontrada nas abas.' });

  try {
    var blob    = Utilities.newBlob(Utilities.base64Decode(dados.base64), dados.mimeType, dados.nomeArquivo);
    var arquivo = _pastaAnexos().createFile(blob);
    arquivo.setName('NF_' + dados.nf + '_' + dados.nomeArquivo);
    var url = arquivo.getUrl();
    wsEncontrado.getRange(linhaEncontrada, COL_ANEXO).setValue(url);
    registrarLog(ss, abaEncontrada, linhaEncontrada, COL_ANEXO, '', url, '📎 Anexo NF adicionado');
    return JSON.stringify({ sucesso: '✅ Arquivo anexado à NF ' + dados.nf + '.', url: url });
  } catch (e) {
    return JSON.stringify({ erro: '❌ Erro ao salvar anexo: ' + e.toString() });
  }
}


// ════════════════════════════════════════════════════════════
//   E-MAIL DE DEVOLUÇÃO POR NFD
// ════════════════════════════════════════════════════════════

function abrirEmailDevolucao() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormEmailDevolucao').setWidth(520).setHeight(520),
    '📧 Enviar E-mail de Devolução'
  );
}

function buscarDadosNFDs(nfdsRaw) {
  var nfds = nfdsRaw.split(/[\n,]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (!nfds.length) return JSON.stringify({ erro: 'Nenhuma NFD informada.' });

  var ss = getSS();
  var itens = [];

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l) {
        var bat = _baterTermos(nfds, String(l[IDX_NFD]).trim(), String(l[IDX_NF]).trim());
        if (!bat.bate) return;
        var dt = l[IDX_DATA];
        itens.push({
          nfd:      String(l[IDX_NFD]).trim() || String(l[IDX_NF]).trim(),
          tipo:     String(l[IDX_TIPO]).trim(),
          motivo:   String(l[IDX_MOTIVO]).trim(),
          nf:       String(l[IDX_NF]).trim(),
          forn:     String(l[IDX_FORN]).trim(),
          desc:     String(l[IDX_DESC]).trim(),
          qtd:      l[IDX_QTD] || 0,
          valor:    parseFloat(l[IDX_VL_TOT]) || 0,
          data:     dt instanceof Date ? Utilities.formatDate(dt, Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
          urlAnexo: String(l[IDX_ANEXO] || '').trim()
        });
      });
  });

  if (!itens.length) return JSON.stringify({ erro: 'Nenhuma NFD localizada nas abas.' });

  var forns = _fornecedoresUnicos(itens);
  if (forns.length > 1)
    return JSON.stringify({ erro: 'NFDs de fornecedores diferentes: ' + forns.join(', ') + '. Use apenas NFDs do mesmo fornecedor.' });

  return JSON.stringify({
    itens:      itens,
    forn:       forns[0],
    titulo:     _montarTituloEmail(itens, forns[0]),
    emailsBase: _getEmailsGeral()
  });
}

// ── Agendamento de e-mail ───────────────────────────────────
function agendarEmailDevolucao(params, dataEnvioISO) {
  try {
    var usuario = Session.getActiveUser().getEmail();
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_EMAILS_AGENDADOS) || '[]';
    var lista = JSON.parse(raw);
    var id = 'ae_' + new Date().getTime();
    lista.push({ id: id, params: params, dataEnvio: dataEnvioISO, usuario: usuario, status: 'pendente' });
    PropertiesService.getScriptProperties().setProperty(_KEY_EMAILS_AGENDADOS, JSON.stringify(lista));
    _garantirTriggerEmailAgendado();
    return JSON.stringify({ ok: '✅ E-mail agendado para ' + dataEnvioISO + '.', id: id });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function cancelarEmailAgendado(id) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_EMAILS_AGENDADOS) || '[]';
    var lista = JSON.parse(raw).filter(function(e){ return e.id !== id; });
    PropertiesService.getScriptProperties().setProperty(_KEY_EMAILS_AGENDADOS, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Agendamento cancelado.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function listarEmailsAgendados() {
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_EMAILS_AGENDADOS) || '[]';
  try { return raw; } catch(_) { return '[]'; }
}

function _garantirTriggerEmailAgendado() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === '_processarEmailsAgendados') return;
  }
  ScriptApp.newTrigger('_processarEmailsAgendados').timeBased().everyHours(1).create();
}

function _processarEmailsAgendados() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_EMAILS_AGENDADOS) || '[]';
    var lista = JSON.parse(raw);
    var agora = new Date();
    var restantes = [];
    lista.forEach(function(item) {
      if (item.status !== 'pendente') return;
      var data = new Date(item.dataEnvio);
      if (agora >= data) {
        try { enviarEmailDevolucao(item.params); item.status = 'enviado'; }
        catch(e) { item.status = 'erro_' + e.message; restantes.push(item); return; }
      } else {
        restantes.push(item);
      }
    });
    PropertiesService.getScriptProperties().setProperty(_KEY_EMAILS_AGENDADOS, JSON.stringify(restantes));
  } catch(_) {}
}

function previewEmailDevolucao(params) {
  try {
    var nfds = params.nfds || [];
    if (!nfds.length) return JSON.stringify({ html: '<p>Nenhuma NFD informada.</p>' });
    var assunto = params.assunto || 'Devolução';
    var obs     = params.obs     || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var amostra = [];
    var forn = '';
    _getTodasAbas().forEach(function(nome) {
      var aba = ss.getSheetByName(nome);
      if (!aba) return;
      var ult = obterUltimaLinhaDados(aba);
      if (ult < 2) return;
      var dados = aba.getRange(2, 1, ult - 1, 15).getValues();
      dados.forEach(function(row) {
        var nfd = String(row[1]||'').trim();
        if (nfds.indexOf(nfd) > -1) {
          if (!forn) forn = String(row[4]||'');
          amostra.push({ nfd: nfd, desc: String(row[6]||''), qtd: row[8], vlUnit: row[9], tipo: row[5]||'' });
        }
      });
    });
    var linhas = amostra.map(function(it) {
      return '<tr><td style="padding:6px 10px;border-bottom:1px solid #E5E7EB">'+_esc(it.nfd)+'</td>'
        +'<td style="padding:6px 10px;border-bottom:1px solid #E5E7EB">'+_esc(it.desc)+'</td>'
        +'<td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;text-align:center">'+_esc(String(it.qtd))+'</td>'
        +'<td style="padding:6px 10px;border-bottom:1px solid #E5E7EB;text-align:right">R$ '+Number(it.vlUnit||0).toFixed(2).replace('.',',')+'</td></tr>';
    });
    var htmlBody = _montarHtmlEmail(assunto, new Date().toLocaleDateString('pt-BR'), forn || '—', linhas, 0, obs);
    var assinHtml = _obterHtmlAssinaturaById(params.assinaturaFileId || '');
    if (assinHtml) htmlBody += assinHtml;
    return JSON.stringify({ html: htmlBody });
  } catch(e) { return JSON.stringify({ html: '<p style="color:red">Erro: '+e+'</p>' }); }
}

function enviarEmailDevolucao(params) {
  var nfds = params.nfdsRaw.split(/[\n,]/).map(function(s) { return s.trim(); }).filter(Boolean);
  if (!nfds.length) return JSON.stringify({ erro: 'Nenhuma NFD informada.' });

  var ss = getSS();
  var itens = [];

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l, li) {
        var bat = _baterTermos(nfds, String(l[IDX_NFD]).trim(), String(l[IDX_NF]).trim());
        if (!bat.bate) return;
        var dt = l[IDX_DATA];
        itens.push({
          nfd:      String(l[IDX_NFD]).trim() || String(l[IDX_NF]).trim(),
          tipo:     String(l[IDX_TIPO]).trim(),
          motivo:   String(l[IDX_MOTIVO]).trim(),
          nf:       String(l[IDX_NF]).trim(),
          forn:     String(l[IDX_FORN]).trim(),
          desc:     String(l[IDX_DESC]).trim(),
          qtd:      l[IDX_QTD] || 0,
          valor:    parseFloat(l[IDX_VL_TOT]) || 0,
          data:     dt instanceof Date ? Utilities.formatDate(dt, Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
          urlAnexo: String(l[IDX_ANEXO] || '').trim(),
          linha:    LINHA_DADOS + li,
          ws:       ws,
          nomeAba:  nomeAba
        });
      });
  });

  if (!itens.length) return JSON.stringify({ erro: 'Nenhuma NFD localizada.' });

  var forn          = itens[0].forn;
  var destinatarios = _montarDestinatarios(params.emailsExtras);
  var assunto       = params.assunto || _montarTituloEmail(itens, forn);

  // Templates customizados: usa o tipo mais frequente ou o do primeiro item
  (function() {
    try {
      var rawTpl = PropertiesService.getScriptProperties().getProperty(_KEY_EMAIL_TEMPLATES);
      if (!rawTpl) return;
      var tpls = JSON.parse(rawTpl);
      var tipo = itens[0].tipo || '';
      var tplKey = tipo.toLowerCase().replace(/\s+/g, '_');
      if (tpls[tplKey] && tpls[tplKey].assunto && !params.assunto) {
        assunto = tpls[tplKey].assunto
          .replace('{forn}', forn).replace('{qtd}', itens.length).replace('{tipo}', tipo);
      }
    } catch(_) {}
  })();

  // CC/BCC por fornecedor
  var _ccFornConfig = (function() {
    try {
      var rawCC = PropertiesService.getScriptProperties().getProperty(_KEY_CC_FORN);
      if (!rawCC) return {};
      return JSON.parse(rawCC);
    } catch(_) { return {}; }
  })();
  var _ccExtra = (_ccFornConfig[forn] || {}).cc  || '';
  var _bccExtra= (_ccFornConfig[forn] || {}).bcc || '';
  var valorTotal    = itens.reduce(function(s, it) { return s + it.valor; }, 0);

  var linhasTabela = itens.map(function(it) {
    var corTipo  = it.tipo === 'Avaria'   ? '#FFF3E0'
                 : it.tipo === 'Rejeição' ? '#FEF2F2' : '#E3F2FD';
    var corTexto = it.tipo === 'Avaria'   ? '#E65100'
                 : it.tipo === 'Rejeição' ? '#DC2626' : '#1565C0';
    return '<tr>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:bold">' + _esc(it.nfd) + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee;background:' + corTipo + ';color:' + corTexto + ';font-weight:bold;text-align:center">' + _esc(it.tipo) + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee;color:#555">' + _esc(it.motivo || '—') + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee">' + _esc(it.nf) + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee">' + _esc(it.desc) + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">' + _esc(it.qtd) + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">R$ ' + it.valor.toFixed(2).replace('.', ',') + '</td>' +
      '<td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">' + _esc(it.data) + '</td>' +
      '</tr>';
  }).join('');

  var dataEnvio = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  // ── Comunicados de retorno: suporta múltiplos arquivos ──
  var blobsComunicado = [];
  // novo formato: array params.comunicados
  var comList = params.comunicados && params.comunicados.length ? params.comunicados : [];
  // backward compat: campo único legado
  if (!comList.length && params.comBase64 && params.comMime && params.comNome) {
    comList = [{ base64: params.comBase64, mime: params.comMime, nome: params.comNome }];
  }
  comList.forEach(function(c) {
    try {
      if (c.base64 && c.mime && c.nome) {
        blobsComunicado.push(Utilities.newBlob(Utilities.base64Decode(c.base64), c.mime, c.nome));
      }
    } catch (eCom) { console.error('Erro ao decodificar comunicado "' + (c.nome||'?') + '": ' + eCom); }
  });

  var comObsHtml = '';
  if (blobsComunicado.length) {
    comObsHtml =
      '<div style="margin:14px 0 0;padding:10px 14px;background:#FFF8E1;' +
      'border-left:4px solid #F59E0B;border-radius:0 4px 4px 0">' +
      '<p style="margin:0;font-size:13px;color:#92400E;font-weight:bold">📋 Comunicado de Retorno em Anexo'
      + (blobsComunicado.length > 1 ? ' (' + blobsComunicado.length + ' arquivos)' : '') + '</p>';
    if (params.comObs) {
      comObsHtml += '<p style="margin:6px 0 0;font-size:13px;color:#444">' + _esc(params.comObs) + '</p>';
    }
    comObsHtml += '</div>';
  }

  var obsHtml = comObsHtml;
  if (params.obs) {
    obsHtml += '<p style="margin:14px 0 0;font-size:13px;color:#444"><strong>Observações:</strong> ' + _esc(params.obs) + '</p>';
  }

  var htmlBody = _montarHtmlEmail(assunto, dataEnvio, forn, linhasTabela, valorTotal, obsHtml);

  var blobs = [], semAnexo = [];
  var _idsAnexados = {}; // dedupe: mesmo arquivo Drive nunca anexado 2x (PDF duplicado)
  itens.forEach(function(it) {
    var temAnexo = false;
    if (it.urlAnexo && it.urlAnexo.startsWith('http')) {
      try {
        var fileId = _extrairIdDriveUrl(it.urlAnexo);
        if (fileId) {
          if (!_idsAnexados[fileId]) {
            _idsAnexados[fileId] = true;
            var driveFile = DriveApp.getFileById(fileId);
            blobs.push(driveFile.getBlob().setName('NFD_' + it.nfd + '_' + driveFile.getName()));
          }
          temAnexo = true;
        }
      } catch (eBlob) {
        console.warn('Não foi possível anexar arquivo da NFD ' + it.nfd + ': ' + eBlob);
        registrarErroSistema('enviarEmailDevolucao.anexo', eBlob.message || eBlob.toString());
      }
    }
    // Fotos extras (FOTO_*) salvas na pasta da NF
    try {
      var pasta = _garantirPastaNF(it.nomeAba, it.nf);
      if (pasta) {
        var _dbgTotal = 0, _dbgFotos = 0;
        var iter = pasta.getFiles();
        while (iter.hasNext()) {
          var f = iter.next();
          _dbgTotal++;
          if (f.getName().indexOf('FOTO_') === 0) {
            var fid = f.getId();
            if (!_idsAnexados[fid]) {
              _idsAnexados[fid] = true;
              blobs.push(f.getBlob().setName('FOTO_NFD_' + it.nfd + '_' + f.getName()));
            }
            temAnexo = true;
            _dbgFotos++;
          }
        }
        if (_dbgFotos === 0) {
          registrarErroSistema('DEBUG_fotos',
            'NFD=' + it.nfd + '|aba=' + it.nomeAba + '|nf=' + it.nf +
            '|pastaId=' + pasta.getId() + '|arqsTotal=' + _dbgTotal + '|fotos=0');
        }
      }
    } catch (eFoto) { console.warn('Erro ao buscar fotos NFD ' + it.nfd + ': ' + eFoto); registrarErroSistema('enviarEmailDevolucao.fotos', eFoto.message || eFoto.toString()); }
    if (!temAnexo) semAnexo.push(it.nfd);
  });

  var avisoSemAnexo = semAnexo.length
    ? '<p style="margin:10px 0 0;font-size:12px;color:#E65100">⚠️ NFD(s) sem arquivo anexado: ' + semAnexo.map(_esc).join(', ') + '</p>'
    : '';

  var htmlFinal = htmlBody.replace(
    '<p style="margin:20px 0 0;font-size:12px;color:#888">',
    avisoSemAnexo + '<p style="margin:20px 0 0;font-size:12px;color:#888">'
  );

  // Assinatura via CID inline image — data: URI é bloqueado pelo Gmail
  var assinaturaBlob = null;
  if (params.assinaturaFileId) {
    try {
      assinaturaBlob = DriveApp.getFileById(params.assinaturaFileId.trim()).getBlob();
      htmlFinal += '<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px">'
        + '<img src="cid:assinatura_img" alt="Assinatura" style="max-height:140px;max-width:480px;object-fit:contain">'
        + '</div>';
    } catch(_) {}
  }

  try {
    var todosBlobs = blobs.slice();
    blobsComunicado.forEach(function(b){ todosBlobs.push(b); });

    var mailOpts = {
      to:       destinatarios.join(','),
      subject:  assunto,
      htmlBody: htmlFinal
    };
    if (todosBlobs.length) mailOpts.attachments = todosBlobs;
    if (assinaturaBlob)    mailOpts.inlineImages = { assinatura_img: assinaturaBlob };
    if (_ccExtra)  mailOpts.cc  = _ccExtra;
    if (_bccExtra) mailOpts.bcc = _bccExtra;
    MailApp.sendEmail(mailOpts);

    var infoAnexos = todosBlobs.length
      ? ' | ' + todosBlobs.length + ' arquivo(s) anexado(s)' + (blobsComunicado.length ? ' (incl. ' + blobsComunicado.length + ' comunicado(s))' : '')
      : ' | sem anexos';
    registrarLog(ss, 'SISTEMA', 0, 0, '', assunto,
      '📧 E-mail devolução enviado para: ' + destinatarios.join(', ') + infoAnexos);

    _registrarEmailEnviado(ss, {
      assunto:       assunto,
      destinatarios: destinatarios,
      nfds:          itens.map(function(it) { return it.nfd || it.nf; }),
      forn:          forn,
      totalItens:    itens.length,
      totalValor:    valorTotal,
      anexos:        todosBlobs.length,
      corpo:         htmlFinal
    });

    var itensFalta   = itens.filter(function(it) { return it.tipo === 'Falta'; });
    var linhasFalta  = itensFalta.map(function(it) { return { ws: it.ws, linha: it.linha, nomeAba: it.nomeAba }; });
    var nfdsArquivadas = itensFalta.map(function(it) { return it.nfd || it.nf; });

    var totalArquivadas = 0;
    if (linhasFalta.length) {
      itensFalta.forEach(function(it) {
        var nfRef = it.nfd || it.nf;
        registrarLog(ss, it.nomeAba, it.linha, COL_STATUS, nfRef, 'Arquivado',
          '📧 Falta arquivada após envio do e-mail — NF: ' + nfRef);
      });
      totalArquivadas = _arquivarLinhasEspecificas(ss, linhasFalta);
      _atualizarMetricasDashboard(ss);
    }

    var infoArquivadas = totalArquivadas > 0
      ? '\n📦 ' + totalArquivadas + ' nota(s) de Falta movida(s) para Historico_Arquivo: ' + nfdsArquivadas.join(', ')
      : '';

    return JSON.stringify({
      sucesso: '✅ E-mail enviado para ' + destinatarios.length + ' destinatário(s)' + infoAnexos + ':\n' +
               destinatarios.join('\n') + infoArquivadas
    });
  } catch (e) {
    registrarErroSistema('enviarEmailDevolucao', e.message || e.toString());
    return JSON.stringify({ erro: '❌ Erro ao enviar: ' + e.toString() });
  }
}

/** Monta o HTML completo do e-mail de devolução. */
function _montarHtmlEmail(assunto, dataEnvio, forn, linhasTabela, valorTotal, obsHtml) {
  return '<div style="font-family:Arial,sans-serif;max-width:820px;color:#222">' +
    '<div style="background:#2D5F8A;color:#fff;padding:16px 20px;border-radius:6px 6px 0 0">' +
    '<h2 style="margin:0;font-size:18px">' + _esc(assunto) + '</h2>' +
    '<p style="margin:4px 0 0;font-size:12px;opacity:.85">Emitido em ' + _esc(dataEnvio) + '</p>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #ddd;border-top:none;padding:16px 20px;border-radius:0 0 6px 6px">' +
    '<p style="margin:0 0 14px;font-size:13px">Prezados,</p>' +
    '<p style="margin:0 0 14px;font-size:13px">Encaminhamos abaixo a relação de notas fiscais referentes às devoluções de <strong>' + _esc(forn) + '</strong>:</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<thead><tr style="background:#F0F4F8">' +
    '<th style="padding:8px 10px;text-align:left;border-bottom:2px solid #2D5F8A">NFD</th>' +
    '<th style="padding:8px 10px;text-align:center;border-bottom:2px solid #2D5F8A">Tipo</th>' +
    '<th style="padding:8px 10px;text-align:left;border-bottom:2px solid #2D5F8A">Motivo</th>' +
    '<th style="padding:8px 10px;text-align:left;border-bottom:2px solid #2D5F8A">Nº NF</th>' +
    '<th style="padding:8px 10px;text-align:left;border-bottom:2px solid #2D5F8A">Descrição</th>' +
    '<th style="padding:8px 10px;text-align:center;border-bottom:2px solid #2D5F8A">Qtd</th>' +
    '<th style="padding:8px 10px;text-align:right;border-bottom:2px solid #2D5F8A">Valor</th>' +
    '<th style="padding:8px 10px;text-align:center;border-bottom:2px solid #2D5F8A">Data</th>' +
    '</tr></thead>' +
    '<tbody>' + linhasTabela + '</tbody>' +
    '<tfoot><tr style="background:#F9F9F9">' +
    '<td colspan="6" style="padding:8px 10px;font-weight:bold;text-align:right;border-top:2px solid #2D5F8A">TOTAL:</td>' +
    '<td style="padding:8px 10px;font-weight:bold;text-align:right;border-top:2px solid #2D5F8A;color:#2D5F8A">R$ ' + valorTotal.toFixed(2).replace('.', ',') + '</td>' +
    '<td style="border-top:2px solid #2D5F8A"></td>' +
    '</tr></tfoot>' +
    '</table>' + obsHtml +
    '</div></div>';
}


// ════════════════════════════════════════════════════════════
//   HISTÓRICO DE E-MAILS ENVIADOS
// ════════════════════════════════════════════════════════════

function garantirAbaEmailsEnviados(ss) {
  var ws = ss.getSheetByName('_EmailsEnviados');
  if (!ws) {
    ws = ss.insertSheet('_EmailsEnviados');
    ws.hideSheet();
    var cab = ['Data/Hora','Assunto','Fornecedor','Destinatários','NFDs/NFs Incluídas','Total Itens','Valor Total (R$)','Arquivos Anexados','Corpo do E-mail'];
    ws.getRange(1, 1, 1, cab.length).setValues([cab])
      .setBackground('#2D5F8A').setFontColor('#FFFFFF').setFontWeight('bold');
    ws.setFrozenRows(1);
    [160,300,160,260,300,80,140,120,500].forEach(function(w, i) { ws.setColumnWidth(i + 1, w); });
  }
  return ws;
}

function _registrarEmailEnviado(ss, info) {
  try {
    var ws    = garantirAbaEmailsEnviados(ss);
    var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    ws.appendRow([
      agora, info.assunto, info.forn,
      info.destinatarios.join('; '),
      info.nfds.join(', '),
      info.totalItens, info.totalValor, info.anexos,
      info.corpo || ''
    ]);
  } catch (e) {
    console.error('_registrarEmailEnviado: ' + e);
    registrarErroSistema('_registrarEmailEnviado', e.message || e.toString());
  }
}

function buscarHistoricoEmails() {
  var ss = getSS();
  var ws = ss.getSheetByName('_EmailsEnviados');
  if (!ws) return JSON.stringify({ registros: [] });

  try {
    var ul = ws.getLastRow();
    if (ul < 2) return JSON.stringify({ registros: [] });
    var dados = ws.getRange(2, 1, ul - 1, 9).getValues();
    var registros = dados
      .filter(function(l) { return l[0]; })
      .map(function(l) {
        return {
          data:       l[0] instanceof Date
                        ? Utilities.formatDate(l[0], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
                        : String(l[0]),
          assunto:    String(l[1]),
          forn:       String(l[2]),
          destinos:   String(l[3]),
          nfds:       String(l[4]),
          totalItens: l[5] || 0,
          totalValor: parseFloat(l[6]) || 0,
          anexos:     l[7] || 0,
          corpo:      String(l[8] || '')
        };
      })
      .reverse();
    return JSON.stringify({ registros: registros });
  } catch (e) {
    return JSON.stringify({ erro: 'Erro ao ler histórico: ' + e.toString() });
  }
}


// ════════════════════════════════════════════════════════════
//   ALERTAS DE ATRASO E RESUMO SEMANAL
// ════════════════════════════════════════════════════════════

function verificarAtrasosEEnviarAlerta() {
  var ss     = getSS();
  var tz     = ss.getSpreadsheetTimeZone();
  var hoje   = new Date();
  var limite = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
  var linhas = [];

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l) {
        var nf = l[IDX_NF], st = l[IDX_STATUS], dt = l[IDX_DATA];
        if (nf && st === 'Pendente' && dt instanceof Date && dt < limite) {
          linhas.push({
            nfd:  String(l[IDX_NFD]  || '').trim(),
            nf:   String(nf).trim(),
            data: Utilities.formatDate(dt, tz, 'dd/MM/yyyy'),
            forn: String(l[IDX_FORN] || nomeAba).trim(),
            tipo: String(l[IDX_TIPO] || '').trim(),
            desc: String(l[IDX_DESC] || '').trim(),
            qtd:  l[IDX_QTD] || 0,
            val:  parseFloat(l[IDX_VL_TOT]) || 0,
            st:   st,
            dias: Math.floor((hoje - dt) / 864e5),
            resp: String(l[IDX_RESP] || 'Não informado').trim()
          });
        }
      });
  });

  if (!linhas.length) {
    try { SpreadsheetApp.getUi().alert('✅ Nenhum item com +30 dias pendente.'); } catch (_) {}
    return JSON.stringify({ sucesso: '✅ Nenhum item com +30 dias pendente.', total: 0 });
  }

  var dataStr  = Utilities.formatDate(hoje, tz, 'dd/MM/yyyy');
  var valTotal = linhas.reduce(function(s, l) { return s + l.val; }, 0);
  var assunto  = '⚠️ [Devoluções] ' + linhas.length + ' item(ns) em atraso crítico (+30 dias) — ' + dataStr;

  var pdf = _gerarRelatorioPDF(ss, {
    titulo:   'DEVOLUÇÕES EM ATRASO CRÍTICO (+30 DIAS)',
    periodo:  dataStr,
    linhas:   linhas,
    valTotal: valTotal,
    nomeArq:  'Atraso_Critico_' + dataStr.replace(/\//g, '-') + '.pdf',
    kpiLabel: 'Em Atraso (+30 dias)',
    kpiCor:   '#DC2626',
    colExtra: { header: 'Atraso', fn: function(l) { return l.dias + ' dias'; } }
  });

  var htmlEmail = _montarHtmlRelatorio({
    icone:    '⚠️',
    titulo:   'Devoluções em Atraso Crítico',
    subtitulo: dataStr,
    intro:    'Foram encontradas <strong>' + linhas.length + '</strong> devolução(ões) com mais de <strong>30 dias</strong> em aberto. Segue relatório em anexo.',
    kpis: [
      { label: 'Em Atraso (+30 dias)', cor: '#DC2626', valor: linhas.length + ' itens', sub: 'R$ ' + _fmtVal(valTotal) }
    ]
  });

  var anexos = pdf ? [pdf.blob] : [];
  enviarEmail(assunto, htmlEmail, anexos, 'atraso');
  _enviarAlertaWebhook('⚠️ ' + linhas.length + ' devolução(ões) em atraso crítico (+30 dias) — ' + dataStr
    + '\nTotal: R$ ' + _fmtVal(valTotal)
    + '\nAcesse o sistema para detalhes.');
  registrarLog(ss, 'SISTEMA', 0, 0, '', linhas.length + ' itens', '⚠️ Alerta de atraso enviado — ' + dataStr);
  try { SpreadsheetApp.getUi().alert('📧 Alerta enviado! ' + linhas.length + ' item(ns) em atraso.'); } catch (_) {}
  return JSON.stringify({ sucesso: '📧 Alerta enviado! ' + linhas.length + ' item(ns) em atraso.', total: linhas.length });
}


// ════════════════════════════════════════════════════════════
//   WEBHOOK — ALERTAS WHATSAPP / TELEGRAM
// ════════════════════════════════════════════════════════════

function obterConfWebhook() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF) || '{}';
    return JSON.stringify({ conf: JSON.parse(raw) });
  } catch(e) { return JSON.stringify({ conf: {} }); }
}

function salvarConfWebhook(conf) {
  try {
    if (!conf || typeof conf !== 'object') return JSON.stringify({ erro: 'Configuração inválida.' });
    var payload = {
      ativo: !!conf.ativo,
      tipo:  String(conf.tipo || 'telegram'),
      telegram: {
        token:   String((conf.telegram && conf.telegram.token)  || ''),
        chatIds: (conf.telegram && Array.isArray(conf.telegram.chatIds)) ? conf.telegram.chatIds : []
      },
      whatsapp: {
        url:     String((conf.whatsapp && conf.whatsapp.url)    || ''),
        ctoken:  String((conf.whatsapp && conf.whatsapp.ctoken) || ''),
        phones:  (conf.whatsapp && Array.isArray(conf.whatsapp.phones)) ? conf.whatsapp.phones : []
      }
    };
    PropertiesService.getScriptProperties().setProperty(_KEY_WEBHOOK_CONF, JSON.stringify(payload));
    return JSON.stringify({ ok: '✅ Configuração de webhook salva.' });
  } catch(e) {
    registrarErroSistema('salvarConfWebhook', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

function testarWebhookAlerta(conf) {
  try {
    var msg = '🔔 Teste do sistema de alertas — Devoluções Transben\n'
            + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var erros = _dispararWebhook(conf, msg);
    if (erros.length) return JSON.stringify({ erro: '⚠️ Alguns envios falharam: ' + erros.join(' | ') });
    return JSON.stringify({ ok: '✅ Mensagem de teste enviada com sucesso.' });
  } catch(e) {
    registrarErroSistema('testarWebhookAlerta', e.message || e.toString());
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

/* Lê conf salva e dispara alerta — chamado internamente após enviarEmail de atraso */
function _enviarAlertaWebhook(msg) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF) || '{}';
    var conf = JSON.parse(raw);
    if (!conf || !conf.ativo) return;
    var erros = _dispararWebhook(conf, msg);
    if (erros.length) registrarErroSistema('_enviarAlertaWebhook', erros.join(' | '));
  } catch(e) { registrarErroSistema('_enviarAlertaWebhook', e.message || e.toString()); }
}

/* Envia para todos os destinatários do canal configurado. Retorna lista de erros. */
function _dispararWebhook(conf, msg) {
  var erros = [];
  if (!conf || !conf.ativo) return erros;
  var tipo = conf.tipo || 'telegram';

  if (tipo === 'telegram') {
    var tg = conf.telegram || {};
    var token = (tg.token || '').trim();
    var chats = tg.chatIds || [];
    if (!token || !chats.length) { erros.push('Telegram: token ou chatIds não configurados'); return erros; }
    chats.forEach(function(chatId) {
      try {
        var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ chat_id: String(chatId), text: msg }),
          muteHttpExceptions: true
        });
        var body = JSON.parse(resp.getContentText());
        if (!body.ok) erros.push('Telegram chatId ' + chatId + ': ' + (body.description || 'erro'));
      } catch(e) { erros.push('Telegram chatId ' + chatId + ': ' + e.message); }
    });

  } else if (tipo === 'whatsapp') {
    var wa = conf.whatsapp || {};
    var url    = (wa.url    || '').trim().replace(/\/$/, '');
    var ctoken = (wa.ctoken || '').trim();
    var phones = wa.phones  || [];
    if (!url || !phones.length) { erros.push('WhatsApp: URL ou telefones não configurados'); return erros; }
    var hdrs = { 'Content-Type': 'application/json' };
    if (ctoken) hdrs['Client-Token'] = ctoken;
    phones.forEach(function(phone) {
      try {
        var resp = UrlFetchApp.fetch(url + '/send-text', {
          method: 'post',
          headers: hdrs,
          payload: JSON.stringify({ phone: String(phone), message: msg }),
          muteHttpExceptions: true
        });
        var code = resp.getResponseCode();
        if (code < 200 || code >= 300) {
          erros.push('WhatsApp phone ' + phone + ': HTTP ' + code);
        }
      } catch(e) { erros.push('WhatsApp phone ' + phone + ': ' + e.message); }
    });
  }

  return erros;
}

function enviarEmail(assunto, htmlBody, anexos, tipoAlerta) {
  try {
    var destinatarios = _getEmailsGeral();
    if (!destinatarios || !destinatarios.length) return;
    var opts = {
      to:       destinatarios.join(','),
      subject:  assunto,
      htmlBody: htmlBody
    };
    if (anexos && anexos.length) opts.attachments = anexos;
    if (tipoAlerta) {
      var ccBcc = _getCCBccAlerta(tipoAlerta);
      if (ccBcc.cc)  opts.cc  = ccBcc.cc;
      if (ccBcc.bcc) opts.bcc = ccBcc.bcc;
    }
    MailApp.sendEmail(opts);
  } catch (e) {
    console.error('enviarEmail: ' + e);
  }
}

function _getCCBccAlerta(tipo) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CC_ALERTA);
    if (!raw) return { cc: '', bcc: '' };
    var map = JSON.parse(raw);
    var cfg = map[tipo] || {};
    return { cc: cfg.cc || '', bcc: cfg.bcc || '' };
  } catch(_) { return { cc: '', bcc: '' }; }
}

function obterCCAlerta() {
  _usuarioEhAdmin(true);
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CC_ALERTA) || '{}';
  try { return JSON.stringify({ ccAlerta: JSON.parse(raw) }); }
  catch(_) { return JSON.stringify({ ccAlerta: {} }); }
}

function salvarCCAlerta(tipo, cc, bcc) {
  _usuarioEhAdmin(true);
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CC_ALERTA) || '{}';
  var mapa;
  try { mapa = JSON.parse(raw); } catch(_) { mapa = {}; }
  if (!cc && !bcc) {
    delete mapa[tipo];
  } else {
    mapa[tipo] = { cc: cc.trim(), bcc: bcc.trim() };
  }
  PropertiesService.getScriptProperties().setProperty(_KEY_CC_ALERTA, JSON.stringify(mapa));
  return JSON.stringify({ sucesso: '✅ CC/BCC para "' + tipo + '" salvo.' });
}


// ════════════════════════════════════════════════════════════
//   BUSCA NO HISTÓRICO ARQUIVADO
// ════════════════════════════════════════════════════════════

function abrirBuscaHistorico() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormBuscaHistorico').setWidth(620).setHeight(520),
    '🗂️ Buscar no Histórico Arquivado'
  );
}

function executarBuscaHistorico(params) {
  var termo        = String(params.termo || '').trim().toLowerCase();
  var incluirAtivas = !!params.incluirAtivas;
  if (!termo) return JSON.stringify({ erro: 'Informe um termo para buscar.' });

  var ss         = getSS();
  var resultados = [];
  var tz         = Session.getScriptTimeZone();

  var hist = ss.getSheetByName('Historico_Arquivo');
  if (hist) {
    var ulH = hist.getLastRow();
    if (ulH >= 2) {
      var ncols = Math.min(TOTAL_COLUNAS + 1, hist.getLastColumn());
      hist.getRange(2, 1, ulH - 1, ncols).getValues().forEach(function(l, i) {
        var nfd  = String(l[IDX_NFD]  || '').trim();
        var nf   = String(l[IDX_NF]   || '').trim();
        var forn = String(l[IDX_FORN] || '').trim();
        var desc = String(l[IDX_DESC] || '').trim();
        if (!nf && !nfd) return;
        if ([nf, nfd, forn, desc].every(function(s) {
          return s.toLowerCase().indexOf(termo) === -1;
        })) return;
        var dt       = l[IDX_DATA];
        var dtArq    = l[TOTAL_COLUNAS];
        resultados.push({
          origem:    'Histórico',
          aba:       forn || 'Arquivado',
          nf:        nf,
          nfd:       nfd,
          forn:      forn,
          desc:      desc.substring(0, 55),
          status:    String(l[IDX_STATUS] || ''),
          tipo:      String(l[IDX_TIPO]   || ''),
          qtd:       l[IDX_QTD]  || 0,
          valor:     parseFloat(l[IDX_VL_TOT]) || 0,
          data:      dt instanceof Date
                       ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
          dataArq:   dtArq instanceof Date
                       ? Utilities.formatDate(dtArq, tz, 'dd/MM/yyyy') : '',
          linha:     i + 2,
          navegavel: false
        });
      });
    }
  }

  if (incluirAtivas) {
    ABAS_OPERACIONAIS.forEach(function(nomeAba) {
      var ws = ss.getSheetByName(nomeAba);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
        .forEach(function(l, i) {
          var nfd  = String(l[IDX_NFD]  || '').trim();
          var nf   = String(l[IDX_NF]   || '').trim();
          var forn = String(l[IDX_FORN] || '').trim();
          var desc = String(l[IDX_DESC] || '').trim();
          if (!nf && !nfd) return;
          if ([nf, nfd, forn, desc].every(function(s) {
            return s.toLowerCase().indexOf(termo) === -1;
          })) return;
          var dt = l[IDX_DATA];
          resultados.push({
            origem:    'Ativo',
            aba:       nomeAba,
            nf:        nf,
            nfd:       nfd,
            forn:      forn,
            desc:      desc.substring(0, 55),
            status:    String(l[IDX_STATUS] || ''),
            tipo:      String(l[IDX_TIPO]   || ''),
            qtd:       l[IDX_QTD]  || 0,
            valor:     parseFloat(l[IDX_VL_TOT]) || 0,
            data:      dt instanceof Date
                         ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
            dataArq:   '',
            linha:     LINHA_DADOS + i,
            navegavel: true
          });
        });
    });
  }

  if (!resultados.length)
    return JSON.stringify({ erro: 'Nenhum resultado encontrado para "' + termo + '".' });

  resultados.sort(function(a, b) {
    if (a.origem !== b.origem) return a.origem === 'Ativo' ? -1 : 1;
    return (b.data || '').localeCompare(a.data || '');
  });

  return JSON.stringify({ resultados: resultados, total: resultados.length });
}


// ════════════════════════════════════════════════════════════
//   RELATÓRIOS (MENSAL / SEMANAL / DIÁRIO)
// ════════════════════════════════════════════════════════════

function abrirRelatorios() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormRelatorios').setWidth(480).setHeight(400),
    '📊 Relatórios de Devoluções'
  );
}

// ─── MENSAL ──────────────────────────────────────────────────

function gerarRelatorioMensal(params) {
  var mes = parseInt(params.mes, 10);
  var ano = parseInt(params.ano, 10);
  var enviarEmailFlag = !!params.enviarEmail;

  if (!mes || !ano || mes < 1 || mes > 12)
    return JSON.stringify({ erro: 'Mês ou ano inválido.' });
  if (!ID_PASTA_DESTINO || ID_PASTA_DESTINO.startsWith('INSIRA'))
    return JSON.stringify({ erro: 'Configure ID_PASTA_DESTINO no topo do script.' });

  var ss      = getSS();
  var tz      = ss.getSpreadsheetTimeZone();
  var dataIni = new Date(ano, mes - 1, 1);
  var dataFim = new Date(ano, mes, 0, 23, 59, 59);
  var nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes - 1];
  var periodo = nomeMes + ' / ' + ano;

  var linhas = _coletarLinhas(ss, tz, dataIni, dataFim);
  if (!linhas.length)
    return JSON.stringify({ erro: 'Nenhum lançamento encontrado para ' + periodo + '.' });

  var acc     = _acumular(linhas);
  var nomeArq = 'Relatorio_Mensal_' + nomeMes + '_' + ano + '.pdf';
  var pdf     = _gerarRelatorioPDF(ss, { titulo: 'RELATÓRIO MENSAL DE DEVOLUÇÕES', periodo: periodo, linhas: linhas, acc: acc, nomeArq: nomeArq });

  if (!pdf) return JSON.stringify({ erro: '❌ Erro ao gerar o PDF. Verifique o log.' });

  if (enviarEmailFlag) {
    var htmlEmail = _montarHtmlRelatorio({ icone: '📊', titulo: 'Relatório Mensal de Devoluções', subtitulo: periodo,
      intro: 'Segue em anexo o relatório mensal referente a <strong>' + periodo + '</strong>.', kpis: _kpisEmail(acc) });
    enviarEmail('📊 Relatório Mensal de Devoluções — ' + periodo, htmlEmail, [pdf.blob], 'mensal');
    registrarLog(ss, 'SISTEMA', 0, 0, '', periodo, '📊 Relatório mensal gerado e enviado — ' + periodo);
  } else {
    registrarLog(ss, 'SISTEMA', 0, 0, '', periodo, '📊 Relatório mensal gerado — ' + periodo);
  }

  return JSON.stringify({
    sucesso: '✅ Relatório de ' + periodo + ' gerado!\n' +
             linhas.length + ' lançamento(s) — R$ ' + _fmtVal(acc.vTotal) +
             (enviarEmailFlag ? '\n📧 Enviado por e-mail.' : ''),
    urlPdf: pdf.arquivo.getUrl()
  });
}

// ─── SEMANAL ─────────────────────────────────────────────────

function gerarRelatorioSemanal(params) {
  if (!ID_PASTA_DESTINO || ID_PASTA_DESTINO.startsWith('INSIRA'))
    return JSON.stringify({ erro: 'Configure ID_PASTA_DESTINO no topo do script.' });

  var ss   = getSS();
  var tz   = ss.getSpreadsheetTimeZone();
  var hoje = new Date();
  var enviarEmailFlag = !!params.enviarEmail;
  var dataIni, dataFim, periodoLabel;
  var modo = params.modo || 'ultimos7';

  if (modo === 'personalizado') {
    dataIni = _parseDateStr(params.dataIni);
    dataFim = _parseDateStr(params.dataFim, true);
    if (!dataIni || !dataFim) return JSON.stringify({ erro: 'Datas inválidas.' });
    periodoLabel = _fmtDt(dataIni, tz) + ' a ' + _fmtDt(dataFim, tz);
  } else if (modo === 'semana_corrente') {
    var dia = hoje.getDay();
    var diffSeg = (dia === 0) ? -6 : 1 - dia;
    dataIni = new Date(hoje); dataIni.setDate(hoje.getDate() + diffSeg);
    dataIni.setHours(0, 0, 0, 0);
    dataFim = new Date(dataIni); dataFim.setDate(dataIni.getDate() + 6);
    dataFim.setHours(23, 59, 59, 999);
    periodoLabel = 'Semana ' + _fmtDt(dataIni, tz) + ' – ' + _fmtDt(dataFim, tz);
  } else if (modo === 'semana_anterior') {
    var dia2 = hoje.getDay();
    var diffSeg2 = (dia2 === 0) ? -6 : 1 - dia2;
    dataFim = new Date(hoje); dataFim.setDate(hoje.getDate() + diffSeg2 - 1);
    dataFim.setHours(23, 59, 59, 999);
    dataIni = new Date(dataFim); dataIni.setDate(dataFim.getDate() - 6);
    dataIni.setHours(0, 0, 0, 0);
    periodoLabel = 'Semana ' + _fmtDt(dataIni, tz) + ' – ' + _fmtDt(dataFim, tz);
  } else {
    dataFim = new Date(hoje); dataFim.setHours(23, 59, 59, 999);
    dataIni = new Date(hoje); dataIni.setDate(hoje.getDate() - 6);
    dataIni.setHours(0, 0, 0, 0);
    periodoLabel = 'Últimos 7 dias — até ' + _fmtDt(dataFim, tz);
  }

  var linhas = _coletarLinhas(ss, tz, dataIni, dataFim);
  if (!linhas.length)
    return JSON.stringify({ erro: 'Nenhum lançamento encontrado para o período selecionado.' });

  var acc     = _acumular(linhas);
  var nomeArq = 'Relatorio_Semanal_' + Utilities.formatDate(dataIni, tz, 'dd-MM-yyyy') +
                '_a_' + Utilities.formatDate(dataFim, tz, 'dd-MM-yyyy') + '.pdf';
  var pdf     = _gerarRelatorioPDF(ss, { titulo: 'RELATÓRIO SEMANAL DE DEVOLUÇÕES', periodo: periodoLabel, linhas: linhas, acc: acc, nomeArq: nomeArq });

  if (!pdf) return JSON.stringify({ erro: '❌ Erro ao gerar o PDF. Verifique o log.' });

  if (enviarEmailFlag) {
    var htmlEmail = _montarHtmlRelatorio({ icone: '📊', titulo: 'Relatório Semanal de Devoluções', subtitulo: periodoLabel,
      intro: 'Segue em anexo o relatório semanal referente a <strong>' + periodoLabel + '</strong>.', kpis: _kpisEmail(acc) });
    enviarEmail('📊 Relatório Semanal de Devoluções — ' + periodoLabel, htmlEmail, [pdf.blob], 'semanal');
    registrarLog(ss, 'SISTEMA', 0, 0, '', linhas.length + ' itens', '📊 Relatório semanal gerado e enviado — ' + periodoLabel);
  } else {
    registrarLog(ss, 'SISTEMA', 0, 0, '', linhas.length + ' itens', '📊 Relatório semanal gerado — ' + periodoLabel);
  }

  return JSON.stringify({
    sucesso: '✅ Relatório semanal gerado!\n' +
             linhas.length + ' lançamento(s) — R$ ' + _fmtVal(acc.vTotal) +
             (enviarEmailFlag ? '\n📧 Enviado por e-mail.' : ''),
    urlPdf: pdf.arquivo.getUrl()
  });
}

/** Compatibilidade com trigger semanal automático. */
function enviarResumoSemanal() {
  var r = gerarRelatorioSemanal({ modo: 'ultimos7', enviarEmail: true });
  var obj = JSON.parse(r);
  if (obj.erro) console.error('enviarResumoSemanal: ' + obj.erro);
}

// ─── DIÁRIO ──────────────────────────────────────────────────

function gerarRelatorioDiario(params) {
  if (!ID_PASTA_DESTINO || ID_PASTA_DESTINO.startsWith('INSIRA'))
    return JSON.stringify({ erro: 'Configure ID_PASTA_DESTINO no topo do script.' });

  var ss  = getSS();
  var tz  = ss.getSpreadsheetTimeZone();
  var enviarEmailFlag = !!params.enviarEmail;

  var dataIni = _parseDateStr(params.data);
  if (!dataIni) return JSON.stringify({ erro: 'Data inválida.' });
  var dataFim = new Date(dataIni);
  dataFim.setHours(23, 59, 59, 999);

  var periodoLabel = _fmtDt(dataIni, tz);
  var linhas = _coletarLinhas(ss, tz, dataIni, dataFim);
  if (!linhas.length)
    return JSON.stringify({ erro: 'Nenhum lançamento encontrado para ' + periodoLabel + '.' });

  var acc     = _acumular(linhas);
  var nomeArq = 'Relatorio_Diario_' + Utilities.formatDate(dataIni, tz, 'dd-MM-yyyy') + '.pdf';
  var pdf     = _gerarRelatorioPDF(ss, { titulo: 'RELATÓRIO DIÁRIO DE DEVOLUÇÕES', periodo: periodoLabel, linhas: linhas, acc: acc, nomeArq: nomeArq });

  if (!pdf) return JSON.stringify({ erro: '❌ Erro ao gerar o PDF. Verifique o log.' });

  if (enviarEmailFlag) {
    var htmlEmail = _montarHtmlRelatorio({ icone: '📋', titulo: 'Relatório Diário de Devoluções', subtitulo: periodoLabel,
      intro: 'Segue em anexo o relatório diário referente a <strong>' + periodoLabel + '</strong>.', kpis: _kpisEmail(acc) });
    enviarEmail('📋 Relatório Diário de Devoluções — ' + periodoLabel, htmlEmail, [pdf.blob], 'diario');
    registrarLog(ss, 'SISTEMA', 0, 0, '', linhas.length + ' itens', '📋 Relatório diário gerado e enviado — ' + periodoLabel);
  } else {
    registrarLog(ss, 'SISTEMA', 0, 0, '', linhas.length + ' itens', '📋 Relatório diário gerado — ' + periodoLabel);
  }

  return JSON.stringify({
    sucesso: '✅ Relatório diário de ' + periodoLabel + ' gerado!\n' +
             linhas.length + ' lançamento(s) — R$ ' + _fmtVal(acc.vTotal) +
             (enviarEmailFlag ? '\n📧 Enviado por e-mail.' : ''),
    urlPdf: pdf.arquivo.getUrl()
  });
}

// ─── HELPERS DE COLETA ───────────────────────────────────────

/**
 * Extrai a data de resolução da coluna Obs ("Devolvido em: dd/MM/yyyy ..."
 * ou "Enviado para o Fábio em: dd/MM/yyyy ..."). Retorna Date ou null.
 */
function _extrairDataResolucao(obs) {
  var m = String(obs || '').match(/em:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

/**
 * Coleta linhas dentro de [dataIni, dataFim] varrendo:
 * 1. Abas operacionais (itens ainda ativos/pendentes)
 * 2. Historico_Arquivo (itens já arquivados — Devolvido/Venda)
 * Entra no relatório se a DATA DE ENTRADA (col 3) OU a DATA DE
 * RESOLUÇÃO (Obs "... em: dd/MM/yyyy"; no histórico, fallback para
 * "Arquivado em") estiver dentro do período. Assim itens devolvidos ou
 * vendidos na semana aparecem mesmo que tenham entrado antes.
 */
function _coletarLinhas(ss, tz, dataIni, dataFim) {
  var linhas = [];

  function _dentroPeriodo(dt) {
    return dt instanceof Date && dt >= dataIni && dt <= dataFim;
  }

  function _incluir(l, fornPadrao, dtArquivado) {
    var nf = l[IDX_NF], dt = l[IDX_DATA];
    if (!nf) return;
    var st = String(l[IDX_STATUS] || '');
    var dtRes = null;
    if (st === 'Devolvido' || st === 'Venda') {
      dtRes = _extrairDataResolucao(l[IDX_OBS]);
      if (!dtRes && dtArquivado instanceof Date) dtRes = dtArquivado;
    }
    if (!_dentroPeriodo(dt) && !_dentroPeriodo(dtRes)) return;
    linhas.push({
      nfd:  String(l[IDX_NFD]  || '').trim(),
      nf:   String(nf).trim(),
      data: dt instanceof Date ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
      forn: String(l[IDX_FORN] || fornPadrao).trim(),
      tipo: String(l[IDX_TIPO] || '').trim(),
      desc: String(l[IDX_DESC] || '').trim(),
      qtd:  l[IDX_QTD] || 0,
      val:  parseFloat(l[IDX_VL_TOT]) || 0,
      st:   st
    });
  }

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l) { _incluir(l, nomeAba, null); });
  });

  var hist = ss.getSheetByName('Historico_Arquivo');
  if (hist && hist.getLastRow() >= 2) {
    var ulH  = hist.getLastRow();
    var cols = Math.min(TOTAL_COLUNAS + 1, hist.getLastColumn());
    hist.getRange(2, 1, ulH - 1, cols).getValues()
      .forEach(function(l) {
        var dtArq = cols > TOTAL_COLUNAS ? l[TOTAL_COLUNAS] : null;
        _incluir(l, '', dtArq);
      });
  }

  return linhas;
}

// ─── PDF DE RELATÓRIO ─────────────────────────────────────────

/**
 * Gera PDF do relatório com layout completo:
 *   1. Cabeçalho  2. KPIs  3. Resumo por fornecedor
 *   4. Listagem detalhada  5. Rodapé
 */
function _gerarRelatorioPDF(ss, params) {
  var tz = ss.getSpreadsheetTimeZone();
  var ssTemp;
  try {
    ssTemp = SpreadsheetApp.create('_Rel_Temp_' + new Date().getTime());
    var sh = ssTemp.getSheets()[0];

    var AZUL_ESC  = '#1A3557';
    var AZUL_SUB  = '#243F63';
    var CINZA_BG  = '#F8F9FA';
    var BRANCO    = '#FFFFFF';
    var corStatus = { 'Pendente': '#EBF3FF', 'Devolvido': '#ECFDF5', 'Venda': '#FFF7ED' };
    var corTipo   = { 'Avaria': '#FFF3E0', 'Falta': '#E3F2FD', 'Rejeição': '#FEF2F2' };

    var nCols    = 9;
    var larguras = [70, 75, 80, 140, 65, 70, 210, 50, 80];
    if (params.colExtra) { nCols = 10; larguras.push(70); }
    larguras.forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });

    var acc  = params.acc || _acumular(params.linhas);
    var taxa = acc.taxa;
    var rl   = 1;

    // ── Cabeçalho ─────────────────────────────────────────
    sh.setRowHeight(rl, 46);
    sh.getRange(rl, 1, 1, nCols).merge()
      .setValue(params.titulo + (params.periodo ? ' — ' + params.periodo.toUpperCase() : ''))
      .setBackground(AZUL_ESC).setFontColor(BRANCO)
      .setFontWeight('bold').setFontSize(12)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    rl++;

    sh.setRowHeight(rl, 20);
    sh.getRange(rl, 1, 1, nCols).merge()
      .setValue('Emitido em: ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm') +
                '   |   Total de lançamentos no período: ' + params.linhas.length)
      .setBackground(AZUL_SUB).setFontColor('#93B4D4')
      .setFontSize(8).setFontStyle('italic')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    rl++;

    // ── KPIs ─────────────────────────────────────────────
    sh.setRowHeight(rl, 6);
    sh.getRange(rl, 1, 1, nCols).setBackground(CINZA_BG);
    rl++;

    var kpiDefs = [
      { label: 'PENDENTES',      cor: '#2563EB', st: 'Pendente',  qtd: acc.tP, val: acc.vP },
      { label: 'DEVOLVIDOS',     cor: '#059669', st: 'Devolvido', qtd: acc.tD, val: acc.vD },
      { label: 'VENDAS',         cor: '#D97706', st: 'Venda',     qtd: acc.tV, val: acc.vV },
      { label: 'TOTAL',          cor: '#7C3AED', st: null,        qtd: params.linhas.length, val: acc.vTotal },
      { label: 'TAXA RESOLUÇÃO', cor: taxa >= 70 ? '#059669' : taxa >= 40 ? '#D97706' : '#DC2626',
        st: 'taxa', qtd: taxa, val: -1 }
    ];

    var kpiSpans, kpiStarts;
    if (nCols === 9) {
      kpiSpans  = [2, 2, 2, 2, 1];
      kpiStarts = [1, 3, 5, 7, 9];
    } else {
      kpiSpans  = [2, 2, 2, 2, 2];
      kpiStarts = [1, 3, 5, 7, 9];
    }

    sh.setRowHeight(rl, 15);
    kpiDefs.forEach(function(k, ki) {
      sh.getRange(rl, kpiStarts[ki], 1, kpiSpans[ki]).merge()
        .setValue(k.label)
        .setBackground(k.cor).setFontColor(BRANCO)
        .setFontWeight('bold').setFontSize(7)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    });
    rl++;

    sh.setRowHeight(rl, 28);
    kpiDefs.forEach(function(k, ki) {
      var txt = (k.st === 'taxa') ? k.qtd + '%' : k.qtd + ' itens\nR$ ' + _fmtVal(k.val);
      sh.getRange(rl, kpiStarts[ki], 1, kpiSpans[ki]).merge()
        .setValue(txt)
        .setFontColor(k.cor).setFontWeight('bold').setFontSize(9)
        .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
    });
    rl++;

    sh.setRowHeight(rl, 6);
    sh.getRange(rl, 1, 1, nCols).setBackground(CINZA_BG);
    rl++;

    // ── Resumo por fornecedor ─────────────────────────────
    var fornMap = {};
    params.linhas.forEach(function(l) {
      var f = l.forn || '(sem fornecedor)';
      if (!fornMap[f]) fornMap[f] = { tP:0,tD:0,tV:0, vP:0,vD:0,vV:0, total:0, vTotal:0 };
      var m = fornMap[f];
      m.total++;  m.vTotal += l.val;
      if      (l.st === 'Pendente')  { m.tP++; m.vP += l.val; }
      else if (l.st === 'Devolvido') { m.tD++; m.vD += l.val; }
      else if (l.st === 'Venda')     { m.tV++; m.vV += l.val; }
    });
    var fornKeys = Object.keys(fornMap);

    sh.setRowHeight(rl, 16);
    sh.getRange(rl, 1, 1, nCols).merge()
      .setValue('RESUMO POR FORNECEDOR')
      .setBackground('#1A3557').setFontWeight('bold').setFontSize(9).setFontColor(BRANCO)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    rl++;

    var hForn = ['Fornecedor','Pendentes','Vl Pendente','Devolvidos','Vl Devolvido','Vendas','Vl Venda','Total','Vl Total'];
    sh.setRowHeight(rl, 16);
    sh.getRange(rl, 1, 1, 9).setValues([hForn])
      .setBackground('#1A3557').setFontWeight('bold').setFontSize(8).setFontColor(BRANCO)
      .setHorizontalAlignment('center');
    sh.getRange(rl, 1).setHorizontalAlignment('left');
    rl++;

    var fornRows = fornKeys.map(function(f) {
      var m = fornMap[f];
      return [f, m.tP, 'R$ '+_fmtVal(m.vP), m.tD, 'R$ '+_fmtVal(m.vD),
              m.tV, 'R$ '+_fmtVal(m.vV), m.total, 'R$ '+_fmtVal(m.vTotal)];
    });
    fornRows.push([
      'TOTAL GERAL',
      acc.tP, 'R$ '+_fmtVal(acc.vP),
      acc.tD, 'R$ '+_fmtVal(acc.vD),
      acc.tV, 'R$ '+_fmtVal(acc.vV),
      params.linhas.length, 'R$ '+_fmtVal(acc.vTotal)
    ]);

    if (fornRows.length) {
      sh.getRange(rl, 1, fornRows.length, 9).setValues(fornRows).setFontSize(8)
        .setHorizontalAlignment('center');
      sh.getRange(rl, 1, fornRows.length, 1).setHorizontalAlignment('left');
      sh.getRange(rl + fornRows.length - 1, 1, 1, 9)
        .setFontWeight('bold').setBackground('#E8EDF3');
      for (var fi = 0; fi < fornRows.length - 1; fi++) {
        if (fi % 2 === 1) sh.getRange(rl + fi, 1, 1, 9).setBackground('#F5F7FA');
      }
      rl += fornRows.length;
    }

    sh.setRowHeight(rl, 6);
    sh.getRange(rl, 1, 1, nCols).setBackground(CINZA_BG);
    rl++;

    // ── Listagem detalhada ────────────────────────────────
    sh.setRowHeight(rl, 16);
    sh.getRange(rl, 1, 1, nCols).merge()
      .setValue('LISTAGEM DETALHADA — ' + params.linhas.length + ' LANÇAMENTO(S)')
      .setBackground('#1A3557').setFontWeight('bold').setFontSize(9).setFontColor(BRANCO)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    rl++;

    var headers = ['NFD', 'Nº NF', 'Data', 'Fornecedor', 'Tipo', 'Status', 'Descrição', 'Qtd', 'Valor (R$)'];
    if (params.colExtra) headers.push(params.colExtra.header);

    sh.setRowHeight(rl, 15);
    sh.getRange(rl, 1, 1, nCols).setValues([headers])
      .setBackground('#1A3557').setFontWeight('bold').setFontSize(8).setFontColor(BRANCO)
      .setHorizontalAlignment('center');
    sh.getRange(rl, 7).setHorizontalAlignment('left');
    rl++;

    if (params.linhas.length) {
      var vals = params.linhas.map(function(it) {
        var row = [it.nfd || '', it.nf, it.data, it.forn, it.tipo,
                   it.st || '', it.desc, it.qtd || '', _fmtVal(it.val)];
        if (params.colExtra) row.push(params.colExtra.fn(it));
        return row;
      });
      sh.getRange(rl, 1, vals.length, nCols).setValues(vals).setFontSize(8)
        .setHorizontalAlignment('center');
      sh.getRange(rl, 7, vals.length, 1).setHorizontalAlignment('left');

      // [P25] Cores em batch
      var bgStatus = params.linhas.map(function(it) {
        return Array(nCols).fill(corStatus[it.st] || BRANCO);
      });
      sh.getRange(rl, 1, vals.length, nCols).setBackgrounds(bgStatus);
      var bgTipo = params.linhas.map(function(it) { return [corTipo[it.tipo] || BRANCO]; });
      sh.getRange(rl, 5, vals.length, 1).setBackgrounds(bgTipo);
      rl += vals.length;
    }

    // ── Rodapé ────────────────────────────────────────────
    sh.setRowHeight(rl, 6); rl++;
    sh.setRowHeight(rl, 14);
    sh.getRange(rl, 1, 1, nCols).merge()
      .setValue('Relatório gerado automaticamente pelo Sistema de Controle de Devoluções.')
      .setFontColor('#9CA3AF').setFontSize(7).setFontStyle('italic')
      .setHorizontalAlignment('center');

    SpreadsheetApp.flush();

    var exportUrl = ssTemp.getUrl().replace(/\/edit.*$/, '') +
      '/export?exportFormat=pdf&format=pdf&size=A4&portrait=false' +
      '&fitw=true&sheetnames=false&printtitle=false&pagenumbers=false&gridlines=false&fzr=false';

    // [P26] pdfBlob reutilizado em memória
    var pdfBlob = UrlFetchApp.fetch(exportUrl, {
      headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    }).getBlob().setName(params.nomeArq);

    var arquivo = DriveApp.getFolderById(ID_PASTA_DESTINO).createFile(pdfBlob);
    DriveApp.getFileById(ssTemp.getId()).setTrashed(true);
    return { arquivo: arquivo, blob: pdfBlob };

  } catch(e) {
    console.error('_gerarRelatorioPDF: ' + e);
    registrarErroSistema('_gerarRelatorioPDF', e.message || e.toString());
    try { if (ssTemp) DriveApp.getFileById(ssTemp.getId()).setTrashed(true); } catch(_) {}
    return null;
  }
}

/** Monta o HTML padrão dos e-mails de relatório. */
function _montarHtmlRelatorio(params) {
  var kpiCells = (params.kpis || []).map(function(k) {
    return '<td style="width:' + Math.floor(100 / params.kpis.length) + '%;padding:12px 8px;' +
           'text-align:center;vertical-align:top">' +
      '<div style="background:' + k.cor + ';color:#fff;border-radius:6px 6px 0 0;' +
           'padding:5px 4px;font-size:9px;font-weight:bold;letter-spacing:.5px">' + _esc(k.label) + '</div>' +
      '<div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 6px 6px;padding:8px 4px;background:#fff">' +
      '<div style="font-size:18px;font-weight:bold;color:' + k.cor + '">' + _esc(k.valor) + '</div>' +
      '<div style="font-size:10px;color:#6B7280;margin-top:2px">' + _esc(k.sub) + '</div>' +
      '</div></td>';
  }).join('');

  return '<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">' +
    '<div style="background:#1A3557;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0;font-size:17px;font-weight:bold">' + _esc(params.icone) + ' ' + _esc(params.titulo) + '</h2>' +
    '<p style="margin:5px 0 0;font-size:11px;opacity:.75">' + _esc(params.subtitulo) + '</p>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #E5E7EB;border-top:none;' +
         'padding:18px 22px;border-radius:0 0 8px 8px">' +
    '<p style="margin:0 0 16px;font-size:13px;color:#374151">' + (params.intro || '') + '</p>' +
    (kpiCells ? '<table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:16px">' +
      '<tr>' + kpiCells + '</tr></table>' : '') +
    '<p style="margin:0;font-size:11px;color:#9CA3AF;border-top:1px solid #F3F4F6;' +
         'padding-top:12px">Gerado automaticamente pelo Sistema de Controle de Devoluções.' +
         ' O relatório completo está em anexo.</p>' +
    '</div></div>';
}


// ════════════════════════════════════════════════════════════
//   RELATÓRIO DE PENDENTES
// ════════════════════════════════════════════════════════════

function gerarRelatorioPendentes(params) {
  if (!ID_PASTA_DESTINO || ID_PASTA_DESTINO.startsWith('INSIRA'))
    return JSON.stringify({ erro: 'Configure ID_PASTA_DESTINO no topo do script.' });

  var ss   = getSS();
  var tz   = ss.getSpreadsheetTimeZone();
  var hoje = new Date();
  var linhas = [];

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) return;
    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) return;
    ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues()
      .forEach(function(l) {
        if (!l[IDX_NF] || l[IDX_STATUS] !== 'Pendente') return;
        var dt   = l[IDX_DATA];
        var dias = (dt instanceof Date && !isNaN(dt))
                   ? Math.floor((hoje - dt) / 864e5) : 0;
        linhas.push({
          nfd:  String(l[IDX_NFD]  || '').trim(),
          nf:   String(l[IDX_NF]   || '').trim(),
          data: (dt instanceof Date && !isNaN(dt))
                ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : '',
          forn: String(l[IDX_FORN] || nomeAba).trim(),
          tipo: String(l[IDX_TIPO] || '').trim(),
          desc: String(l[IDX_DESC] || '').trim(),
          qtd:  l[IDX_QTD]  || 0,
          val:  parseFloat(l[IDX_VL_TOT]) || 0,
          st:   'Pendente',
          dias: dias
        });
      });
  });

  linhas.sort(function(a, b) { return b.dias - a.dias; });

  if (!linhas.length)
    return JSON.stringify({ erro: 'Nenhum item Pendente encontrado nas abas.' });

  var acc      = _acumular(linhas);
  var dataStr  = Utilities.formatDate(hoje, tz, 'dd/MM/yyyy');
  var nomeArq  = 'Relatorio_Pendentes_' + dataStr.replace(/\//g, '-') + '.pdf';

  var pdf;
  try {
    pdf = _gerarRelatorioPDF(ss, {
      titulo:   'RELATÓRIO DE PENDÊNCIAS EM ABERTO',
      periodo:  dataStr,
      linhas:   linhas,
      acc:      acc,
      nomeArq:  nomeArq,
      colExtra: { header: 'Em aberto', fn: function(it) {
        return it.dias > 0 ? it.dias + ' dias' : 'Hoje';
      }}
    });
  } catch (ePdf) {
    registrarLog(ss, 'SISTEMA', 0, 0, '', '', '❌ Erro PDF pendentes: ' + ePdf.toString());
    return JSON.stringify({ erro: '❌ Erro ao gerar PDF: ' + ePdf.toString() });
  }

  if (!pdf)
    return JSON.stringify({ erro: '❌ Erro ao gerar o PDF. Verifique o log do Apps Script para detalhes.' });

  if (params && params.enviarEmail) {
    try {
      var htmlEmail = _montarHtmlRelatorio({
        icone:     '⏳',
        titulo:    'Pendências em Aberto',
        subtitulo: dataStr,
        intro:     'Snapshot de todos os itens atualmente <strong>Pendentes</strong>, ordenados por antiguidade.',
        kpis: [
          { label: 'Total Pendente', cor: '#2563EB',
            valor: linhas.length + ' itens', sub: 'R$ ' + _fmtVal(acc.vP) },
          { label: 'Valor em Aberto', cor: '#DC2626',
            valor: 'R$ ' + _fmtVal(acc.vP), sub: 'a receber/resolver' }
        ]
      });
      enviarEmail('⏳ Relatório de Pendências — ' + dataStr, htmlEmail, [pdf.blob], 'pendencias');
    } catch (eMail) {
      console.error('gerarRelatorioPendentes — e-mail: ' + eMail);
      registrarErroSistema('gerarRelatorioPendentes.email', eMail.message || eMail.toString());
    }
  }

  registrarLog(ss, 'SISTEMA', 0, 0, '', linhas.length + ' itens',
    '⏳ Relatório pendentes gerado — ' + dataStr);

  return JSON.stringify({
    sucesso: '✅ Relatório de pendentes gerado!\n' +
             linhas.length + ' item(ns) em aberto — R$ ' + _fmtVal(acc.vP) +
             (params && params.enviarEmail ? '\n📧 Enviado por e-mail.' : ''),
    urlPdf: pdf.arquivo.getUrl()
  });
}

// ════════════════════════════════════════════════════════════
//   RELATÓRIO POR FORNECEDOR
//   Adicionar no Código.gs logo após gerarRelatorioPendentes()
//   (após a linha que fecha a função com `}` na linha ~3445)
// ════════════════════════════════════════════════════════════

/**
 * Retorna lista de fornecedores presentes na aba "Fornecedores Variados".
 * Chamada pelo FormRelatorios.html via google.script.run.listarFornecedoresVariados()
 */
function listarFornecedoresVariados() {
  try {
    var ss = getSS();
    var ws = ss.getSheetByName('Fornecedores Variados');

    if (!ws) {
      return JSON.stringify({ variados: [], erro: 'Aba "Fornecedores Variados" não encontrada.' });
    }

    var ul = obterUltimaLinhaDados(ws);
    if (ul < LINHA_DADOS) {
      return JSON.stringify({ variados: [] });
    }

    var valores = ws.getRange(LINHA_DADOS, COL_FORN, ul - LINHA_DADOS + 1, 1).getValues();
    var vistos  = {};
    var lista   = [];

    valores.forEach(function(row) {
      var nome = String(row[0] || '').trim();
      if (nome && !vistos[nome]) {
        vistos[nome] = true;
        lista.push(nome);
      }
    });

    lista.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });

    return JSON.stringify({ variados: lista });

  } catch (e) {
    return JSON.stringify({ variados: [], erro: e.toString() });
  }
}

/**
 * Gera relatório PDF filtrado por fornecedor específico (ou todos) e período.
 * Chamada pelo FormRelatorios.html via google.script.run.gerarRelatorioPorFornecedor(params)
 *
 * params: {
 *   fornecedor:   string — nome do fornecedor ou 'TODOS'
 *   dataIni:      string — 'YYYY-MM-DD'
 *   dataFim:      string — 'YYYY-MM-DD'
 *   enviarEmail:  boolean
 * }
 */
function gerarRelatorioPorFornecedor(params) {
  if (!ID_PASTA_DESTINO || ID_PASTA_DESTINO.startsWith('INSIRA'))
    return JSON.stringify({ erro: 'Configure ID_PASTA_DESTINO no topo do script.' });

  var ss   = getSS();
  var tz   = ss.getSpreadsheetTimeZone();
  var enviarEmailFlag = !!params.enviarEmail;

  var fornFiltro = String(params.fornecedor || '').trim();
  if (!fornFiltro)
    return JSON.stringify({ erro: 'Selecione um fornecedor.' });

  var dataIni = _parseDateStr(params.dataIni);
  var dataFim = _parseDateStr(params.dataFim, true);
  if (!dataIni || !dataFim)
    return JSON.stringify({ erro: 'Datas inválidas.' });

  var periodoLabel = _fmtDt(dataIni, tz) + ' a ' + _fmtDt(dataFim, tz);
  var titulo, nomeArq;

  // Coleta todas as linhas do período
  var todasLinhas = _coletarLinhas(ss, tz, dataIni, dataFim);

  // Filtra por fornecedor (se não for TODOS)
  var linhas;
  if (fornFiltro === 'TODOS') {
    linhas  = todasLinhas;
    titulo  = 'RELATÓRIO DE DEVOLUÇÕES — TODOS OS FORNECEDORES';
    nomeArq = 'Relatorio_Fornecedor_TODOS_' +
              Utilities.formatDate(dataIni, tz, 'dd-MM-yyyy') + '_a_' +
              Utilities.formatDate(dataFim, tz, 'dd-MM-yyyy') + '.pdf';
  } else {
    var fornLower = fornFiltro.toLowerCase();
    linhas = todasLinhas.filter(function(l) {
      return l.forn.toLowerCase() === fornLower;
    });
    titulo  = 'RELATÓRIO DE DEVOLUÇÕES — ' + fornFiltro.toUpperCase();
    nomeArq = 'Relatorio_Fornecedor_' +
              fornFiltro.replace(/[^a-zA-Z0-9]/g, '_') + '_' +
              Utilities.formatDate(dataIni, tz, 'dd-MM-yyyy') + '_a_' +
              Utilities.formatDate(dataFim, tz, 'dd-MM-yyyy') + '.pdf';
  }

  if (!linhas.length) {
    var msg = fornFiltro === 'TODOS'
      ? 'Nenhum lançamento encontrado para o período ' + periodoLabel + '.'
      : 'Nenhum lançamento de "' + fornFiltro + '" encontrado para ' + periodoLabel + '.';
    return JSON.stringify({ erro: msg });
  }

  var acc = _acumular(linhas);

  var pdf;
  try {
    pdf = _gerarRelatorioPDF(ss, {
      titulo:  titulo,
      periodo: periodoLabel,
      linhas:  linhas,
      acc:     acc,
      nomeArq: nomeArq
    });
  } catch (ePdf) {
    registrarLog(ss, 'SISTEMA', 0, 0, '', '', '❌ Erro PDF fornecedor: ' + ePdf.toString());
    return JSON.stringify({ erro: '❌ Erro ao gerar PDF: ' + ePdf.toString() });
  }

  if (!pdf)
    return JSON.stringify({ erro: '❌ Erro ao gerar o PDF. Verifique o log do Apps Script.' });

  if (enviarEmailFlag) {
    try {
      var htmlEmail = _montarHtmlRelatorio({
        icone:    '🏭',
        titulo:   'Relatório por Fornecedor — ' + (fornFiltro === 'TODOS' ? 'Todos' : fornFiltro),
        subtitulo: periodoLabel,
        intro:    'Segue em anexo o relatório de devoluções de <strong>' +
                  (fornFiltro === 'TODOS' ? 'todos os fornecedores' : fornFiltro) +
                  '</strong> referente ao período <strong>' + periodoLabel + '</strong>.',
        kpis:     _kpisEmail(acc)
      });
      enviarEmail(
        '🏭 Relatório por Fornecedor — ' +
        (fornFiltro === 'TODOS' ? 'Todos' : fornFiltro) + ' — ' + periodoLabel,
        htmlEmail,
        [pdf.blob],
        'fornecedor'
      );
      registrarLog(ss, 'SISTEMA', 0, 0, '', fornFiltro,
        '🏭 Relatório por fornecedor gerado e enviado — ' + fornFiltro + ' — ' + periodoLabel);
    } catch (eEmail) {
      // PDF gerado com sucesso; apenas avisa falha no e-mail
      return JSON.stringify({
        sucesso: '✅ PDF gerado, mas falha ao enviar e-mail: ' + eEmail.message,
        urlPdf: pdf.arquivo.getUrl()
      });
    }
  } else {
    registrarLog(ss, 'SISTEMA', 0, 0, '', fornFiltro,
      '🏭 Relatório por fornecedor gerado — ' + fornFiltro + ' — ' + periodoLabel);
  }

  return JSON.stringify({
    sucesso: '✅ Relatório de ' + (fornFiltro === 'TODOS' ? 'todos os fornecedores' : '"' + fornFiltro + '"') +
             ' gerado!\n' + linhas.length + ' lançamento(s) — R$ ' + _fmtVal(acc.vTotal) +
             (enviarEmailFlag ? '\n📧 Enviado por e-mail.' : ''),
    urlPdf: pdf.arquivo.getUrl()
  });
}

// ════════════════════════════════════════════════════════════
//   BACKUP E RESTAURAÇÃO
// ════════════════════════════════════════════════════════════

function abrirBackup() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormBackup').setWidth(480).setHeight(380),
    '💾 Backup e Restauração'
  );
}

function infoBackupExistente() {
  var ss  = getSS();
  var ws  = ss.getSheetByName(BACKUP_ABA);
  if (!ws || ws.getLastRow() < 2)
    return JSON.stringify({ existe: false });

  var ul   = ws.getLastRow();
  var dados = ws.getRange(2, 1, ul - 1, BACKUP_TOTAL_COL).getValues();

  var contagem = {};
  var dataBackup = '';
  dados.forEach(function(l) {
    var aba = String(l[0] || '').trim();
    var nf  = String(l[IDX_NF + 1] || '').trim();
    if (!aba || !nf) return;
    contagem[aba] = (contagem[aba] || 0) + 1;
    if (!dataBackup) {
      var ts = l[BACKUP_TOTAL_COL - 1];
      dataBackup = ts instanceof Date
        ? Utilities.formatDate(ts, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')
        : String(ts || '');
    }
  });

  return JSON.stringify({ existe: true, data: dataBackup, contagem: contagem });
}

function executarBackup() {
  var ss  = getSS();
  var tz  = Session.getScriptTimeZone();
  var agora = new Date();

  var ws = ss.getSheetByName(BACKUP_ABA);
  if (ws) ss.deleteSheet(ws);
  ws = ss.insertSheet(BACKUP_ABA);
  ws.hideSheet();

  var cab = ['Aba Origem',
    'NFD','Nº NF','Data Entrada','Fornecedor','Tipo','Motivo','Descrição',
    'Qtd','Vl Unit','Vl Total','Status','Pendente✓','Devolvido✓','Venda✓',
    'Obs','Responsável','Anexo','Dias Armazenado','Tipo Frete','Valor Frete','Backup em'
  ];
  ws.getRange(1, 1, 1, BACKUP_TOTAL_COL)
    .setValues([cab])
    .setBackground('#1A3557').setFontColor('#FFFFFF').setFontWeight('bold');
  ws.setFrozenRows(1);
  ws.setColumnWidth(1, 160);

  var totalLinhas = 0;
  var resumo = {};

  ABAS_OPERACIONAIS.forEach(function(nomeAba) {
    var wsAba = ss.getSheetByName(nomeAba);
    if (!wsAba) return;
    var ul = obterUltimaLinhaDados(wsAba);
    if (ul < LINHA_DADOS) return;

    var dados = wsAba.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
    var linhas = [];
    dados.forEach(function(l) {
      if (!l[IDX_NF] && !l[IDX_NFD]) return;
      linhas.push([nomeAba].concat(l).concat([agora]));
    });

    if (linhas.length) {
      ws.getRange(ws.getLastRow() + 1, 1, linhas.length, BACKUP_TOTAL_COL)
        .setValues(linhas);
      resumo[nomeAba] = linhas.length;
      totalLinhas += linhas.length;
    }
  });

  SpreadsheetApp.flush();

  var dataStr = Utilities.formatDate(agora, tz, 'dd/MM/yyyy HH:mm:ss');
  registrarLog(ss, 'SISTEMA', 0, 0, '', totalLinhas + ' linhas', '💾 Backup realizado em ' + dataStr);

  var msg = '✅ Backup concluído em ' + dataStr + '\n\n';
  Object.keys(resumo).forEach(function(aba) {
    msg += '• ' + aba + ': ' + resumo[aba] + ' linha(s)\n';
  });
  msg += '\nTotal: ' + totalLinhas + ' registro(s) salvos.';
  return JSON.stringify({ sucesso: msg, data: dataStr, contagem: resumo });
}

function executarRestauracao() {
  var ss  = getSS();
  var wsB = ss.getSheetByName(BACKUP_ABA);
  if (!wsB || wsB.getLastRow() < 2)
    return JSON.stringify({ erro: 'Nenhum backup encontrado. Faça um backup antes de reconfigurar.' });

  var tz   = Session.getScriptTimeZone();
  var ul   = wsB.getLastRow();
  var snap = wsB.getRange(2, 1, ul - 1, BACKUP_TOTAL_COL).getValues();

  var porAba = {};
  snap.forEach(function(l) {
    var aba = String(l[0] || '').trim();
    var nf  = String(l[IDX_NF + 1] || '').trim();
    if (!aba || !nf) return;
    if (!porAba[aba]) porAba[aba] = [];
    porAba[aba].push(l.slice(1, TOTAL_COLUNAS + 1));
  });

  var totalRestaurados = 0;
  var resumo = {};
  var erros  = [];

  Object.keys(porAba).forEach(function(nomeAba) {
    var ws = ss.getSheetByName(nomeAba);
    if (!ws) {
      erros.push('Aba "' + nomeAba + '" não encontrada — execute "Configurar/Reinstalar" primeiro.');
      return;
    }

    var linhas = porAba[nomeAba];
    var dest   = LINHA_DADOS;
    var fmt    = 'R$ #,##0.00;;"";""';
    var trava  = LockService.getScriptLock();
    if (!trava.tryLock(15000)) {
      erros.push('Timeout ao restaurar "' + nomeAba + '". Tente novamente.');
      return;
    }

    try {
      // [P27] Lista proteções 1× fora do loop
      var protsAba = ws.getProtections(SpreadsheetApp.ProtectionType.RANGE);
      var protMap  = {};
      protsAba.forEach(function(p) { protMap[p.getRange().getRow()] = p; });

      linhas.forEach(function(l, idx) {
        var row = dest + idx;
        if (protMap[row]) { protMap[row].remove(); _decrementarProtecoes(1); }
      });

      // [P27] Batch setValues
      ws.getRange(dest, 1, linhas.length, TOTAL_COLUNAS).setValues(linhas);

      var fmulas = [], fu = [], ft = [], fd = [], cores = [], fdias = [], fmtDias = [];
      linhas.forEach(function(l, idx) {
        var row    = dest + idx;
        var status = String(l[IDX_STATUS] || 'Pendente').trim();
        fmulas.push([_formulaTotal(row)]);
        fu.push([fmt]); ft.push([fmt]); fd.push(['dd/mm/yyyy']);
        cores.push(Array(TOTAL_COLUNAS).fill(corPorStatus(status)));
        fdias.push([_formulaDiasArmazenado(row)]);
        fmtDias.push(['0" dias"']);
      });
      ws.getRange(dest, COL_VL_TOT,  linhas.length, 1).setFormulas(fmulas);
      ws.getRange(dest, COL_VL_UNIT, linhas.length, 1).setNumberFormats(fu);
      ws.getRange(dest, COL_VL_TOT,  linhas.length, 1).setNumberFormats(ft);
      ws.getRange(dest, COL_DATA,    linhas.length, 1).setNumberFormats(fd);
      ws.getRange(dest, COL_DIAS_ARMAZ, linhas.length, 1).setFormulas(fdias);
      ws.getRange(dest, COL_DIAS_ARMAZ, linhas.length, 1).setNumberFormats(fmtDias);
      ws.getRange(dest, 1, linhas.length, TOTAL_COLUNAS).setBackgrounds(cores);

      linhas.forEach(function(l, idx) {
        var status = String(l[IDX_STATUS] || 'Pendente').trim();
        if (status === 'Devolvido' || status === 'Venda') {
          protegerLinhaConcluida(ss, ws, dest + idx, status);
        }
      });

      resumo[nomeAba]  = linhas.length;
      totalRestaurados += linhas.length;
    } catch(e) {
      erros.push('Erro em "' + nomeAba + '": ' + e.toString());
    } finally {
      trava.releaseLock();
    }
  });

  SpreadsheetApp.flush();
  _atualizarMetricasDashboard(ss);

  var dataStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
  registrarLog(ss, 'SISTEMA', 0, 0, '', totalRestaurados + ' linhas',
    '🔄 Restauração concluída em ' + dataStr);

  var msg = '✅ Restauração concluída!\n\n';
  Object.keys(resumo).forEach(function(aba) {
    msg += '• ' + aba + ': ' + resumo[aba] + ' linha(s) restaurada(s)\n';
  });
  msg += '\nTotal: ' + totalRestaurados + ' registro(s).';
  if (erros.length) msg += '\n\n⚠️ Avisos:\n' + erros.join('\n');

  return JSON.stringify({ sucesso: msg });
}


// ════════════════════════════════════════════════════════════
//   CONFIGURAÇÕES
// ════════════════════════════════════════════════════════════

// ─── CONTROLE DE ACESSO ──────────────────────────────────────
// A área de Configurações (e o Configurar/Reinstalar Sistema) só pode ser
// acessada pelo dono da planilha e por e-mails cadastrados na lista de
// administradores (gerenciável dentro da própria tela de Configurações).

/** E-mail do dono da planilha (sempre considerado administrador). */
function _emailDonoPlanilha() {
  try {
    var dono = getSS().getOwner();
    return dono ? String(dono.getEmail() || '').trim().toLowerCase() : '';
  } catch (_) {
    return '';
  }
}

/** Lista de e-mails administradores extras, configurada via PropertiesService. */
function _obterEmailsAdmin() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_ADMINS_CONFIG);
    var lista = raw ? JSON.parse(raw) : [];
    return lista.map(function(e) { return String(e || '').trim().toLowerCase(); }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/** Retorna true se o usuário atual pode acessar a área de Configurações. */
function _usuarioEhAdmin() {
  try {
    var atual = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (!atual) return false;
    if (atual === _emailDonoPlanilha()) return true;
    return _obterEmailsAdmin().indexOf(atual) !== -1;
  } catch (_) {
    return false;
  }
}

/** Bloqueia e registra no log uma tentativa de acesso não autorizado (telas/diálogos). */
function _negarAcessoConfig(origem) {
  try {
    registrarLog(getSS(), 'SISTEMA', 0, 0, '',
      Session.getActiveUser().getEmail() || 'desconhecido',
      '🔒 Acesso negado às Configurações (' + origem + ')');
  } catch (_) {}
  var _msg = '🔒 Acesso restrito\n\n' +
    'Esta área é restrita a usuários autorizados. ' +
    'Solicite acesso a um administrador do sistema.';
  try { SpreadsheetApp.getUi().alert(_msg); } catch (_) {}
  return JSON.stringify({ erro: _msg });
}

function abrirConfiguracoes() {
  if (!_usuarioEhAdmin()) { _negarAcessoConfig('Configurações'); return; }
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormConfiguracoes').setWidth(520).setHeight(640),
    '⚙️ Configurações do Sistema'
  );
}

// ─── ADMINISTRADORES ─────────────────────────────────────────

function obterModoSomenteLeitura() {
  var val = PropertiesService.getScriptProperties().getProperty(_KEY_READONLY) || 'false';
  return JSON.stringify({ ativo: val === 'true' });
}

function salvarModoSomenteLeitura(ativo) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  try {
    PropertiesService.getScriptProperties().setProperty(_KEY_READONLY, ativo ? 'true' : 'false');
    var ss  = getSS();
    var msg = ativo ? 'ATIVADO' : 'DESATIVADO';
    registrarLog(ss, 'SISTEMA', 0, 0, '', msg,
      '🔒 Modo Somente-Leitura ' + msg + ' por ' + (Session.getActiveUser().getEmail() || 'sistema'));
    return JSON.stringify({ ok: '✅ Modo somente-leitura ' + msg + '.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Permissões granulares por módulo ───────────────────────
// módulos: notas, lancamento, email, frete, configuracoes, auditoria
// lista vazia = todos têm acesso; lista preenchida = apenas os listados
// ── Configurações visuais / sistema (items 62-64) ──────────
var _KEY_CORES_STATUS    = 'cdv_cores_status';   // JSON: { Pendente:'#...', Devolvido:'#...', ... }
var _KEY_LOGO_URL        = 'cdv_logo_url';        // URL ou Drive ID da logo customizada
var _KEY_NOME_SISTEMA    = 'cdv_nome_sistema';    // string

function obterConfigVisuais() {
  var props = PropertiesService.getScriptProperties();
  var raw   = props.getProperty(_KEY_CORES_STATUS) || '{}';
  try { var cores = JSON.parse(raw); } catch(_) { var cores = {}; }
  return JSON.stringify({
    cores:       cores,
    logoUrl:     props.getProperty(_KEY_LOGO_URL)     || '',
    nomeSistema: props.getProperty(_KEY_NOME_SISTEMA) || 'Controle de Devoluções'
  });
}

function salvarConfigVisuais(cores, logoUrl, nomeSistema) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var props = PropertiesService.getScriptProperties();
  if (cores)       props.setProperty(_KEY_CORES_STATUS, JSON.stringify(cores));
  if (logoUrl)     props.setProperty(_KEY_LOGO_URL, String(logoUrl));
  if (nomeSistema) props.setProperty(_KEY_NOME_SISTEMA, String(nomeSistema));
  return JSON.stringify({ ok: '✅ Configurações visuais salvas.' });
}

// ── Painel de erros recentes (item 65) ─────────────────────
var _KEY_ERROS_RECENTES = 'cdv_erros_recentes'; // JSON: [{ ts, func, msg }]

function registrarErroSistema(funcao, msg) {
  try {
    var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_ERROS_RECENTES) || '[]';
    var lista = JSON.parse(raw);
    lista.unshift({ ts: new Date().toISOString(), func: String(funcao||''), msg: String(msg||'') });
    lista = lista.slice(0, 50);
    PropertiesService.getScriptProperties().setProperty(_KEY_ERROS_RECENTES, JSON.stringify(lista));
  } catch(_){}
}

function obterErrosRecentes() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_ERROS_RECENTES) || '[]';
  return raw;
}

// ── Monitoramento de tamanho (item 66) ─────────────────────
function monitorarTamanhoPlanilha() {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var file    = DriveApp.getFileById(ss.getId());
    var sizeMB  = (file.getSize() / 1048576).toFixed(2);
    var abas    = ss.getSheets().length;
    var totalLinhas = ss.getSheets().reduce(function(acc, aba) {
      return acc + aba.getLastRow();
    }, 0);
    return JSON.stringify({ sizeMB: sizeMB, abas: abas, totalLinhas: totalLinhas,
      alerta: parseFloat(sizeMB) > 40 });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Teste de envio de e-mail (item 67) ─────────────────────
// ── Ping de disponibilidade (item 68) ──────────────────────
function ping() {
  return JSON.stringify({ ok: true, ts: new Date().toISOString(), usuario: Session.getActiveUser().getEmail() });
}

function getEmailUsuario() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch(_) { return ''; }
}

function testarEnvioEmail(emailDestino) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    MailApp.sendEmail({
      to: emailDestino,
      subject: '✅ Teste de E-mail — Controle de Devoluções',
      htmlBody: '<p>Este é um e-mail de teste enviado pelo sistema <b>Controle de Devoluções Transben</b>.</p>'
        +'<p>Se você recebeu este e-mail, a configuração de envio está funcionando corretamente.</p>'
        +'<p style="color:#888;font-size:11px">Enviado em '+ new Date().toLocaleString('pt-BR')+'</p>'
    });
    return JSON.stringify({ ok: '✅ E-mail de teste enviado para ' + emailDestino + '.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Resumo de conquistas do mês (item 69) ──────────────────
function obterConquistasMes() {
  try {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var hoje = new Date();
    var iniMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    var total = 0, devolvidos = 0, comAnexo = 0;
    _getTodasAbas().forEach(function(nome) {
      var aba = ss.getSheetByName(nome);
      if (!aba) return;
      var ult = obterUltimaLinhaDados(aba);
      if (ult < 2) return;
      var dados = aba.getRange(2, 1, ult - 1, 17).getValues();
      dados.forEach(function(row) {
        var dt = row[0] ? new Date(row[0]) : null;
        if (!dt || dt < iniMes) return;
        total++;
        if (row[3] === 'Devolvido') devolvidos++;
        if (row[16]) comAnexo++;
      });
    });
    return JSON.stringify({ total: total, devolvidos: devolvidos, comAnexo: comAnexo,
      taxaResolucao: total > 0 ? ((devolvidos/total)*100).toFixed(0) : 0 });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Changelog do sistema (item 70) ─────────────────────────
var _KEY_CHANGELOG = 'cdv_changelog'; // JSON: [{ versao, data, itens:[] }]

function obterChangelog() {
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CHANGELOG) || '[]';
  return raw;
}

function adicionarChangelog(versao, itens) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_CHANGELOG) || '[]';
    var lista = JSON.parse(raw);
    lista.unshift({ versao: versao, data: new Date().toLocaleDateString('pt-BR'), itens: itens });
    lista = lista.slice(0, 20);
    PropertiesService.getScriptProperties().setProperty(_KEY_CHANGELOG, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Changelog atualizado.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Feedback inline (item 71) ──────────────────────────────
var _KEY_FEEDBACKS = 'cdv_feedbacks'; // JSON: [{ ts, usuario, tipo, msg, pagina }]

function registrarFeedback(tipo, msg, pagina) {
  try {
    var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_FEEDBACKS) || '[]';
    var lista = JSON.parse(raw);
    lista.unshift({ ts: new Date().toISOString(), usuario: Session.getActiveUser().getEmail(),
      tipo: tipo, msg: msg, pagina: pagina });
    lista = lista.slice(0, 200);
    PropertiesService.getScriptProperties().setProperty(_KEY_FEEDBACKS, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Feedback registrado. Obrigado!' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterFeedbacks() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_FEEDBACKS) || '[]';
  return raw;
}

// ── Biblioteca de modelos de documentos (item 58) ──────────
function obterModelosDocumentos() {
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_MODELOS_DOC) || '[]';
  try { return raw; } catch(_) { return '[]'; }
}

function salvarModeloDocumento(id, nome, corpo) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_MODELOS_DOC) || '[]';
    var lista = JSON.parse(raw);
    var idx = -1;
    for (var i = 0; i < lista.length; i++) { if (lista[i].id === id) { idx = i; break; } }
    var item = { id: id || ('mdl_'+new Date().getTime()), nome: nome, corpo: corpo };
    if (idx > -1) lista[idx] = item; else lista.push(item);
    PropertiesService.getScriptProperties().setProperty(_KEY_MODELOS_DOC, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Modelo salvo.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function excluirModeloDocumento(id) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_MODELOS_DOC) || '[]';
    var lista = JSON.parse(raw).filter(function(m){ return m.id !== id; });
    PropertiesService.getScriptProperties().setProperty(_KEY_MODELOS_DOC, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Modelo excluído.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Aprovação para novos lançamentos (item 57) ─────────────
function obterConfigAprovacao() {
  var ativo = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACAO_ATIVA) === '1';
  var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_APROVADORES) || '[]';
  try { var aprovadores = JSON.parse(raw); }
  catch(_) { var aprovadores = []; }
  return JSON.stringify({ ativo: ativo, aprovadores: aprovadores });
}

function salvarConfigAprovacao(ativo, aprovadores) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  PropertiesService.getScriptProperties().setProperty(_KEY_APROVACAO_ATIVA, ativo ? '1' : '0');
  PropertiesService.getScriptProperties().setProperty(_KEY_APROVADORES,
    JSON.stringify((aprovadores||[]).map(function(e){ return String(e||'').trim().toLowerCase(); }).filter(Boolean)));
  return JSON.stringify({ ok: '✅ Configuração de aprovação salva.' });
}

function submeterParaAprovacao(dadosLancamento) {
  var ativo = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACAO_ATIVA) === '1';
  if (!ativo) {
    return salvarLancamentoForm(dadosLancamento); // aprovação desligada — salva direto
  }
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACOES_PEND) || '[]';
    var lista = JSON.parse(raw);
    var id = 'ap_' + new Date().getTime();
    lista.push({ id: id, dados: dadosLancamento, usuario: Session.getActiveUser().getEmail(), ts: new Date().toISOString(), status: 'pendente' });
    PropertiesService.getScriptProperties().setProperty(_KEY_APROVACOES_PEND, JSON.stringify(lista));
    _notificarAprovadores(id, dadosLancamento);
    return JSON.stringify({ ok: '⏳ Lançamento enviado para aprovação.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function _notificarAprovadores(id, dados) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_APROVADORES) || '[]';
    var aprovadores = JSON.parse(raw);
    if (!aprovadores.length) return;
    var assunto = '🔔 Novo lançamento aguarda aprovação — NF ' + (dados.nf||'?');
    var usuario = Session.getActiveUser().getEmail();
    var body    = '<p>O usuário <b>'+_esc(usuario)+'</b> submeteu um lançamento para aprovação.</p>'
      +'<p><b>NF:</b> '+_esc(String(dados.nf||''))+'<br><b>NFD:</b> '+_esc(String(dados.nfd||''))
      +'<br><b>Fornecedor:</b> '+_esc(String(dados.fornecedor||''))
      +'<br><b>Motivo:</b> '+_esc(String(dados.motivo||''))
      +'<br><b>ID Aprovação:</b> '+_esc(id)+'</p>'
      +'<p>Acesse o sistema para aprovar ou rejeitar.</p>';
    MailApp.sendEmail({ to: aprovadores.join(','), subject: assunto, htmlBody: body });
  } catch(_){}
}

function listarAprovacoesPendentes() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACOES_PEND) || '[]';
  try { return raw; } catch(_) { return '[]'; }
}

function processarAprovacao(id, aprovado, justificativa) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw   = PropertiesService.getScriptProperties().getProperty(_KEY_APROVACOES_PEND) || '[]';
    var lista = JSON.parse(raw);
    var idx   = -1;
    for (var i = 0; i < lista.length; i++) { if (lista[i].id === id) { idx = i; break; } }
    if (idx === -1) return JSON.stringify({ erro: 'Aprovação não encontrada.' });
    var item = lista[idx];
    lista.splice(idx, 1);
    PropertiesService.getScriptProperties().setProperty(_KEY_APROVACOES_PEND, JSON.stringify(lista));
    if (aprovado) {
      _gravarLancamento(item.dados);
      return JSON.stringify({ ok: '✅ Lançamento aprovado e gravado.' });
    } else {
      try {
        MailApp.sendEmail({ to: item.usuario, subject: '❌ Lançamento reprovado — NF '+(item.dados.nf||'?'),
          htmlBody: '<p>Seu lançamento foi <b>reprovado</b>.</p><p>Justificativa: '+_esc(justificativa||'—')+'</p>' });
      } catch(_){}
      return JSON.stringify({ ok: '✅ Lançamento reprovado. Solicitante notificado.' });
    }
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Retenção de dados configurável (item 52) ───────────────
var _KEY_RETENCAO_DIAS    = 'cdv_retencao_dias'; // ex: '730'
var _KEY_APROVACAO_ATIVA  = 'cdv_aprovacao_lancamento'; // '1' | '0'
var _KEY_MODELOS_DOC      = 'cdv_modelos_documentos';   // JSON: [{ id, nome, corpo }]
var _KEY_APROVADORES      = 'cdv_aprovadores';           // JSON: ["email1@", ...]
var _KEY_APROVACOES_PEND  = 'cdv_aprovacoes_pendentes';  // JSON: [{ id, dados, usuario, ts }]

function obterConfiguracaoRetencao() {
  var dias = PropertiesService.getScriptProperties().getProperty(_KEY_RETENCAO_DIAS) || '730';
  return JSON.stringify({ dias: parseInt(dias) });
}

function salvarConfiguracaoRetencao(dias) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  PropertiesService.getScriptProperties().setProperty(_KEY_RETENCAO_DIAS, String(parseInt(dias)||730));
  return JSON.stringify({ ok: '✅ Retenção configurada para '+(dias||730)+' dias.' });
}

// ── Log de exportações (item 53) ───────────────────────────
var _KEY_LOG_EXPORTACOES = 'cdv_log_exportacoes'; // JSON: [{ ts, usuario, tipo, qtd }]

function registrarExportacao(tipo, qtd) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_LOG_EXPORTACOES) || '[]';
    var lista = JSON.parse(raw);
    lista.unshift({ ts: new Date().toISOString(), usuario: Session.getActiveUser().getEmail(), tipo: tipo, qtd: qtd });
    lista = lista.slice(0, 100);
    PropertiesService.getScriptProperties().setProperty(_KEY_LOG_EXPORTACOES, JSON.stringify(lista));
  } catch(_){}
}

function obterLogExportacoes() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_LOG_EXPORTACOES) || '[]';
  return raw;
}

// ── Integridade do backup (item 54) ────────────────────────
function verificarIntegridadeBackup() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var abas = _getTodasAbas();
    var totalLinhas = 0;
    abas.forEach(function(nome) {
      var aba = ss.getSheetByName(nome);
      if (aba) totalLinhas += Math.max(0, obterUltimaLinhaDados(aba) - 1);
    });
    var drive = DriveApp.getFileById(ss.getId());
    var sizeMB = (drive.getSize() / 1048576).toFixed(2);
    var checks = [];
    checks.push({ label: 'Abas ativas', valor: abas.length, ok: abas.length > 0 });
    checks.push({ label: 'Total de registros', valor: totalLinhas, ok: totalLinhas >= 0 });
    checks.push({ label: 'Tamanho do arquivo', valor: sizeMB + ' MB', ok: parseFloat(sizeMB) < 50 });
    var log = ss.getSheetByName('Log');
    checks.push({ label: 'Aba Log presente', valor: log ? 'Sim' : 'Não', ok: !!log });
    return JSON.stringify({ checks: checks, ts: new Date().toISOString() });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Versionamento de configurações (item 51) ───────────────
function salvarSnapshotConfiguracao(descricao) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var props  = PropertiesService.getScriptProperties().getProperties();
    var raw    = PropertiesService.getScriptProperties().getProperty(_KEY_CONFIG_HISTORICO) || '[]';
    var hist   = JSON.parse(raw);
    hist.unshift({ ts: new Date().toISOString(), usuario: Session.getActiveUser().getEmail(),
      descricao: descricao || '', snapshot: props });
    hist = hist.slice(0, 5); // manter apenas os últimos 5
    PropertiesService.getScriptProperties().setProperty(_KEY_CONFIG_HISTORICO, JSON.stringify(hist));
    return JSON.stringify({ ok: '✅ Snapshot salvo.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterHistoricoConfiguracao() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CONFIG_HISTORICO) || '[]';
  try {
    var hist = JSON.parse(raw).map(function(h) {
      return { ts: h.ts, usuario: h.usuario, descricao: h.descricao };
    });
    return JSON.stringify({ historico: hist });
  } catch(_) { return JSON.stringify({ historico: [] }); }
}

function restaurarSnapshotConfiguracao(indice) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw  = PropertiesService.getScriptProperties().getProperty(_KEY_CONFIG_HISTORICO) || '[]';
    var hist = JSON.parse(raw);
    if (!hist[indice]) return JSON.stringify({ erro: 'Snapshot não encontrado.' });
    var snap = hist[indice].snapshot;
    var props = PropertiesService.getScriptProperties();
    Object.keys(snap).forEach(function(k) { props.setProperty(k, snap[k]); });
    return JSON.stringify({ ok: '✅ Configurações restauradas do snapshot de ' + hist[indice].ts + '.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Assinaturas de e-mail (foto Drive) ──────────────────────
function obterAssinaturas() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_ASSINATURAS) || '{}';
  try { return JSON.stringify({ assinaturas: JSON.parse(raw) }); }
  catch(_) { return JSON.stringify({ assinaturas: {} }); }
}

function salvarAssinatura(email, driveFileId) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_ASSINATURAS) || '{}';
    var map = JSON.parse(raw);
    if (driveFileId) map[email.trim().toLowerCase()] = driveFileId.trim();
    else delete map[email.trim().toLowerCase()];
    PropertiesService.getScriptProperties().setProperty(_KEY_ASSINATURAS, JSON.stringify(map));
    return JSON.stringify({ ok: '✅ Assinatura atualizada.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function _obterHtmlAssinatura() {
  return '';  // substituído por seleção manual — ver _obterHtmlAssinaturaById
}

function _obterHtmlAssinaturaById(fileId) {
  if (!fileId) return '';
  try {
    var blob = DriveApp.getFileById(fileId.trim()).getBlob();
    var dataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    return '<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px">'
      + '<img src="' + dataUrl + '" alt="Assinatura" style="max-height:140px;max-width:480px;object-fit:contain">'
      + '</div>';
  } catch(_) { return ''; }
}

// Lista pública de assinaturas (sem restrição admin) para o seletor no formulário de e-mail
function obterListaAssinaturasPublico() {
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_ASSINATURAS) || '{}';
  try {
    var map   = JSON.parse(raw);
    var lista = Object.keys(map).map(function(nome) { return { nome: nome, fileId: map[nome] }; });
    return JSON.stringify({ lista: lista });
  } catch(_) { return JSON.stringify({ lista: [] }); }
}

function obterAssinaturaBase64(fileId) {
  if (!fileId) return '';
  try {
    var file = DriveApp.getFileById(fileId.trim());
    var blob = file.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    var mime = blob.getContentType() || 'image/png';
    return 'data:' + mime + ';base64,' + base64;
  } catch(e) { return ''; }
}

function obterPermissoesModulos() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_PERMISSOES) || '{}';
  try { return JSON.stringify({ permissoes: JSON.parse(raw) }); }
  catch(_) { return JSON.stringify({ permissoes: {} }); }
}

function salvarPermissoesModulo(modulo, emails) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_PERMISSOES) || '{}';
    var perm = JSON.parse(raw);
    if (!emails || !emails.length) { delete perm[modulo]; }
    else { perm[modulo] = emails.map(function(e){ return String(e||'').trim().toLowerCase(); }).filter(Boolean); }
    PropertiesService.getScriptProperties().setProperty(_KEY_PERMISSOES, JSON.stringify(perm));
    return JSON.stringify({ ok: '✅ Permissões atualizadas para módulo: ' + modulo });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function verificarAcessoModulo(modulo) {
  try {
    var props = PropertiesService.getScriptProperties();
    var raw  = props.getProperty(_KEY_PERMISSOES)    || '{}';
    var rawRO = props.getProperty(_KEY_PERMISSOES_RO) || '{}';
    var perm = JSON.parse(raw);
    var permRO = JSON.parse(rawRO);
    var ehAdmin = _usuarioEhAdmin();
    var somenteLeitura = !!permRO[modulo] && !ehAdmin;
    if (!perm[modulo] || !perm[modulo].length) return JSON.stringify({ acesso: true, somenteLeitura: somenteLeitura });
    var usuario = (Session.getActiveUser().getEmail() || '').toLowerCase();
    return JSON.stringify({ acesso: perm[modulo].indexOf(usuario) !== -1 || ehAdmin, somenteLeitura: somenteLeitura });
  } catch(_) { return JSON.stringify({ acesso: true, somenteLeitura: false }); }
}

function obterPermissoesROModulos() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_PERMISSOES_RO) || '{}';
  try { return JSON.stringify({ permissoes: JSON.parse(raw) }); }
  catch(_) { return JSON.stringify({ permissoes: {} }); }
}

function salvarPermissaoROModulo(modulo, ativo) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_PERMISSOES_RO) || '{}';
    var perm = JSON.parse(raw);
    if (ativo) { perm[modulo] = true; } else { delete perm[modulo]; }
    PropertiesService.getScriptProperties().setProperty(_KEY_PERMISSOES_RO, JSON.stringify(perm));
    return JSON.stringify({ ok: '✅ Somente-leitura ' + (ativo ? 'ativado' : 'desativado') + ' para: ' + modulo });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── Templates de e-mail por tipo ───────────────────────────
function obterEmailTemplates() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_EMAIL_TEMPLATES) || '{}';
  try { return JSON.stringify({ templates: JSON.parse(raw) }); }
  catch(_) { return JSON.stringify({ templates: {} }); }
}

function salvarEmailTemplate(tipo, assunto, corpo) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_EMAIL_TEMPLATES) || '{}';
    var tpls = JSON.parse(raw);
    tpls[tipo] = { assunto: assunto, corpo: corpo };
    PropertiesService.getScriptProperties().setProperty(_KEY_EMAIL_TEMPLATES, JSON.stringify(tpls));
    return JSON.stringify({ ok: '✅ Template salvo para tipo: ' + tipo });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ── CC/BCC por fornecedor ───────────────────────────────────
function obterCCFornecedores() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CC_FORN) || '{}';
  try { return JSON.stringify({ ccForn: JSON.parse(raw) }); }
  catch(_) { return JSON.stringify({ ccForn: {} }); }
}

function salvarCCFornecedor(forn, cc, bcc) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CC_FORN) || '{}';
    var mapa = JSON.parse(raw);
    if (cc || bcc) { mapa[forn] = { cc: cc || '', bcc: bcc || '' }; }
    else { delete mapa[forn]; }
    PropertiesService.getScriptProperties().setProperty(_KEY_CC_FORN, JSON.stringify(mapa));
    return JSON.stringify({ ok: '✅ CC/BCC atualizado para ' + forn });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function obterAdminsConfig() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  return JSON.stringify({ dono: _emailDonoPlanilha(), admins: _obterEmailsAdmin() });
}

function salvarAdminsConfig(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  try {
    var lista = (params && params.admins ? params.admins : [])
      .map(function(e) { return String(e || '').trim().toLowerCase(); })
      .filter(Boolean);
    PropertiesService.getScriptProperties().setProperty(_KEY_ADMINS_CONFIG, JSON.stringify(lista));
    var ss = getSS();
    registrarLog(ss, 'SISTEMA', 0, 0, '', lista.join(';'),
      '🔐 Lista de administradores atualizada por ' + (Session.getActiveUser().getEmail() || 'desconhecido'));
    return JSON.stringify({
      ok: '✅ Lista de administradores salva! ' + lista.length + ' e-mail(s) extra(s) — ' +
          'além do dono da planilha (' + (_emailDonoPlanilha() || 'não detectado') + '), que sempre tem acesso.'
    });
  } catch (e) {
    return JSON.stringify({ erro: e.toString() });
  }
}

// ─── CARGOS ──────────────────────────────────────────────────

function obterCargos() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CARGOS) || '[]';
  return JSON.stringify({ cargos: JSON.parse(raw) });
}

function salvarCargo(id, nome, modulos, somenteLeitura) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var props = PropertiesService.getScriptProperties();
    var lista = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
    var novoId = id || Date.now().toString(36);
    var cargo  = {
      id: novoId,
      nome: String(nome || '').trim(),
      modulos: Array.isArray(modulos) ? modulos : [],
      somenteLeitura: !!somenteLeitura
    };
    if (!cargo.nome) return JSON.stringify({ erro: '❌ Nome do cargo é obrigatório.' });
    var idx = lista.map(function(c){ return c.id; }).indexOf(novoId);
    if (idx >= 0) { lista[idx] = cargo; } else { lista.push(cargo); }
    props.setProperty(_KEY_CARGOS, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Cargo salvo.', id: novoId });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function excluirCargo(id) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var props    = PropertiesService.getScriptProperties();
    var usuarios = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
    var em_uso   = usuarios.filter(function(u){ return u.cargoId === id; });
    if (em_uso.length) {
      return JSON.stringify({ erro: '⚠️ Cargo em uso por ' + em_uso.length + ' usuário(s). Remova os vínculos antes de excluir.' });
    }
    var lista = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
    lista = lista.filter(function(c){ return c.id !== id; });
    props.setProperty(_KEY_CARGOS, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Cargo excluído.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ─── USUÁRIOS ─────────────────────────────────────────────────

function obterUsuariosCargos() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  var raw = PropertiesService.getScriptProperties().getProperty(_KEY_USUARIOS) || '[]';
  return JSON.stringify({ usuarios: JSON.parse(raw) });
}

function salvarUsuarioCargo(email, cargoId) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return JSON.stringify({ erro: '❌ E-mail inválido.' });
    }
    var props = PropertiesService.getScriptProperties();
    // Verificar se cargoId existe
    var cargos = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
    if (!cargos.some(function(c){ return c.id === cargoId; })) {
      return JSON.stringify({ erro: '❌ Cargo não encontrado.' });
    }
    var lista = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
    var idx = lista.map(function(u){ return u.email; }).indexOf(emailNorm);
    if (idx >= 0) { lista[idx].cargoId = cargoId; } else { lista.push({ email: emailNorm, cargoId: cargoId }); }
    props.setProperty(_KEY_USUARIOS, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Usuário vinculado.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

function removerUsuarioCargo(email) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito.' });
  try {
    var emailNorm = String(email || '').trim().toLowerCase();
    var props = PropertiesService.getScriptProperties();
    var lista = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
    lista = lista.filter(function(u){ return u.email !== emailNorm; });
    props.setProperty(_KEY_USUARIOS, JSON.stringify(lista));
    return JSON.stringify({ ok: '✅ Vínculo removido.' });
  } catch(e) { return JSON.stringify({ erro: e.toString() }); }
}

// ─── RESOLUÇÃO DE PERMISSÕES ──────────────────────────────────

var _TODOS_MODULOS = ['notas','lancamento','email','frete','configuracoes','auditoria','relatorios','backup'];

function obterPermissoesUsuario(email) {
  try {
    var emailNorm = String(email || Session.getActiveUser().getEmail() || '').trim().toLowerCase();

    // 1. Admin tem acesso total
    var donoEmail = _emailDonoPlanilha();
    var adminsList = _obterEmailsAdmin();
    if (emailNorm === donoEmail || adminsList.indexOf(emailNorm) !== -1) {
      return JSON.stringify({ admin: true, modulos: _TODOS_MODULOS, somenteLeitura: false });
    }

    var props = PropertiesService.getScriptProperties();

    // 2. RO global ativado — todos ficam em leitura, exceto admins (já tratado acima)
    if (props.getProperty(_KEY_READONLY) === 'true') {
      return JSON.stringify({ admin: false, modulos: _TODOS_MODULOS, somenteLeitura: true });
    }

    // 3. Usuário tem cargo vinculado?
    var usuarios = JSON.parse(props.getProperty(_KEY_USUARIOS) || '[]');
    var vinculo  = null;
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === emailNorm) { vinculo = usuarios[i]; break; }
    }
    if (vinculo) {
      var cargos = JSON.parse(props.getProperty(_KEY_CARGOS) || '[]');
      for (var j = 0; j < cargos.length; j++) {
        if (cargos[j].id === vinculo.cargoId) {
          return JSON.stringify({
            admin: false,
            modulos: cargos[j].modulos || [],
            somenteLeitura: !!cargos[j].somenteLeitura
          });
        }
      }
    }

    // 4. Sem cargo — acesso bloqueado (sem módulos)
    return JSON.stringify({ admin: false, modulos: [], somenteLeitura: true });
  } catch(e) {
    return JSON.stringify({ admin: false, modulos: [], somenteLeitura: true });
  }
}

// ─── E-MAILS ─────────────────────────────────────────────────

function obterEmailConfig() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  var props = PropertiesService.getScriptProperties();
  try {
    var rawGeral  = props.getProperty(_KEY_EMAILS_GERAL);
    var rawAlerta = props.getProperty(_KEY_EMAILS_ALERTA);
    var rawTransf = props.getProperty(_KEY_EMAILS_TRANSF);
    var alertaDest = props.getProperty(_KEY_ALERTA_DEST) || 'todos';
    var geral  = rawGeral  ? JSON.parse(rawGeral)  : (EMAILS_DESTINATARIOS || []);
    var alerta = rawAlerta ? JSON.parse(rawAlerta) : [];
    var transf = rawTransf ? JSON.parse(rawTransf) : [];
    return JSON.stringify({ geral: geral, alerta: alerta, alertaDest: alertaDest, transf: transf });
  } catch (e) {
    return JSON.stringify({ geral: EMAILS_DESTINATARIOS || [], alerta: [], alertaDest: 'todos', transf: [] });
  }
}

function salvarEmailConfig(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  if (!params || !params.geral || !params.geral.length)
    return JSON.stringify({ erro: 'A lista geral precisa ter ao menos um e-mail.' });
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(_KEY_EMAILS_GERAL,  JSON.stringify(params.geral));
    props.setProperty(_KEY_EMAILS_ALERTA, JSON.stringify(params.alerta || []));
    props.setProperty(_KEY_ALERTA_DEST,   params.alertaDest || 'todos');
    props.setProperty(_KEY_EMAILS_TRANSF, JSON.stringify(params.transf || []));
    var ss = getSS();
    registrarLog(ss, 'SISTEMA', 0, 0, '', params.geral.join(';'),
      '⚙️ E-mails atualizados — alerta: ' + (params.alertaDest || 'todos') +
      ' — transf: ' + (params.transf || []).length + ' destinatário(s)');
    return JSON.stringify({
      ok: '✅ Configurações de e-mail salvas!\n' +
          'Lista geral: ' + params.geral.length + ' e-mail(s)\n' +
          'Alertas atraso (+30d): ' + (params.alertaDest === 'cc'
            ? 'CC — ' + (params.alerta || []).length + ' e-mail(s)'
            : 'Todos da lista geral') + '\n' +
          'Alertas transferência vencida: ' + (params.transf || []).length + ' e-mail(s)'
    });
  } catch (e) {
    return JSON.stringify({ erro: e.toString() });
  }
}

function _getEmailsGeral() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_EMAILS_GERAL);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return EMAILS_DESTINATARIOS || [];
}

function _getEmailsAlerta() {
  try {
    var props      = PropertiesService.getScriptProperties();
    var alertaDest = props.getProperty(_KEY_ALERTA_DEST) || 'todos';
    var rawGeral   = props.getProperty(_KEY_EMAILS_GERAL);
    var rawAlerta  = props.getProperty(_KEY_EMAILS_ALERTA);
    var geral  = rawGeral  ? JSON.parse(rawGeral)  : (EMAILS_DESTINATARIOS || []);
    var alerta = rawAlerta ? JSON.parse(rawAlerta) : [];
    if (!geral.length) return { to: '', cc: '' };
    var to = geral[0];
    var cc = [];
    if (geral.length > 1) cc = cc.concat(geral.slice(1));
    if (alertaDest === 'cc') {
      alerta.forEach(function(e) {
        if (cc.indexOf(e) === -1 && e !== to) cc.push(e);
      });
    }
    return { to: to, cc: cc.join(',') };
  } catch (_) {
    var fb = EMAILS_DESTINATARIOS || [];
    return { to: fb[0] || '', cc: fb.slice(1).join(',') };
  }
}

function _getEmailsTransf() {
  try {
    var props  = PropertiesService.getScriptProperties();
    var raw    = props.getProperty(_KEY_EMAILS_TRANSF);
    var geral  = _getEmailsGeral();
    var transf = raw ? JSON.parse(raw) : [];
    // Se nenhum destinatário de transferência configurado, usa a lista geral
    var lista  = transf.length ? transf : geral;
    if (!lista.length) return { to: '', cc: '' };
    return { to: lista[0], cc: lista.slice(1).join(',') };
  } catch (_) {
    var fb = EMAILS_DESTINATARIOS || [];
    return { to: fb[0] || '', cc: fb.slice(1).join(',') };
  }
}

/** Alias de compatibilidade. */
function _getEmailsDestinatarios() { return _getEmailsGeral(); }

/**
 * Verifica transferências com agendamento vencido e envia alerta por e-mail separado.
 * Executado diariamente às 8h via trigger instalado em instalarTriggers().
 */
function verificarTransferenciasVencidas() {
  try {
    var ss   = getSS();
    var wsTr = ss.getSheetByName(ABA_TRANSFERENCIAS);
    if (!wsTr || wsTr.getLastRow() < 2) return;

    var tz   = Session.getScriptTimeZone();
    var hoje = new Date();
    var vencidas = [];

    wsTr.getRange(2, 1, wsTr.getLastRow() - 1, TRANSF_TOTAL_COL).getValues()
      .forEach(function(l, i) {
        var stTr  = String(l[TRANSF_COL_STATUS - 1] || '').trim();
        if (stTr !== 'Em Transferência') return;
        var agend = l[TRANSF_COL_DATA_AGEND - 1];
        if (!(agend instanceof Date) || agend >= hoje) return;
        var diasAtraso = Math.floor((hoje - agend) / 864e5);
        vencidas.push({
          linha: i + 2,
          nf:    String(l[IDX_NF]  || '').trim(),
          nfd:   String(l[IDX_NFD] || '').trim(),
          forn:  String(l[IDX_FORN]|| '').trim(),
          aba:   String(l[TRANSF_COL_ABA_ORIGEM    - 1] || '').trim(),
          transp:String(l[TRANSF_COL_TRANSPORTADORA - 1] || '').trim(),
          agend: Utilities.formatDate(agend, tz, 'dd/MM/yyyy'),
          resp:  String(l[TRANSF_COL_RESP - 1] || '').trim(),
          diasAtraso: diasAtraso
        });
      });

    if (!vencidas.length) return;

    var dest = _getEmailsTransf();
    if (!dest.to) {
      console.warn('verificarTransferenciasVencidas: nenhum destinatário configurado.');
      return;
    }

    var linhasHtml = vencidas.map(function(v) {
      return '<tr style="background:' + (v.diasAtraso > 3 ? '#FEE2E2' : '#FFF7ED') + '">' +
        '<td style="padding:6px 10px;border:1px solid #e5e7eb;font-family:monospace">' + (v.nfd || v.nf) + '</td>' +
        '<td style="padding:6px 10px;border:1px solid #e5e7eb">' + v.forn + '</td>' +
        '<td style="padding:6px 10px;border:1px solid #e5e7eb">' + (v.transp || '—') + '</td>' +
        '<td style="padding:6px 10px;border:1px solid #e5e7eb">' + v.aba + '</td>' +
        '<td style="padding:6px 10px;border:1px solid #e5e7eb;color:#b91c1c;font-weight:600">' + v.agend + '</td>' +
        '<td style="padding:6px 10px;border:1px solid #e5e7eb;color:#b91c1c;font-weight:700">' + v.diasAtraso + 'd</td>' +
        '</tr>';
    }).join('');

    var corpo = '<div style="font-family:\'Plus Jakarta Sans\',sans-serif;max-width:720px;margin:0 auto">' +
      '<div style="background:#0891B2;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0">' +
        '<h2 style="margin:0;font-size:16px">⚠️ Alertas — Transferências com Agendamento Vencido</h2>' +
        '<p style="margin:4px 0 0;font-size:12px;opacity:.85">Gerado em ' + Utilities.formatDate(hoje, tz, 'dd/MM/yyyy HH:mm') + '</p>' +
      '</div>' +
      '<div style="background:#f0f9ff;border:1px solid #0891B2;padding:12px 24px">' +
        '<p style="margin:0;font-size:14px;color:#0e7490"><strong>' + vencidas.length + ' transferência(s)</strong> com data de agendamento vencida aguardam ação.</p>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:0">' +
        '<thead><tr style="background:#0891B2;color:#fff">' +
          '<th style="padding:8px 10px;text-align:left">NF/NFD</th>' +
          '<th style="padding:8px 10px;text-align:left">Fornecedor</th>' +
          '<th style="padding:8px 10px;text-align:left">Transportadora</th>' +
          '<th style="padding:8px 10px;text-align:left">Aba Origem</th>' +
          '<th style="padding:8px 10px;text-align:left">Agendado</th>' +
          '<th style="padding:8px 10px;text-align:left">Atraso</th>' +
        '</tr></thead><tbody>' + linhasHtml + '</tbody>' +
      '</table>' +
      '<p style="font-size:11px;color:#6b7280;margin:12px 0 0">Sistema Transben · Controle de Devoluções</p>' +
      '</div>';

    var mailOpts = { name: 'Controle de Devoluções · Transben', htmlBody: corpo };
    if (dest.cc) mailOpts.cc = dest.cc;
    var _ccAlertaTransf = _getCCBccAlerta('transferencia');
    if (_ccAlertaTransf.cc)  { mailOpts.cc  = [mailOpts.cc, _ccAlertaTransf.cc].filter(Boolean).join(','); }
    if (_ccAlertaTransf.bcc) { mailOpts.bcc = _ccAlertaTransf.bcc; }

    GmailApp.sendEmail(dest.to,
      '⚠️ ' + vencidas.length + ' Transferência(s) Vencida(s) — Controle de Devoluções',
      vencidas.map(function(v){ return v.nfd||v.nf + ' — ' + v.forn + ' — Vencido: ' + v.agend; }).join('\n'),
      mailOpts);

    registrarLog(ss, 'SISTEMA', 0, 0, '', vencidas.length + ' vencidas',
      '📧 Alerta de transferências vencidas enviado para ' + dest.to + ' — ' + vencidas.length + ' item(ns)');
  } catch (e) {
    console.error('verificarTransferenciasVencidas: ' + e);
  }
}

// ─── CORES ───────────────────────────────────────────────────

function obterCoresSalvas() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_KEY_CORES);
    if (raw) return JSON.stringify({ cores: JSON.parse(raw) });
    return JSON.stringify({ cores: {
      pendente:  COR_AZUL,
      devolvido: COR_VERDE,
      venda:     COR_LARANJA,
      alerta:    COR_ALERTA_30DIAS,
      header:    COR_HEADER
    }});
  } catch (_) {
    return JSON.stringify({ cores: null });
  }
}

function salvarCoresEReaplicar(cores) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  if (!cores) return JSON.stringify({ erro: 'Cores não informadas.' });
  try {
    PropertiesService.getScriptProperties().setProperty(_KEY_CORES, JSON.stringify(cores));
    try { CacheService.getScriptCache().remove(_CACHE_KEY_CORES); } catch(_) {}
    var ss   = getSS();
    var hoje = new Date();

    ABAS_OPERACIONAIS.forEach(function(nomeAba) {
      var ws = ss.getSheetByName(nomeAba);
      if (!ws) return;
      if (cores.header) {
        ws.getRange(1, 1, 1, TOTAL_COLUNAS).setBackground(cores.header);
        ws.getRange(3, 1, 1, TOTAL_COLUNAS).setBackground(cores.header);
      }
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;
      var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
      var bgs   = dados.map(function(l) {
        if (!l[IDX_NF]) return Array(TOTAL_COLUNAS).fill('#FFFFFF');
        var st  = String(l[IDX_STATUS] || '');
        var cor = st === 'Pendente'  ? (cores.pendente  || COR_AZUL)
                : st === 'Devolvido' ? (cores.devolvido || COR_VERDE)
                : st === 'Venda'     ? (cores.venda     || COR_LARANJA)
                : '#FFFFFF';
        if (st === 'Pendente' && l[IDX_DATA] instanceof Date) {
          if (Math.floor((hoje - l[IDX_DATA]) / 864e5) > 30)
            cor = cores.alerta || COR_ALERTA_30DIAS;
        }
        return Array(TOTAL_COLUNAS).fill(cor);
      });
      ws.getRange(LINHA_DADOS, 1, dados.length, TOTAL_COLUNAS).setBackgrounds(bgs);
    });

    SpreadsheetApp.flush();
    registrarLog(ss, 'SISTEMA', 0, 0, '', JSON.stringify(cores), '🎨 Cores atualizadas via configurações');
    return JSON.stringify({ ok: '✅ Cores salvas e reaplicadas em todas as abas!' });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

// ─── NOVO FORNECEDOR ─────────────────────────────────────────

function criarNovoFornecedor(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  var nome  = String(params.nome || '').trim();
  var fixar = !!params.fixar;
  if (!nome) return JSON.stringify({ erro: 'Nome não informado.' });

  var ss = getSS();
  if (ss.getSheetByName(nome))
    return JSON.stringify({ erro: 'Já existe uma aba com o nome "' + nome + '".' });

  try {
    garantirAba(ss, nome, nome);
    var raw    = PropertiesService.getScriptProperties().getProperty('cdv_abas_extras') || '[]';
    var extras = JSON.parse(raw);
    if (extras.indexOf(nome) === -1) extras.push(nome);
    PropertiesService.getScriptProperties().setProperty('cdv_abas_extras', JSON.stringify(extras));
    registrarLog(ss, 'SISTEMA', 0, 0, '', nome, '🏭 Nova aba criada: ' + nome);
    return JSON.stringify({
      ok: '✅ Aba "' + nome + '" criada com sucesso!\n\n' +
          'Para incluir no menu automático, adicione "' + nome +
          '" ao array ABAS_OPERACIONAIS no código e reinstale o sistema.'
    });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

// ─── DIAGNÓSTICO ─────────────────────────────────────────────

function obterDiagnostico() {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  try {
    var ss    = getSS();
    var props = PropertiesService.getScriptProperties();

    var concl  = parseInt(props.getProperty(_PROP_KEY_CONCLUIDOS) || '0', 10);
    var prots  = parseInt(props.getProperty(_PROP_KEY_PROTECOES)  || '0', 10);
    var backup = props.getProperty('cdv_ultimo_backup') || 'Nunca realizado';

    var abas = ABAS_OPERACIONAIS.map(function(nome) {
      var ws    = ss.getSheetByName(nome);
      var usado = ws ? Math.max(0, obterUltimaLinhaDados(ws) - LINHA_DADOS + 1) : 0;
      return { nome: nome, usado: usado };
    });

    var triggers = ScriptApp.getProjectTriggers().map(function(t) {
      return { func: t.getHandlerFunction(), tipo: t.getTriggerSource().toString() };
    });

    var rawGeral   = props.getProperty(_KEY_EMAILS_GERAL);
    var rawAlerta  = props.getProperty(_KEY_EMAILS_ALERTA);
    var alertaDest = props.getProperty(_KEY_ALERTA_DEST) || 'todos';
    var emailsGeral  = rawGeral  ? JSON.parse(rawGeral)  : (EMAILS_DESTINATARIOS || []);
    var emailsAlerta = rawAlerta ? JSON.parse(rawAlerta) : [];

    return JSON.stringify({
      versao:             'v6.2',
      ultimoBackup:       backup,
      contConcluidos:     concl,
      contProtecoes:      prots,
      abas:               abas,
      triggers:           triggers,
      totalEmailsGeral:   emailsGeral.length,
      totalEmailsAlerta:  emailsAlerta.length,
      alertaDest:         alertaDest
    });
  } catch (e) {
    return JSON.stringify({ erro: e.toString() });
  }
}

// ─── LIMPEZA DO LOG ──────────────────────────────────────────

function executarLimpezaLog(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  var meses = parseInt(params.meses || 6, 10);
  var acao  = String(params.acao || 'arquivar');

  var ss    = getSS();
  var wsLog = ss.getSheetByName('_Log');
  if (!wsLog) return JSON.stringify({ erro: '_Log não encontrado.' });

  var tz     = ss.getSpreadsheetTimeZone();
  var hoje   = new Date();
  var limite = new Date(hoje);
  limite.setMonth(hoje.getMonth() - meses);
  var limiteISO = String(limite.getFullYear()) +
    String(limite.getMonth()+1).padStart(2,'0') +
    String(limite.getDate()).padStart(2,'0');

  try {
    var ul = wsLog.getMaxRows();
    if (ul < 2) return JSON.stringify({ ok: '✅ Log vazio, nada a limpar.' });

    var dadosAll = wsLog.getRange(2, 1, ul - 1, 8).getValues();
    var antigos  = [];
    var recentes = [];

    dadosAll.forEach(function(l) {
      if (!l[0]) return;
      var s = String(l[0]).trim();
      var compact = '';
      if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
        compact = s.slice(6,10) + s.slice(3,5) + s.slice(0,2);
      } else {
        var d = new Date(s);
        if (!isNaN(d)) compact = String(d.getFullYear()) +
          String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
      }
      if (compact && compact < limiteISO) antigos.push(l);
      else recentes.push(l);
    });

    if (!antigos.length) {
      var limStr = Utilities.formatDate(limite, tz, 'dd/MM/yyyy');
      return JSON.stringify({ ok: '✅ Nenhum registro anterior a ' + limStr + '. Log está limpo.' });
    }

    if (acao === 'arquivar') {
      var wsArq = ss.getSheetByName('_Log_Arquivo');
      if (!wsArq) {
        wsArq = ss.insertSheet('_Log_Arquivo');
        wsArq.hideSheet();
        wsArq.getRange(1,1,1,8).setValues([
          ['Data/Hora','Usuário','Aba','Linha','Coluna','Valor Anterior','Novo Valor','Ação']
        ]).setBackground('#444444').setFontColor('#FFFFFF').setFontWeight('bold');
      }
      var nextRow = wsArq.getLastRow() + 1;
      wsArq.getRange(nextRow, 1, antigos.length, 8).setValues(antigos);
    }

    wsLog.getRange(2, 1, ul - 1, 8).clearContent();
    if (recentes.length) wsLog.getRange(2, 1, recentes.length, 8).setValues(recentes);

    SpreadsheetApp.flush();
    registrarLog(ss, 'SISTEMA', 0, 0, '', antigos.length + ' registros', '🗂️ Limpeza de log — ' + acao);

    return JSON.stringify({
      ok: '✅ Limpeza concluída!\n' +
          antigos.length + ' registro(s) ' +
          (acao === 'arquivar' ? 'movidos para _Log_Arquivo' : 'apagados') + '.\n' +
          recentes.length + ' registro(s) mantidos no _Log.'
    });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}

// ─── LIMPEZA DO DRIVE ─────────────────────────────────────────

function previewLimpezaDrive(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  var tipo    = String(params.tipo    || 'relatorios');
  var periodo = parseInt(params.periodo || 0, 10);
  var pastas  = _pastasParaLimpar(tipo);
  if (!pastas.length)
    return JSON.stringify({ erro: 'Nenhuma pasta configurada para o tipo selecionado.' });

  var tz       = getSS().getSpreadsheetTimeZone();
  var corte    = periodo > 0 ? new Date(Date.now() - periodo * 864e5) : null;
  var arquivos = [];

  pastas.forEach(function(p) {
    try {
      var files = DriveApp.getFolderById(p.id).getFiles();
      while (files.hasNext() && arquivos.length < 200) {
        var f = files.next();
        if (corte && f.getDateCreated() > corte) continue;
        arquivos.push({
          nome: f.getName(),
          data: Utilities.formatDate(f.getDateCreated(), tz, 'dd/MM/yyyy')
        });
      }
    } catch (e) { console.warn('previewLimpezaDrive — ' + p.label + ': ' + e); }
  });

  return JSON.stringify({ arquivos: arquivos });
}

function executarLimpezaDrive(params) {
  if (!_usuarioEhAdmin()) return JSON.stringify({ erro: '🔒 Acesso restrito a usuários autorizados.' });
  var tipo    = String(params.tipo    || 'relatorios');
  var periodo = parseInt(params.periodo || 0, 10);
  var pastas  = _pastasParaLimpar(tipo);
  if (!pastas.length)
    return JSON.stringify({ erro: 'Nenhuma pasta configurada.' });

  var tz    = getSS().getSpreadsheetTimeZone();
  var corte = periodo > 0 ? new Date(Date.now() - periodo * 864e5) : null;
  var total = 0;
  var erros = [];

  pastas.forEach(function(p) {
    try {
      var files = DriveApp.getFolderById(p.id).getFiles();
      while (files.hasNext()) {
        var f = files.next();
        try {
          if (corte && f.getDateCreated() > corte) continue;
          f.setTrashed(true);
          total++;
        } catch (ef) { erros.push(f.getName() + ': ' + ef.message); }
      }
    } catch (ep) { erros.push(p.label + ': ' + ep.message); }
  });

  registrarLog(getSS(), 'SISTEMA', 0, 0, '',
    total + ' arquivos', '🗑️ Limpeza Drive — tipo: ' + tipo);

  var msg = '✅ ' + total + ' arquivo(s) movido(s) para a lixeira.\n' +
            'Podem ser restaurados pelo Drive em até 30 dias.';
  if (erros.length) msg += '\n⚠️ ' + erros.length + ' erro(s): ' + erros.slice(0,3).join('; ');
  return JSON.stringify({ ok: msg });
}



// ════════════════════════════════════════════════════════════
//   AUDITORIA E HISTÓRICO
//
//  Formulário unificado que substitui:
//  • abrirHistoricoNF    (absorvida aqui)
//  • abrirHistoricoEmails (absorvida aqui)
//
//  O FormAuditoria.html exibe abas: Histórico de NF | E-mails Enviados
// ════════════════════════════════════════════════════════════

/**
 * Abre o painel unificado de Auditoria e Histórico.
 * Substitui as antigas abrirHistoricoNF() e abrirHistoricoEmails().
 * Requer o arquivo FormAuditoria.html no projeto.
 */
function abrirAuditoria() {
  SpreadsheetApp.getUi().showModalDialog(
    _htmlComEstilos_('FormAuditoria').setWidth(700).setHeight(560),
    '🔍 Auditoria e Histórico'
  );
}

// ════════════════════════════════════════════════════════════
//   MENU — v6.0
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//   [P45] WEB APP — doGet (acesso por link/URL, fora do Sheets)
// ════════════════════════════════════════════════════════════
// Cada item do antigo menu "📦 Devoluções" virou uma página própria do Web App.
// As páginas (arquivos "Web*.html") chamam exatamente as mesmas funções de
// servidor que os diálogos originais (FormX.html) já chamavam via google.script.run —
// nenhuma lógica de negócio foi duplicada ou reescrita.
var _WEBAPP_PAGINAS = {
  'Index'          : 'Index',
  'Dashboard'      : 'FormDashboard',       // NEW — página inicial padrão
  'Lancamento'     : 'FormLancamento',
  'Busca'          : 'FormBusca',
  'Email'          : 'FormEmailDevolucao',
  'Frete'          : 'FormProgramarFrete',
  'BaixaDevolucao' : 'FormExportarPDF',     // renomeado para "Gerar PDF Devolução" na UI
  'BaixaVenda'     : 'FormVenda',
  'Reabertura'     : 'FormReabertura',
  'Relatorios'     : 'FormRelatorios',
  'Backup'         : 'FormBackup',
  'Auditoria'      : 'FormAuditoria',
  'Configuracoes'  : 'FormConfiguracoes',
  'Notas'          : 'FormNotas',
  'Transferencias' : 'FormTransferencias'
};

function _getWebAppExecUrl() {
  try { return ScriptApp.getService().getUrl(); } catch(e) { return ''; }
}

// ════════════════════════════════════════════════════════════
//   DESIGN SYSTEM v12 — injeção central de Styles.html
// ════════════════════════════════════════════════════════════
// Styles.html contém os tokens/animações v12 e é injetado logo
// antes de </head> de cada página (Web App e diálogos do Sheets).
// Como vem DEPOIS do bloco cdv-v10 local de cada form, os tokens
// v12 vencem — reskin global sem editar form por form.
function _injetarDesignSystem_(html) {
  try {
    if (html.indexOf('id="cdv-styles"') !== -1) return html; // já injetado
    var ds = HtmlService.createHtmlOutputFromFile('Styles').getContent();
    var i = html.toLowerCase().indexOf('</head>');
    if (i === -1) return ds + html;
    return html.slice(0, i) + ds + html.slice(i);
  } catch (_) { return html; }
}

/** createHtmlOutputFromFile + design system v12 (para diálogos do Sheets). */
function _htmlComEstilos_(arquivo) {
  var html = HtmlService.createHtmlOutputFromFile(arquivo).getContent();
  return HtmlService.createHtmlOutput(_injetarDesignSystem_(html));
}

function _cdvGetSidebarHtml_(execUrl, activePage) {
  // Badge de transferências (vencidas em vermelho, total em ciano)
  var badgeHtml = '';
  try {
    var badgeData = JSON.parse(obterBadgeCount());
    if (badgeData.total > 0) {
      var bgBadge = badgeData.vencidas > 0 ? '#C62025' : '#0891B2';
      badgeHtml = '<span class="cdv-badge" style="background:' + bgBadge + '">' +
        (badgeData.vencidas > 0 ? badgeData.vencidas : badgeData.total) + '</span>';
    }
  } catch (_) {}

  // Menu Principal no TOPO (antes de Lançamentos), conforme item M
  var groups = [
    {s:'Menu', links:[
      {p:'Dashboard',  i:'⊞', l:'Dashboard', badge:''}
    ]},
    {s:'Lançamentos', links:[
      {p:'Lancamento',  i:'+', l:'Lançar / Excluir'},
      {p:'Notas',       i:'≡', l:'Notas Lançadas'},
      {p:'Busca',       i:'◯', l:'Buscar NF / Fornecedor'},
      {p:'Email',       i:'✉', l:'E-mail de Devolução'}
    ]},
    {s:'Operações', links:[
      {p:'Frete',          i:'▶', l:'Programar Devolução',  badge:''},
      {p:'Transferencias', i:'⇆', l:'Transferências',       badge:badgeHtml},
      {p:'BaixaDevolucao', i:'☑', l:'Gerar PDF Devolução',  badge:''},  // renomeado (item N)
      {p:'BaixaVenda',     i:'$', l:'Baixa p/ Venda',       badge:''},
      {p:'Reabertura',     i:'↩', l:'Reabrir Devoluções',   badge:''}
    ]},
    {s:'Relatórios', links:[
      {p:'Relatorios', i:'▤', l:'Relatórios (PDF)', badge:''}
    ]},
    {s:'Sistema', links:[
      {p:'Index',         i:'⌂', l:'Menu Principal',        badge:''},
      {p:'Backup',        i:'⊙', l:'Backup / Restauração',  badge:''},
      {p:'Auditoria',     i:'⌚', l:'Auditoria e Histórico', badge:''},
      {p:'Configuracoes', i:'⚙', l:'Configurações',         badge:''}
    ]}
  ];
  var nav = '';
  groups.forEach(function(g) {
    nav += '<div class="ng"><div class="ns">' + g.s + '</div>';
    g.links.forEach(function(k) {
      var active = k.p === activePage;
      nav += '<a class="ni' + (active ? ' on' : '') + '" href="' + execUrl + '?page=' + k.p + '" title="' + k.l + '">'
           + '<span class="ic"><span class="is">' + k.i + '</span>' + (k.badge || '') + '</span>'
           + '<span class="nl">' + k.l + '</span></a>';
    });
    nav += '</div>';
  });

  return '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">'
    + '<style>'
    + ':root{--w:240px;--wc:56px;--font:"Plus Jakarta Sans",system-ui,sans-serif}'
    + 'html.col{--w:var(--wc)}'
    + 'body{margin:0;font-family:var(--font)}'
    + '#sb{position:fixed;top:0;left:0;height:100vh;width:var(--w);background:#1E3A5F;color:#fff;display:flex;flex-direction:column;transition:width .2s;overflow:hidden;z-index:9999;box-shadow:2px 0 8px rgba(0,0,0,.18)}'
    + '.br{display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,.12);min-height:56px;flex-shrink:0}'
    + '#tog{background:none;border:none;border-right:1px solid rgba(255,255,255,.1);color:#fff;cursor:pointer;height:56px;width:56px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px}'
    + '#tog:hover{background:rgba(255,255,255,.1)}'
    + '.bi{padding:0 14px;white-space:nowrap;overflow:hidden}'
    + '.bt{font:700 14px/1.1 var(--font);display:block}'
    + '.bv{font:500 10px/1.3 var(--font);opacity:.4;display:block}'
    + '#nav{padding:6px 0;flex:1;overflow-y:auto;overflow-x:hidden}'
    + '.ns{padding:11px 16px 4px;font:700 9px/1 var(--font);text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);white-space:nowrap;overflow:hidden}'
    + '.ni{display:flex;align-items:center;gap:11px;width:100%;padding:9px 16px;text-decoration:none;color:rgba(255,255,255,.78);font:500 12.5px/1.2 var(--font);border:none;border-left:3px solid transparent;background:transparent;cursor:pointer;white-space:nowrap;text-align:left;transition:background .12s}'
    + '.ni:hover{background:rgba(255,255,255,.07)}'
    + '.on{background:rgba(255,255,255,.12)!important;border-left-color:#C62025!important;color:#fff!important;font-weight:600}'
    + '.ic{position:relative;display:inline-flex;font-size:15px;width:18px;text-align:center;flex-shrink:0}'
    + '.is{font-style:normal}'
    + '.nl{overflow:hidden;text-overflow:ellipsis}'
    + '.cdv-badge{position:absolute;top:-6px;right:-8px;min-width:15px;height:15px;padding:0 4px;border-radius:999px;font:700 9px/15px var(--font);text-align:center;color:#fff}'
    + '.ft{padding:10px 16px;border-top:1px solid rgba(255,255,255,.1);font:500 10px/1.4 var(--font);color:rgba(255,255,255,.3);white-space:nowrap;overflow:hidden;flex-shrink:0}'
    + '.pw{margin-left:var(--w);transition:margin-left .2s}'
    + '#cdv-nav-webapp{display:none!important}'
    + 'html.col .ns,html.col .nl,html.col .bi,html.col .ft{display:none}'
    + 'html.col .ni{padding:9px 0;justify-content:center}'
    + '</style>'
    + '<div id="sb">'
    + '<div class="br"><button id="tog" onclick="cdvT()" title="Recolher/expandir">&#9776;</button>'
    + '<div class="bi"><span class="bt">Devoluções</span><span class="bv">Transben · v7.0</span></div></div>'
    + '<nav id="nav">' + nav + '</nav>'
    + '<div class="ft">Sistema Transben</div>'
    + '</div>'
    + '<script>(function(){'
    + 'if(localStorage.getItem("cdv-sc")==="1")document.documentElement.classList.add("col");'
    + '})();'
    + 'function cdvT(){var c=document.documentElement.classList.toggle("col");localStorage.setItem("cdv-sc",c?"1":"0");}'
    + '</script>';
}

function _getPageContent(page) {
  var pagina = _WEBAPP_PAGINAS[page];
  if (!pagina) return JSON.stringify({ erro: 'Página "' + page + '" não encontrada.' });
  if (pagina === 'FormConfiguracoes' && !_usuarioEhAdmin()) {
    _negarAcessoConfig('Web App — Configurações');
    return JSON.stringify({
      html: '<html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px 24px;color:#374151">'
          + '<div style="font-size:40px;margin-bottom:10px">🔒</div>'
          + '<h2 style="margin:0 0 8px;font-size:16px">Acesso restrito</h2>'
          + '<p style="font-size:13px">Esta área é restrita a usuários autorizados.</p>'
          + '</body></html>',
      page: page
    });
  }
  try {
    var pgCache = CacheService.getScriptCache();
    var pgKey   = 'pg_html_v12d_' + pagina;
    var cachedHtml = pgCache.get(pgKey);
    if (cachedHtml) return JSON.stringify({ html: cachedHtml, page: page });
    var html = _injetarDesignSystem_(HtmlService.createHtmlOutputFromFile(pagina).getContent());
    // TTL curto: deploy novo aparece em <=10 min sem precisar limpar cache manualmente
    try { pgCache.put(pgKey, html, 600); } catch(_) {}
    return JSON.stringify({ html: html, page: page });
  } catch(e) {
    return JSON.stringify({ erro: '❌ ' + e.toString(), page: page });
  }
}

// Limpa o cache de HTML das páginas do Web App (rodar após publicar mudanças de UI)
function limparCachePaginas() {
  var cache = CacheService.getScriptCache();
  var keys = Object.keys(_WEBAPP_PAGINAS).map(function(p){ return 'pg_html_v12d_' + _WEBAPP_PAGINAS[p]; });
  try { cache.removeAll(keys); } catch(_) {}
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Cache de páginas limpo ✓', '📦 Devoluções', 4); } catch(_) {}
}

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('📦 Devoluções — Transben')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// [P06] reaplicarCores só quando cache de 1h expirou
function onOpen() {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache.get(_CACHE_KEY_CORES)) {
      var ss = getSS();
      ABAS_OPERACIONAIS.forEach(function(nome) {
        reaplicarCoresAba(ss.getSheetByName(nome));
      });
      cache.put(_CACHE_KEY_CORES, '1', _CORES_TTL_SEG);
    }
  } catch (_) {}

  SpreadsheetApp.getUi().createMenu('📦 Devoluções')
    .addSeparator()
    .addItem('➕ Lançar / Excluir Devolução',    'abrirFormularioLancamento')
    .addItem('🔍 Buscar NF / Fornecedor',        'abrirBusca')
    .addItem('📨 Enviar E-mail de Devolução',    'abrirEmailDevolucao')
    .addSeparator()
    .addItem('🚚 Programar Devolução',           'abrirProgramarFrete')
    .addItem('📋 Painel de Transferências',      'abrirFormTransferencias')
    .addItem('📄 Gerar PDF Devolução',           'abrirFormularioExportarPDF')
    .addItem('🛒 Dar Baixa para Venda',          'abrirFormularioVenda')
    .addItem('🔓 Reabrir Devoluções',            'desfazerConclusao')
    .addSeparator()
    .addItem('📊 Relatórios (Mensal / Semanal / Diário / Fornecedor)', 'abrirRelatorios')
    .addItem('🔔 Verificar Atrasos Agora',       'verificarAtrasosEEnviarAlerta')
    .addItem('🚛 Verificar Transferências Vencidas', 'verificarTransferenciasVencidas')
    .addSeparator()
    .addItem('📦 Forçar Arquivamento Manual',    'arquivarItensConcluidos')
    .addItem('💾 Backup e Restauração',           'abrirBackup')
    .addSeparator()
    .addItem('🔍 Auditoria e Histórico',         'abrirAuditoria')
    // [Acesso restrito] O item aparece para todos, mas só quem é dono da
    // planilha ou administrador cadastrado consegue efetivamente abrir —
    // ver _usuarioEhAdmin() em abrirConfiguracoes()/configurarPlanilha().
    // (Não condicionamos a própria exibição do menu a isso porque onOpen
    // roda em modo restrito, e SpreadsheetApp...getOwner() não pode ser
    // chamado nesse modo — faria o menu inteiro falhar ao montar.)
    .addItem('⚙️ Configurações do Sistema',       'abrirConfiguracoes')
    .addItem('🔧 Configurar/Reinstalar Sistema', 'configurarPlanilha')
    .addItem('🧹 Limpar Cache do Web App',       'limparCachePaginas')
    .addSeparator()
    .addItem('🌐 Abrir Web App (link)',          'abrirLinkWebApp')
    .addToUi();
}

/** Mostra o link do Web App publicado (menu → fora do Sheets). */
function abrirLinkWebApp() {
  var url;
  try { url = ScriptApp.getService().getUrl(); } catch (_) { url = null; }
  if (!url) {
    SpreadsheetApp.getUi().alert('🌐 Web App ainda não publicado.\n\nNo editor de Apps Script: Implantar → Nova implantação → Tipo: App da Web.');
    return;
  }
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:14px">' +
    '<p style="margin:0 0 10px">🌐 Link do Web App:</p>' +
    '<input style="width:100%;padding:8px;font-size:13px" value="' + url + '" onclick="this.select()" readonly>' +
    '<p style="margin-top:12px"><a href="' + url + '" target="_blank">Abrir em nova aba ↗</a></p>' +
    '</div>'
  ).setWidth(420).setHeight(160);
  SpreadsheetApp.getUi().showModalDialog(html, '🌐 Web App — Devoluções');
}

// ════════════════════════════════════════════════════════════
//   BUSCA DE LOG DO SISTEMA (para FormAuditoria)
// ════════════════════════════════════════════════════════════

/**
 * Retorna registros do _Log filtrados por período (dataIni/dataFim ISO).
 * Chamada pelo FormAuditoria.html — tela Log do Sistema.
 */
function buscarLogSistema(params) {
  try {
    var ss    = getSS();
    var wsLog = ss.getSheetByName('_Log');
    if (!wsLog) return JSON.stringify({ registros: [] });

    var ul = wsLog.getLastRow();
    if (ul < 2) return JSON.stringify({ registros: [] });

    var tz      = ss.getSpreadsheetTimeZone();
    var dataIni = String(params.dataIni || '').replace(/-/g, '');
    var dataFim = String(params.dataFim || '').replace(/-/g, '');

    var dados = wsLog.getRange(2, 1, ul - 1, 8).getValues();
    var registros = [];

    dados.forEach(function(l) {
      if (!l[0]) return;
      var s = String(l[0]).trim();
      var compact = '';
      // "dd/MM/yyyy HH:mm:ss"
      if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
        compact = s.slice(6,10) + s.slice(3,5) + s.slice(0,2);
      } else {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
          compact = String(d.getFullYear()) +
            String(d.getMonth()+1).padStart(2,'0') +
            String(d.getDate()).padStart(2,'0');
        }
      }

      // Filtro por período (servidor — segurança)
      if (dataIni && compact && compact < dataIni) return;
      if (dataFim && compact && compact > dataFim) return;

      registros.push({
        data:     s,
        usuario:  String(l[1] || ''),
        aba:      String(l[2] || ''),
        linha:    String(l[3] || ''),
        coluna:   String(l[4] || ''),
        anterior: String(l[5] || ''),
        novo:     String(l[6] || ''),
        acao:     String(l[7] || '')
      });
    });

    return JSON.stringify({ registros: registros });
  } catch (e) {
    return JSON.stringify({ erro: '❌ ' + e.toString() });
  }
}
