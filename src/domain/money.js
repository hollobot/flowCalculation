import Decimal from 'decimal.js';

// 所有月度金额以整数“分”累计；乘除和政策舍入使用十进制，避免二进制浮点误差。
export const cents = (yuan) => new Decimal(yuan).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
export const yuan = (value) => new Decimal(value).div(100).toNumber();
export const prorate = (value, numerator, denominator) =>
  new Decimal(value).times(numerator).div(denominator).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

const roundingModes = {
  1: Decimal.ROUND_HALF_UP,
  2: Decimal.ROUND_CEIL,
  3: Decimal.ROUND_FLOOR,
  4: Decimal.ROUND_DOWN,
};

export function contributionAmount(base, rate, precision, roundMode) {
  if (!(roundMode in roundingModes)) throw new Error('不支持的政策进位规则');
  return new Decimal(base).times(rate).toDecimalPlaces(precision, roundingModes[roundMode]).times(100).toNumber();
}

export function formatMoney(value) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(yuan(value));
}

export function formatRate(rate) {
  return rate === null || rate === undefined ? '—' : `${new Decimal(rate).times(100).toString()}%`;
}

export const roundLabels = { 1: '四舍五入', 2: '向上取整', 3: '向下取整', 4: '截取小数' };
