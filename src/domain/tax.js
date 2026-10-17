import Decimal from 'decimal.js';

// 累计预扣率表：上限（元）、税率、速算扣除数（元）。
const brackets = [
  [36_000, 0.03, 0], [144_000, 0.1, 2520], [300_000, 0.2, 16920],
  [420_000, 0.25, 31920], [660_000, 0.3, 52920], [960_000, 0.35, 85920],
  [Infinity, 0.45, 181920],
];

export function cumulativeTax(taxableCents) {
  const taxable = Math.max(0, taxableCents);
  const [, rate, deduction] = brackets.find(([upper]) => taxable <= upper * 100);
  return {
    amount: Math.max(0, new Decimal(taxable).times(rate).minus(deduction * 100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()),
    rate, deduction: deduction * 100,
  };
}

export function separateBonusTax(bonusCents) {
  // 奖金除以 12 选月度档位，等价于按奖金总额选年度上限；速算扣除数必须除以 12。
  const [, rate, deduction] = brackets.find(([upper]) => bonusCents <= upper * 100);
  return new Decimal(bonusCents).times(rate).minus(new Decimal(deduction).times(100).div(12))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
