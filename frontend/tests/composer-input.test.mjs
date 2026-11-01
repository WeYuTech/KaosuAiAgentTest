import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submitComposerOnEnter } from '../src/composerInput.ts';

function enter(overrides = {}, enabled = true) {
  let sends = 0, prevented = 0;
  submitComposerOnEnter({key: 'Enter', shiftKey: false, keyCode: 13, nativeEvent: {isComposing: false},
    preventDefault: () => prevented++, ...overrides}, enabled, () => sends++);
  return {sends, prevented};
}
test('一般 Enter 送出一次，Shift+Enter 留在輸入框換行', () => {
  assert.deepEqual(enter(), {sends: 1, prevented: 1});
  assert.deepEqual(enter({shiftKey: true}), {sends: 0, prevented: 0});
});
test('輸入法組字與候選確認不誤送出需求', () => {
  assert.deepEqual(enter({nativeEvent: {isComposing: true}}), {sends: 0, prevented: 0});
  assert.deepEqual(enter({keyCode: 229}), {sends: 0, prevented: 0});
  assert.deepEqual(enter({key: 'Process'}), {sends: 0, prevented: 0});
});
test('鎖定或未設定模型時，Enter 不繞過送出按鈕限制', () => {
  assert.deepEqual(enter({}, false), {sends: 0, prevented: 1});
});
