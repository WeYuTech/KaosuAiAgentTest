// 唯讀診斷：擷取原函式，使用合成狀態與可控回覆重現本輪觀察。
// 本檔不是完整 UI 測試，也不是正式回歸通過的證明；不呼叫 MES 或模型。
// 斷言刻意確認本輪缺陷仍可重現；修正後斷言不成立，不等於產品回歸失敗。
// 使用支援 stripTypeScriptTypes 的 Node.js 執行，JSON 僅寫至 stdout。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const sourceUrl = new URL('../../../frontend/src/main.tsx', import.meta.url);
const feedbackSourceUrl = new URL('../../../frontend/src/FeedbackReview.tsx', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');

function extract(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `無法擷取 ${start}；來源函式可能已變更，請人工核對診斷範圍。`);
  return stripTypeScriptTypes(source.slice(a, b), { mode: 'transform' });
}

const clearCode = extract('  function clearSession()', '  async function guarded');
const auditCode = extract('  async function showAudit()', '  async function showHelp');
const refreshCode = extract('  async function refreshData(', 'async function start(');
const receiveCode = extract('  function receive(', '  async function send(');

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function fixture() {
  // 所有識別及內容均為本檔建立的合成標記，不代表真實資料或授權結果。
  const state = {
    session: { actor: { id: 'supervisor', roles: ['report', 'schedule', 'mold', 'review'] } },
    conversation: { id: 'actor-a-conversation' },
    messages: [{ content: '前一身分的合成需求' }],
    workspace: { records: [{ id: 'actor-a-record' }], catalogs: {} },
    proposal: null,
    proposalStatus: '',
    draft: '前一身分的合成草稿',
    selected: null,
    queryData: null,
    stage: 'chat',
    error: '',
    queryError: '',
    queryBusy: false,
    audit: [{ id: 'actor-a-audit-entry', actor: 'supervisor', module: 'mold' }],
    guideSnapshot: { action: 'mold.clear', schedule_id: 'synthetic-target' },
    sheetContext: '前一身分的合成作業情境',
    helpOpen: true,
    feedback: '前一身分尚未送出的合成回饋',
    budget: { spent_usd: 1 },
    tab: 'chat',
  };
  const context = {
    URLSearchParams,
    ApiError,
    Error,
    document: { activeElement: {} },
    t: value => value,
    panelTrigger: { current: null },
    queryGeneration: { current: 1 },
    draftMemory: { current: new Map([['actor-a-conversation', '前一份合成草稿']]) },
    checkedActor: { current: 'supervisor' },
    filters: { equipment: '', date: '', wo: '' },
    contextFilter: {},
    module: 'report',
    pageSize: 20,
    workspace: state.workspace,
  };
  for (const key of Object.keys(state)) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
    };
  }
  vm.createContext(context);
  vm.runInContext(clearCode + auditCode + refreshCode, context);
  return { state, context };
}

const results = [];

{
  const { state, context } = fixture();
  context.clearSession();
  assert.equal(state.stage, 'identity');
  assert.equal(state.session, null);
  assert.equal(state.audit[0].id, 'actor-a-audit-entry');
  assert.equal(state.helpOpen, true);
  assert.equal(state.feedback, '前一身分尚未送出的合成回饋');
  results.push({
    case: '清除 session 後仍保留前一身分的合成畫面資料',
    auditRetained: true,
    feedbackDraftRetained: true,
    helpRemainsOpen: state.helpOpen,
    otherStateStillPresent: ['guideSnapshot', 'sheetContext', 'budget'].filter(key => state[key] != null),
    limit: '其他狀態僅記錄是否仍存在；不據此判定其授權範圍或完整 UI 可見性。',
  });

  state.session = { actor: { id: 'operator', roles: ['report'] } };
  state.stage = 'chat';
  let reject;
  context.api = () => new Promise((_, rejectRequest) => { reject = rejectRequest; });
  const request = context.showAudit();
  assert.equal(state.tab, 'audit');
  assert.equal(state.audit[0].id, 'actor-a-audit-entry');
  reject(new ApiError('合成的操作紀錄讀取失敗', 503));
  await request;
  assert.equal(state.audit[0].id, 'actor-a-audit-entry');
  results.push({
    case: '新身分讀取操作紀錄期間及失敗後仍保留原資料列',
    previousActorRowStillPresent: true,
    queryError: state.queryError,
  });
}

