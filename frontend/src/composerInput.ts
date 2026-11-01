/** 中文輸入法確認候選與 Shift+Enter 只留在輸入框，不送出作業需求。 */
export function submitComposerOnEnter(event: {
  key: string; shiftKey: boolean; keyCode: number;
  nativeEvent: { isComposing: boolean }; preventDefault: () => void;
}, canSubmit: boolean, submit: () => void) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (canSubmit) submit();
}
