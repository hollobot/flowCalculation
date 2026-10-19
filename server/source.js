import { readSeriousIllness } from '../src/domain/policy-extras.js';

const portalRoot = 'https://payroll.gongzige.com/policy/api/portal';
const sourceRoot = `${portalRoot}/get_by_city`;

async function readSourceJson(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw error;
    throw new Error('城市数据源暂不可用，请稍后重试');
  }
  if (!response.ok) {
    const error = new Error('城市数据源请求失败，请稍后重试');
    error.rateLimited = response.status === 429 || response.status === 403;
    throw error;
  }
  try { return await response.json(); }
  catch { throw new Error('城市数据源返回的数据格式异常，请稍后重试'); }
}

/**
 * 读取数据源完整城市列表。接口返回的是政策记录列表，因此这里按 fcity 去重，
 * 供“全城市同步”按城市逐个调用政策接口；空名称不会进入同步任务。
 */
export async function fetchSourceCities() {
  const data = await readSourceJson(`${portalRoot}/get_citys/${Date.now()}`);
  if (!data || data.errcode !== 0 || !Array.isArray(data.result)) {
    throw new Error('城市数据源未返回有效的城市列表');
  }
  const cities = [...new Set(data.result
    .map((entry) => String(entry?.fcity || '').trim())
    .filter(Boolean))];
  if (!cities.length) throw new Error('城市数据源暂未返回城市');
  return cities;
}

function numeric(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`城市数据中的${label}不是有效非负数`);
  return result;
}

function rateList(value, label) {
  if (value === '' || value === null || value === undefined) return [];
  const rates = String(value).split(',').map((part) => numeric(part.trim(), label));
  if (rates.some((rate) => rate === null || rate > 1)) throw new Error(`城市数据中的${label}格式无法识别`);
  return rates.sort((a, b) => a - b);
}

function rounding(config, prefix) {
  const accuracy = config[`${prefix}Accuracy`];
  const precision = accuracy === '' || accuracy === null || accuracy === undefined ? NaN : Number(accuracy);
  const mode = Number(config[`${prefix}RoundMode`]);
  // 有基数和比例即可测算；未提供有效舍入规则时，默认保留两位、四舍五入。
  return {
    precision: Number.isInteger(precision) && precision >= 0 && precision <= 2 ? precision : 2,
    roundMode: [1, 2, 3, 4].includes(mode) ? mode : 1,
  };
}

function contributionSide(config, lower, upper, rate, label) {
  const rates = rate ? rateList(config[rate], label) : [];
  if (!rates.length) return null;
  const min = numeric(config[lower], `${label}基数下限`);
  const max = numeric(config[upper], `${label}基数上限`);
  if (min === null || max === null || min > max) throw new Error(`${label}的基数范围缺失或不正确`);
  return { min, max, rate: rates[0], rates };
}

/** 字母字段由数据源政策页面核对，特别注意生育保险是 AA/AB/AC，而非 S/T/U。 */
export function normalizePolicy(raw) {
  const config = raw.config;
  if (!config || !raw.id || !raw.name) throw new Error('城市数据字段不完整');
  const socialRounding = rounding(config, 'sp');
  const fundRounding = rounding(config, 'pf');
  const definitions = [
    ['pension', '养老保险', 'G', 'H', 'K', 'I', 'J', 'L'],
    ['medical', '医疗保险', 'M', 'N', 'Q', 'O', 'P', 'R'],
    ['maternity', '生育保险', 'AA', 'AB', 'AC', null, null, null],
    ['unemployment', '失业保险', 'AD', 'AE', 'AH', 'AF', 'AG', 'AI'],
    ['injury', '工伤保险', 'AJ', 'AK', 'AL', null, null, null],
  ];
  const items = definitions.map(([key, label, cl, cu, cr, pl, pu, pr]) => ({
    key, label, group: 'social', ...socialRounding,
    company: contributionSide(config, cl, cu, cr, `公司${label}`),
    personal: contributionSide(config, pl, pu, pr, `个人${label}`),
  }));
  const pairs = [...String(config.AS ?? '').matchAll(/\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  const remainder = String(config.AS ?? '').replace(/\(\s*[\d.]+\s*,\s*[\d.]+\s*\)/g, '').replace(/[\s,]/g, '');
  if (!pairs.length || remainder || pairs.some((pair) => pair.some((rate) => !Number.isFinite(rate) || rate > 1))) {
    throw new Error('公积金缴存比例格式无法识别');
  }
  // 保持公司/个人比例配对，不能从不同的组合各取一个最低值。
  pairs.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);
  const fundConfig = { ...config, companyRate: pairs[0][0], personalRate: pairs[0][1] };
  items.push({
    key: 'fund', label: '住房公积金', group: 'fund', ...fundRounding,
    company: contributionSide(fundConfig, 'AQ', 'AR', 'companyRate', '公司公积金'),
    personal: contributionSide(fundConfig, 'AQ', 'AR', 'personalRate', '个人公积金'),
  });
  const fundTaxFreeLimit = Number(config.AU);
  return {
    id: String(raw.id), name: raw.name, city: raw.city, province: raw.province,
    effectiveAt: numeric(raw.stratedAt, '生效时间') ?? 0,
    updatedAt: numeric(raw.updatedAt, '更新时间') ?? numeric(raw.createdAt, '创建时间') ?? 0,
    description: String(config.F ?? ''),
    note: [config.AY, config.AS1, config.remark].filter(Boolean).join('；'),
    // 文字备注和额外免税口径保留供参考，不作为基础缴费测算的前置条件。
    fundTaxFreeLimit: Number.isFinite(fundTaxFreeLimit) && fundTaxFreeLimit > 0 ? fundTaxFreeLimit : null,
    seriousIllness: readSeriousIllness(config), items,
  };
}

export async function fetchCityPolicy(city) {
  const data = await readSourceJson(`${sourceRoot}/${encodeURIComponent(city)}/${Date.now()}`);
  // 不向页面转发上游原始错误、链接或服务名称。
  if (!data || data.errcode !== 0) throw new Error('城市查询失败，请检查城市名称或稍后重试');
  if (!Array.isArray(data.result)) throw new Error('城市查询返回的数据格式异常');
  if (!data.result.length) throw new Error('城市不存在，请检查城市名称，例如“杭州市”或“上海城区”');
  // 接口可能返回多个版本：只保留最新生效、最新更新的一条，原始响应留作追溯。
  const latest = [...data.result].sort((a, b) =>
    Number(b.stratedAt || 0) - Number(a.stratedAt || 0)
    || Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0];
  return { policy: normalizePolicy(latest), raw: data };
}