{
  const { state, context } = fixture();
  let resolve;
  context.api = () => new Promise(resolveRequest => { resolve = resolveRequest; });
  const request = context.refreshData();
  const generationAtRequest = context.queryGeneration.current;
  context.clearSession();
  assert.equal(state.workspace.records.length, 0);
  assert.equal(context.queryGeneration.current, generationAtRequest);
  resolve({ records: [{ id: 'late-actor-a-record' }], catalogs: {} });
  await request;
  assert.equal(state.workspace.records[0].id, 'late-actor-a-record');
  results.push({
    case: '清除 session 後晚到的讀取回覆重新填回 workspace',
    stateRepopulatedAfterClear: true,
    stage: state.stage,
  });
}

{
  const { state, context } = fixture();
  // 模擬 React 舊 render 的 callback 閉包，setState 仍寫入目前狀態。
  // 恢復標記函式在此為直通替身；本案例只檢查 receive 的情境隔離，
  // 不驗證真實持久化、React 排程或完整跨登入流程。
  Object.assign(context, {
    session: state.session,
    conversation: state.conversation,
    unresolved: false,
    proposal: null,
    memoryKey: id => `scope:${id}`,
    restoreSubmission: (_scope, _conversation, proposal) => proposal,
    setIndependentApproval: () => {},
  });
  vm.runInContext(receiveCode, context);
  context.clearSession();
  state.session = { actor: { id: 'operator', roles: ['report'] } };
  state.conversation = { id: 'actor-b-conversation' };
  state.stage = 'chat';
  context.receive({ proposal: { id: 'late-actor-a-proposal', status: 'pending', args: { schedule_id: 'synthetic-target' } } });
  assert.equal(state.proposal.id, 'late-actor-a-proposal');
  results.push({
    case: '換身分後舊 receive 閉包仍採用前一情境的 proposal',
    currentActor: state.session.actor.id,
    acceptedProposal: state.proposal.id,
    limit: '函式級合成閉包診斷，尚不等於完整瀏覽器跨登入重現。',
  });
}

{
  const feedbackSource = fs.readFileSync(feedbackSourceUrl, 'utf8');
  const a = feedbackSource.indexOf('  async function load()');
  const b = feedbackSource.indexOf('  useEffect(', a);
  assert.ok(a >= 0 && b > a, '無法擷取 FeedbackReview 的讀取函式，請人工核對來源版本。');
  const state = {
    records: [{ id: 'actor-a-feedback-entry', actor_id: 'synthetic-author' }],
    busy: false,
    error: '',
  };
  const context = {
    Error,
    t: value => value,
    api: async () => { throw new ApiError('合成的 session 失效', 401); },
    setRecords: value => { state.records = value; },
    setBusy: value => { state.busy = value; },
    setError: value => { state.error = value; },
  };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(feedbackSource.slice(a, b), { mode: 'transform' }), context);
  await context.refresh();
  assert.equal(state.records[0].id, 'actor-a-feedback-entry');
  assert.equal(state.error, '合成的 session 失效');
  assert.ok(feedbackSource.includes('[session?.actor.id, refreshToken]'));
  assert.ok(feedbackSource.includes('records.filter(row =>'));
  results.push({
    case: '身分失效後回饋重新讀取 401，原合成資料列仍保留',
    previousRowsStillPresent: true,
    error: state.error,
  });
}

// 只核對相應呈現程式仍存在，沒有模擬瀏覽器繪製或實際授權結果。
assert.ok(source.includes('<DataView data={audit} title={t("操作紀錄")}/>'));
assert.ok(source.includes('{helpOpen && <aside className="help-panel"'));
console.log(JSON.stringify({
  sources: ['frontend/src/main.tsx', 'frontend/src/FeedbackReview.tsx'],
  boundary: '擷取原函式＋合成狀態與回覆；非完整 UI 測試、非正式回歸通過、非後端越權證明。',
  interpretation: '下列斷言確認本輪缺陷觀察仍可重現；修正後需改用驗證正確行為的正式測試。',
  results,
}, null, 2));
