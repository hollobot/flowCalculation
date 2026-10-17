import Decimal from 'decimal.js';
import { cents, contributionAmount, prorate } from './money.js';
import { getAttendance, listMonths } from './calendar.js';
import { cumulativeTax, separateBonusTax } from './tax.js';

function moneyInput(value, label) {
  if (value === '' || value === null || value === undefined) throw new Error(`请填写${label}`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000) throw new Error(`${label}应在 0 至 10 亿元之间`);
  return number;
}

export function createOffsets(months, amplitude) {
  const limit = cents(moneyInput(amplitude, '工资浮动金额'));
  return Object.fromEntries(months.map((month) => [month, Math.floor(Math.random() * (2 * limit + 1)) - limit]));
}

function shouldContribute(month, input, group) {
  const selection = input[group];
  // 同月入离职只采用首月规则，避免末月开关覆盖用户约定。
  if (month === input.start.slice(0, 7)) {
    return selection.first === 'auto' ? Number(input.start.slice(-2)) <= 15 : selection.first === 'yes';
  }
  if (month === input.end.slice(0, 7)) return selection.last !== 'no';
  return true;
}

function calculateContributions(policy, input, month) {
  return policy.items.map((item) => {
    const settings = input[item.group];
    const active = shouldContribute(month, input, item.group);
    const result = { key: item.key, label: item.label, precision: item.precision, roundMode: item.roundMode, active };
    for (const side of ['personal', 'company']) {
      const rule = item[side];
      if (!rule) {
        result[side] = { base: 0, rate: 0, amount: 0, available: false };
        continue;
      }
      let base = rule.min;
      if (settings.mode === 'salary') base = moneyInput(input.salary, '固定月薪');
      if (settings.mode === 'custom') base = moneyInput(settings.base, '自定义基数');
      base = Math.min(rule.max, Math.max(rule.min, base));
      let rate = rule.rate;
      if (input.customRates) {
        const percent = moneyInput(input.rates?.[item.key]?.[side], `${item.label}比例`);
        if (percent > (item.group === 'fund' ? 12 : 100)) throw new Error(`${item.label}比例超出允许范围`);
        rate = new Decimal(percent).div(100).toNumber();
      }
      result[side] = {
        base, rate, available: true,
        amount: active ? contributionAmount(base, rate, item.precision, item.roundMode) : 0,
      };
    }
    return result;
  });
}

/** 纯函数：不访问网络、数据库或随机数，同一参数和浮动表始终得到同一结果。 */
export function calculatePayroll(input, policy, offsets) {
  if (!policy) throw new Error('该城市尚无政策，请先在本地同步');
  if (policy.unsupported?.length) throw new Error(`该政策含${policy.unsupported.join('、')}，尚未支持其计费规则，不能生成不完整结果`);
  if (policy.fundTaxFreeLimit) throw new Error('该城市存在额外公积金免税上限，需核对其计税口径后才能计算');
  const months = listMonths(input.start, input.end);
  const salary = cents(moneyInput(input.salary, '固定月薪'));
  const amplitude = cents(moneyInput(input.fluctuation, '工资浮动金额'));
  if (amplitude > salary) throw new Error('工资浮动金额不能超过固定月薪');
  const bonus = input.bonusEnabled ? cents(moneyInput(input.bonusAmount, '年终奖金额')) : 0;
  if (input.bonusEnabled && !months.includes(input.bonusMonth)) throw new Error('年终奖月份必须位于入职至离职月份之间');
  if (input.bonusEnabled && input.bonusMode === 'separate' && input.bonusMonth > '2027-12') {
    throw new Error('现已收录的年终奖单独计税政策截至 2027 年底，请更新政策或选择并入综合所得');
  }
  const rows = [];
  let year;
  let income = 0;
  let contributions = 0;
  let withheld = 0;
  let employedMonths = 0;
  for (const month of months) {
    const currentYear = month.slice(0, 4);
    if (year !== currentYear) {
      year = currentYear;
      income = contributions = withheld = employedMonths = 0;
    }
    employedMonths++;
    const attendance = getAttendance(month, input.start, input.end);
    const offset = offsets[month];
    if (!Number.isInteger(offset) || Math.abs(offset) > amplitude) throw new Error('工资浮动数据无效，请重新生成');
    const fullSalary = salary + offset;
    const gross = attendance.fullMonth ? fullSalary : prorate(fullSalary, attendance.paidDays, attendance.totalDays);
    const details = calculateContributions(policy, input, month);
    const personal = details.reduce((sum, item) => sum + item.personal.amount, 0);
    const company = details.reduce((sum, item) => sum + item.company.amount, 0);
    const currentBonus = input.bonusEnabled && month === input.bonusMonth ? bonus : 0;
    const combinedBonus = input.bonusMode === 'combined' ? currentBonus : 0;
    income += gross + combinedBonus;
    contributions += personal;
    const deduction = employedMonths * 500_000;
    const taxable = Math.max(0, income - contributions - deduction);
    const taxResult = cumulativeTax(taxable);
    // 预扣阶段累计应纳税额下降时，本月扣税为零，不在工资表中自动退还此前税款。
    const salaryTax = Math.max(0, taxResult.amount - withheld);
    const previousWithheld = withheld;
    withheld += salaryTax;
    const bonusTax = input.bonusMode === 'separate' && currentBonus ? separateBonusTax(currentBonus) : 0;
    rows.push({
      month, fullSalary, offset, gross, bonus: currentBonus, personal, company,
      salaryTax, bonusTax, tax: salaryTax + bonusTax,
      net: gross + currentBonus - personal - salaryTax - bonusTax,
      attendance, details,
      cumulative: { income, contributions, deduction, taxable, withheld, previousWithheld, rate: taxResult.rate, quickDeduction: taxResult.deduction },
    });
  }
  const totals = Object.fromEntries(['gross', 'bonus', 'personal', 'company', 'tax', 'net']
    .map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
  return { rows, totals, policyName: policy.name, policyDescription: policy.description, generatedAt: new Date().toISOString() };
}
