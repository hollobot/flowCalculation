const CACHE_KEY = 'flowCalculation.calculatorConfig';
const CACHE_VERSION = 1;

/** 读取长期保存在当前浏览器中的计算配置；损坏或旧版本缓存直接忽略。 */
export function loadCalculatorConfig() {
  try {
    const value = window.localStorage.getItem(CACHE_KEY);
    if (!value) return null;
    const payload = JSON.parse(value);
    if (payload?.version !== CACHE_VERSION || !payload.config || typeof payload.config !== 'object') return null;
    return payload.config;
  } catch {
    return null;
  }
}

/** 配置变化后覆盖写入，不设置过期时间；浏览器禁用存储时不影响正常计算。 */
export function saveCalculatorConfig(config) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, config }));
  } catch {
    // 隐私模式、存储配额不足等情况由浏览器决定，计算功能仍可继续使用。
  }
}
