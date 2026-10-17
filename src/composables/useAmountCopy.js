import { ref, watch } from 'vue';
import Decimal from 'decimal.js';
import { copyText } from '../services/clipboard.js';

export function useAmountCopy(result) {
  const copied = ref(new Set());
  const pending = ref(new Set());
  const message = ref('');
  const error = ref('');
  let version = 0;

  function reset() {
    version++;
    copied.value = new Set();
    pending.value = new Set();
    message.value = '';
    error.value = '';
  }

  async function copy(month, field, value, label) {
    const key = `${month}:${field}`;
    if (pending.value.has(key)) return;
    const currentVersion = version;
    pending.value.add(key);
    error.value = '';
    message.value = '';
    try {
      // 剪贴板只写入当前字段金额，不含千分位、月份、单位或其他字段。
      await copyText(new Decimal(value).div(100).toFixed(2));
      if (currentVersion !== version) return;
      copied.value.add(key);
      message.value = `${month} 的${label}已复制`;
    } catch (cause) {
      if (currentVersion === version) error.value = cause.message;
    } finally {
      if (currentVersion === version) pending.value.delete(key);
    }
  }

  // 新结果或手动重置会使尚在等待的复制操作失效，避免旧结果的标记污染新结果。
  watch(result, reset, { flush: 'sync' });
  return { copied, pending, message, error, copy, reset };
}
