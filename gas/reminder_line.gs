/**
 * LINE Messaging API：今日の日付に一致する行の C 列を全ユーザーへ multicast
 * 送信成功後、その行の D 列に「✓」
 */

// ---------- シート・列（必要なら Script Properties で上書き） ----------
var DEFAULT_SPREADSHEET_ID = '';

/** スケジュールシート名。空ならスプレッドシートの先頭シート */
var DEFAULT_SCHEDULE_SHEET_NAME = '';

/** ユーザーID一覧のシート名 */
var DEFAULT_USERS_SHEET_NAME = 'ユーザー';

var SCHEDULE_DATE_COL = 1;   // A
var SCHEDULE_BODY_COL = 3;   // C
var SCHEDULE_FLAG_COL = 4;   // D
var SCHEDULE_DATA_START_ROW = 2;

var USER_ID_COLUMN = 1;
var USER_DATA_START_ROW = 2;

var MULTICAST_MAX = 500;
var SENT_MARK = '✓';

var TIMEZONE = Session.getScriptTimeZone() || 'Asia/Tokyo';

// ---------------------------------------------------------------------------

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    channelAccessToken: props.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
    spreadsheetId: props.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID,
    scheduleSheetName: props.getProperty('SCHEDULE_SHEET_NAME') || DEFAULT_SCHEDULE_SHEET_NAME,
    usersSheetName: props.getProperty('USERS_SHEET_NAME') || DEFAULT_USERS_SHEET_NAME
  };
}

/**
 * 初回のみ: シークレットとシート名を Script Properties に保存
 */
function saveSecretsToScriptProperties() {
  PropertiesService.getScriptProperties().setProperties({
    LINE_CHANNEL_ACCESS_TOKEN: 'チャネルアクセストークン',
    SPREADSHEET_ID: 'スプレッドシートID',
    SCHEDULE_SHEET_NAME: '',      // 空 = 先頭シート
    USERS_SHEET_NAME: 'ユーザー'
  }, true);
}

/**
 * 毎朝実行（トリガーはこの関数に紐づける）
 */
function sendDailyLineMessageToAllUsers() {
  var cfg = getConfig_();
  if (!cfg.channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です。');
  }
  if (!cfg.spreadsheetId) {
    throw new Error('SPREADSHEET_ID が未設定です。');
  }

  var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  var scheduleSheet = getSheetOrFirst_(ss, cfg.scheduleSheetName);
  var usersSheet = ss.getSheetByName(cfg.usersSheetName);
  if (!usersSheet) {
    throw new Error('ユーザーシートが見つかりません: ' + cfg.usersSheetName);
  }

  var todayKey = formatDateKey_(new Date(), TIMEZONE);
  var match = findTodayScheduleRow_(scheduleSheet, todayKey);

  if (!match) {
    console.log('今日（' + todayKey + '）に一致する行がありません。');
    return;
  }

  var row = match.row;
  var body = match.body;
  var alreadySent = match.alreadySent;

  if (alreadySent) {
    console.log('行 ' + row + ' は送信済みのためスキップしました。');
    return;
  }

  if (!body || String(body).trim() === '') {
    console.log('行 ' + row + ' のメッセージ本文が空のため送信しません。');
    return;
  }

  var userIds = getUserIdsFromSheet_(usersSheet);
  if (userIds.length === 0) {
    console.log('送信対象のユーザーIDがありません。');
    return;
  }

  var text = String(body).trim();
  var batches = chunkArray_(userIds, MULTICAST_MAX);
  for (var i = 0; i < batches.length; i++) {
    lineMulticast_(cfg.channelAccessToken, batches[i], text);
    Utilities.sleep(200);
  }

  scheduleSheet.getRange(row, SCHEDULE_FLAG_COL).setValue(SENT_MARK);
  console.log('送信完了: 行 ' + row + ' / ' + userIds.length + ' 件');
}

function getSheetOrFirst_(ss, name) {
  if (name && String(name).trim() !== '') {
    var s = ss.getSheetByName(name);
    if (!s) {
      throw new Error('スケジュールシートが見つかりません: ' + name);
    }
    return s;
  }
  return ss.getSheets()[0];
}

/**
 * @returns {{ row: number, body: string, alreadySent: boolean } | null}
 */
function findTodayScheduleRow_(sheet, todayKey) {
  var lastRow = sheet.getLastRow();
  if (lastRow < SCHEDULE_DATA_START_ROW) {
    return null;
  }

  var numRows = lastRow - SCHEDULE_DATA_START_ROW + 1;
  var range = sheet.getRange(
    SCHEDULE_DATA_START_ROW,
    1,
    lastRow,
    Math.max(SCHEDULE_DATE_COL, SCHEDULE_BODY_COL, SCHEDULE_FLAG_COL)
  );
  var rows = range.getValues();

  for (var i = 0; i < rows.length; i++) {
    var r = SCHEDULE_DATA_START_ROW + i;
    var rowVals = rows[i];
    var cellA = rowVals[SCHEDULE_DATE_COL - 1];
    var cellC = rowVals[SCHEDULE_BODY_COL - 1];
    var cellD = rowVals[SCHEDULE_FLAG_COL - 1];

    if (cellDateKey_(cellA) !== todayKey) {
      continue;
    }

    var alreadySent = cellD !== null && cellD !== '' && String(cellD).trim() === SENT_MARK;
    return {
      row: r,
      body: cellC == null ? '' : String(cellC),
      alreadySent: alreadySent
    };
  }
  return null;
}

/** セル値を yyyy/MM/dd 形式のキーに正規化（文字列・Date 両対応） */
function cellDateKey_(value) {
  if (value === null || value === '') {
    return '';
  }
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return formatDateKey_(value, TIMEZONE);
  }
  var s = String(value).trim();
  // 既に yyyy/MM/dd 形式
  var m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (m) {
    var y = m[1];
    var mo = ('0' + m[2]).slice(-2);
    var d = ('0' + m[3]).slice(-2);
    return y + '/' + mo + '/' + d;
  }
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return formatDateKey_(parsed, TIMEZONE);
  }
  return '';
}

function formatDateKey_(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy/MM/dd');
}

function getUserIdsFromSheet_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < USER_DATA_START_ROW) {
    return [];
  }
  var range = sheet.getRange(USER_DATA_START_ROW, USER_ID_COLUMN, lastRow, USER_ID_COLUMN);
  var values = range.getValues();
  var ids = [];
  var seen = {};
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (raw === null || raw === '') {
      continue;
    }
    var id = String(raw).trim();
    if (!id || seen[id]) {
      continue;
    }
    seen[id] = true;
    ids.push(id);
  }
  return ids;
}

function lineMulticast_(channelAccessToken, userIds, text) {
  var url = 'https://api.line.me/v2/bot/message/multicast';
  var payload = {
    to: userIds,
    messages: [{ type: 'text', text: text }]
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + channelAccessToken },
    payload: JSON.stringify(payload)
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('LINE API エラー HTTP ' + code + ': ' + res.getContentText());
  }
}

function chunkArray_(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** 毎日 6 時台のうちおおよそ 6:30 付近 */
function createDailyTriggerAt630() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyLineMessageToAllUsers') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('sendDailyLineMessageToAllUsers')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(30)
    .create();
}