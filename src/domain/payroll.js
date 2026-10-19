import Decimal from 'decimal.js';
import { cents, contributionAmount, prorate } from './money.js';
import { getAttendance, listMonths } from './calendar.js';
import { cumulativeTax, separateBonusTax } from './tax.js';

function moneyInput(value, label) {
  if (value === '' || value === null || value === undefined) throw new Error(`请填写${label}`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000)
    throw new Error(`${label}应在 0 至 10 亿元之间`);
  return number;
}

function integerInput(value, label) {
  const number = moneyInput(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label}应为整数`);
  return number;
}

export function createOffsets(months, amplitude) {
  const limit = cents(moneyInput(amplitude, '工资浮动金额'));
  return Object.fromEntries(months.map((month) => [month, Math.floor(Math.random() * (2 * limit + 1)) - limit]));
}

function shouldContribute(month, input, group) {
  const monthlyChoice = input.monthlyIncome?.[month]?.[group];
  // 逐月开关是最终缴费选择；旧输入没有逐月设置时，才回退到首末月规则。
  if (typeof monthlyChoice === 'boolean') return monthlyChoice;
  const selection = input[group];
  // 同月入离职只采用首月规则，避免末月开关覆盖用户约定。
  if (month === input.start.slice(0, 7)) {
    return selection.first === 'auto' ? Number(input.start.slice(-2)) <= 15 : selection.first === 'yes';
  }
  if (month === input.end.slice(0, 7)) return selection.last !== 'no';
  return true;
}

function calculateContributions(policy, input, month, monthlySalary) {
  const details = policy.items.map((item) => {
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
      // “工资全额”使用该月固定月薪；逐月覆盖值与全局默认月薪具有相同含义。
      if (settings.mode === 'salary') base = monthlySalary;
      if (settings.mode === 'custom') base = moneyInput(settings.base, '自定义基数');
      base = Math.min(rule.max, Math.max(rule.min, base));
      let rate = rule.rate;
      if (input.customRates) {
        const percent = moneyInput(input.rates?.[item.key]?.[side], `${item.label}比例`);
        if (percent > (item.group === 'fund' ? 12 : 100)) throw new Error(`${item.label}比例超出允许范围`);
        rate = new Decimal(percent).div(100).toNumber();
      }
      result[side] = {
        base,
        rate,
        available: true,
        amount: active ? contributionAmount(base, rate, item.precision, item.roundMode) : 0,
      };
    }
    return result;
  });
  const seriousIllness = calculateSeriousIllness(policy, input, month);
  if (seriousIllness) details.push(seriousIllness);
  return details;
}

/**
 * 依次应用逐月固定月薪、试用期折扣和随机浮动。
 * 入职月固定算作试用期第一个月，浮动关闭时不读取该月的随机值。
 */
function calculateMonthlySalary(input, month, monthIndex, offsets, amplitude) {
  const settings = input.monthlyIncome?.[month];
  const configuredSalary = cents(moneyInput(settings?.salary ?? input.salary, `${month} 固定税前月薪`));
  let probationRate = 1;
  let probationApplied = false;
  if (input.probation?.enabled) {
    const probationMonths = integerInput(input.probation.months, '试用期月数');
    const probationPercent = moneyInput(input.probation.percent, '试用期工资比例');
    if (probationMonths < 1 || probationMonths > 120) throw new Error('试用期月数应在 1 至 120 之间');
    if (probationPercent > 100) throw new Error('试用期工资比例应在 0% 至 100% 之间');
    probationApplied = monthIndex < probationMonths;
    if (probationApplied) probationRate = new Decimal(probationPercent).div(100).toNumber();
  }
  const salaryAfterProbation = new Decimal(configuredSalary)
    .times(probationRate)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const floating = settings?.floating !== false;
  const offset = floating ? offsets[month] : 0;
  if (floating && amplitude > salaryAfterProbation) {
    throw new Error(`${month} 的工资浮动金额不能超过试用期折扣后的固定月薪`);
  }
  if (!Number.isInteger(offset) || Math.abs(offset) > amplitude) throw new Error('工资浮动数据无效，请重新生成');
  return {
    configuredSalary,
    probationApplied,
    probationRate,
    salaryAfterProbation,
    floating,
    offset,
    fullSalary: salaryAfterProbation + offset,
  };
}

/** 附加大病医疗按源数据指定月份收取定额，跟随逐月社保开关，不随自定义比例变化。 */
function calculateSeriousIllness(policy, input, month) {
  const rules = policy.seriousIllness;
  if (!rules?.personal?.length && !rules?.company?.length) return null;
  const active = shouldContribute(month, input, 'social');
  const monthNumber = Number(month.slice(5, 7));
  const result = { key: 'seriousIllness', label: '附加大病医疗', fixed: true, precision: 2, roundMode: 1, active };
  for (const side of ['personal', 'company']) {
    const entries = rules[side] || [];
    const amount = entries.filter((entry) => entry.months.includes(monthNumber))
      .reduce((sum, entry) => sum + cents(entry.amount), 0);
    result[side] = { base: 0, rate: 0, available: entries.length > 0, amount: active ? amount : 0 };
  }
  return result;
}

/** 纯函数：不访问网络、数据库或随机数，同一参数和浮动表始终得到同一结果。 */
export function calculatePayroll(input, policy, offsets) {
  if (!policy) throw new Error('城市不存在，请先在本地添加并同步');
  // 旧库的 unsupported 标记及额外免税上限均不阻断按现有基数、比例进行测算。
  const months = listMonths(input.start, input.end);
  moneyInput(input.salary, '固定月薪');
  const amplitude = cents(moneyInput(input.fluctuation, '工资浮动金额'));
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
  for (const [monthIndex, month] of months.entries()) {
    const currentYear = month.slice(0, 4);
    if (year !== currentYear) {
      year = currentYear;
      income = contributions = withheld = employedMonths = 0;
    }
    employedMonths++;
    const attendance = getAttendance(month, input.start, input.end);
    const monthlySalary = calculateMonthlySalary(input, month, monthIndex, offsets, amplitude);
    const { fullSalary } = monthlySalary;
    const gross = attendance.fullMonth ? fullSalary : prorate(fullSalary, attendance.paidDays, attendance.totalDays);
    const details = calculateContributions(policy, input, month, monthlySalary.configuredSalary / 100);
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
      month,
      ...monthlySalary,
      gross,
      bonus: currentBonus,
      personal,
      company,
      salaryTax,
      bonusTax,
      tax: salaryTax + bonusTax,
      net: gross + currentBonus - personal - salaryTax - bonusTax,
      attendance,
      details,
      cumulative: {
        income,
        contributions,
        deduction,
        taxable,
        withheld,
        previousWithheld,
        rate: taxResult.rate,
        quickDeduction: taxResult.deduction,
      },
    });
  }
  const totals = Object.fromEntries(
    ['gross', 'bonus', 'personal', 'company', 'tax', 'net'].map((key) => [
      key,
      rows.reduce((sum, row) => sum + row[key], 0),
    ]),
  );
  return {
    rows,
    totals,
    policyName: policy.name,
    policyDescription: policy.description,
    generatedAt: new Date().toISOString(),
  };
}
