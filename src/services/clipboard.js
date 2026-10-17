/** 优先使用系统剪贴板；旧浏览器采用临时文本框，成功后调用方才更新复制标记。 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 权限不可用时仍尝试浏览器的兼容复制方式。
    }
  }
  const previousFocus = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('复制失败，请允许剪贴板访问或手动复制金额');
  } finally {
    textarea.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}
