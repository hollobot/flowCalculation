<script setup>
import { computed, ref } from 'vue';
import { formatMoney, formatRate, roundLabels } from '../domain/money.js';
import { useAmountCopy } from '../composables/useAmountCopy.js';
import CopyAmount from './CopyAmount.vue';
import UiIcon from './UiIcon.vue';
const props = defineProps({ result: { type: Object, default: null }, dirty: Boolean });
const { copied, pending, message, error, copy, reset } = useAmountCopy(() => props.result);
const viewMode = ref('payroll');

/** 单独计税的奖金拆成独立记录，工资与奖金行相加仍等于原月度结果。 */
const displayRows = computed(() => (props.result?.rows || []).flatMap((row) => {
  if (!row.separateBonus) return [{ ...row, recordKey: `${row.month}:salary`, recordType: 'salary' }];
  const salaryRow = {
    ...row,
    recordKey: `${row.month}:salary`,
    recordType: 'salary',
    bonus: 0,
    bonusTax: 0,
    tax: row.salaryTax,
    net: row.gross - row.personal - row.salaryTax,
  };
  const bonusRow = {
    ...row,
    recordKey: `${row.month}:bonus`,
    recordType: 'bonus',
    displayedGross: 0,
    personal: 0,
    company: 0,
    tax: row.bonusTax,
    net: row.bonus - row.bonusTax,
  };
  return [salaryRow, bonusRow];
}));

/** 在每个自然年的最后一条记录后插入年度合计，口径与当前表格各列保持一致。 */
const tableRows = computed(() => {
  const rows = displayRows.value;
  const result = [];
  let totals;
  for (const [index, row] of rows.entries()) {
    const year = row.month.slice(0, 4);
    if (!totals || totals.year !== year) {
      totals = { year, displayedGross: 0, bonus: 0, personal: 0, tax: 0, net: 0 };
    }
    for (const field of ['displayedGross', 'bonus', 'personal', 'tax', 'net']) totals[field] += row[field];
    result.push(row);
    if (rows[index + 1]?.month.slice(0, 4) !== year) {
      result.push({ ...totals, recordKey: `year:${year}`, recordType: 'yearTotal' });
    }
  }
  return result;
});

function nextMonth(month) {
  const [year, value] = month.split('-').map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
}

/** 个税 App 流水只转换展示月份和分组，不改变原工资月份已经算出的个税。 */
const appFlowRows = computed(() => {
  const rows = displayRows.value.map((row) => ({
    ...row,
    month: nextMonth(row.month),
    recordKey: `app:${row.recordKey}`,
    income: row.recordType === 'bonus' ? row.bonus : row.displayedGross,
    incomeType: row.recordType === 'bonus' ? '全年一次性奖金收入' : '正常工资薪金',
  }));
  const accumulatedByYear = {};
  return rows.map((row) => {
    const year = row.month.slice(0, 4);
    const difference = accumulatedByYear[year] || 0;
    accumulatedByYear[year] = difference + row.income;
    return { ...row, year, difference };
  });
});

const appFlowTableRows = computed(() => {
  const rows = [];
  let totals;
  for (const [index, row] of appFlowRows.value.entries()) {
    if (!totals || totals.year !== row.year) totals = { year: row.year, income: 0, tax: 0 };
    totals.income += row.income;
    totals.tax += row.tax;
    rows.push(row);
    if (appFlowRows.value[index + 1]?.year !== row.year) {
      rows.push({ ...totals, recordKey: `app-year:${row.year}`, recordType: 'yearTotal' });
    }
  }
  return rows;
});

const appYearSummaries = computed(() => appFlowTableRows.value
  .filter((row) => row.recordType === 'yearTotal')
  .map((row) => ({
    ...row,
    count: appFlowRows.value.filter((item) => item.year === row.year).length,
  })));

const appFlowTotals = computed(() => appFlowRows.value.reduce((totals, row) => ({
  income: totals.income + row.income,
  tax: totals.tax + row.tax,
}), { income: 0, tax: 0 }));

function contributionBasis(item, side) {
  if (!item[side].available) return '—';
  return item.fixed ? '按月定额' : `${item[side].base} / ${formatRate(item[side].rate)}`;
}

const copyField = (row, field) => row.recordType === 'bonus' ? `bonus-${field}` : field;
const appCopyField = (row, field) => `app-${copyField(row, field)}`;
</script>

<template>
  <section class="results-panel" aria-label="计算结果" aria-live="polite">
    <template v-if="result">
      <div v-if="dirty" class="notice warning">参数或政策已更新，以下仍为上次结果，请点击“计算工资”。</div>
      <div v-if="viewMode === 'payroll'" class="summary-cards">
        <article class="summary-card primary"><span>预计累计到手 <small>元</small></span><strong>{{ formatMoney(result.totals.net) }}</strong><div>{{ result.rows.length }} 个月 · 含年终奖</div></article>
        <article class="summary-card"><span>累计税前收入 <small>元</small></span><strong>{{ formatMoney(result.totals.gross + result.totals.bonus) }}</strong><div>年终奖 {{ formatMoney(result.totals.bonus) }}</div></article>
        <article class="summary-card"><span>累计个人所得税 <small>元</small></span><strong>{{ formatMoney(result.totals.tax) }}</strong><div>个人五险一金 {{ formatMoney(result.totals.personal) }}</div></article>
      </div>
      <div v-else class="summary-cards app-year-summary-cards">
        <article v-for="summary in appYearSummaries" :key="summary.year" class="summary-card" :class="{ primary: summary.year === appYearSummaries.at(-1)?.year }">
          <span>{{ summary.year }} 年累计税前收入 <small>元</small></span>
          <strong>{{ formatMoney(summary.income) }}</strong>
          <div>个人所得税 {{ formatMoney(summary.tax) }} · {{ summary.count }} 条流水</div>
        </article>
      </div>
      <div class="card result-card">
        <div class="card-heading result-heading">
          <div><h2>{{ viewMode === 'payroll' ? '每月工资明细' : '个税 App 流水' }}</h2><p>{{ viewMode === 'payroll' ? result.rows[0].month : appFlowRows[0].month }} — {{ viewMode === 'payroll' ? result.rows.at(-1).month : appFlowRows.at(-1).month }} · {{ result.policyName }}</p></div>
          <div class="result-heading-actions">
            <div class="result-view-switch" aria-label="结果显示方式">
              <button type="button" :class="{ active: viewMode === 'payroll' }" :aria-pressed="viewMode === 'payroll'" @click="viewMode = 'payroll'">工资明细</button>
              <button type="button" :class="{ active: viewMode === 'app' }" :aria-pressed="viewMode === 'app'" @click="viewMode = 'app'">个税 App 流水</button>
            </div>
            <span class="pill">人民币 / 元</span>
            <button type="button" class="button small-button secondary-button" :disabled="!copied.size && !pending.size" @click="reset">重置复制标记</button>
          </div>
        </div>
        <div class="copy-toolbar"><span>点击金额旁的按钮，复制当前{{ viewMode === 'payroll' ? '工资' : '发薪' }}月份的对应金额。</span><span>{{ copied.size ? `已标记 ${copied.size} 项` : '已复制的金额将以蓝色标记' }}</span></div>
        <p v-if="error" class="notice error copy-feedback" role="alert">{{ error }}</p>
        <p class="sr-only" role="status">{{ message }}</p>
        <div v-if="viewMode === 'payroll'" class="table-scroll">
          <table class="payroll-table">
            <caption class="sr-only">每月工资、年终奖、社保公积金及个税明细</caption>
            <thead><tr><th>月份</th><th>税前工资</th><th>年终奖</th><th>个人五险一金</th><th>个人所得税</th><th>到手收入</th></tr></thead>
            <tbody v-for="row in tableRows" :key="row.recordKey" class="month-group">
              <tr v-if="row.recordType === 'yearTotal'" class="month-row year-total-row">
                <th>{{ row.year }} 年合计</th>
                <td data-label="税前工资">{{ formatMoney(row.displayedGross) }}</td>
                <td data-label="年终奖">{{ formatMoney(row.bonus) }}</td>
                <td data-label="个人五险一金">{{ formatMoney(row.personal) }}</td>
                <td data-label="个人所得税">{{ formatMoney(row.tax) }}</td>
                <td data-label="到手收入" class="net-amount">{{ formatMoney(row.net) }}</td>
              </tr>
              <template v-else>
              <tr class="month-row">
                <th>{{ row.month }}<template v-if="row.recordType === 'bonus'"> 年终奖</template><small>{{ row.recordType === 'bonus' ? '全年一次性奖金收入' : (row.attendance.fullMonth ? '工资 · 整月' : `工资 · ${row.attendance.paidDays} / ${row.attendance.totalDays} 计薪天`) }}</small></th>
                <td data-label="税前工资"><CopyAmount :amount="row.displayedGross" :label="`${row.month} 税前工资`" :copied="copied.has(`${row.month}:${copyField(row, 'gross')}`)" :pending="pending.has(`${row.month}:${copyField(row, 'gross')}`)" @copy="copy(row.month, copyField(row, 'gross'), row.displayedGross, '税前工资')" /></td>
                <td data-label="年终奖">{{ formatMoney(row.bonus) }}</td>
                <td data-label="个人五险一金">{{ formatMoney(row.personal) }}</td>
                <td data-label="个人所得税"><CopyAmount :amount="row.tax" :label="`${row.month} 个人所得税`" :copied="copied.has(`${row.month}:${copyField(row, 'tax')}`)" :pending="pending.has(`${row.month}:${copyField(row, 'tax')}`)" @copy="copy(row.month, copyField(row, 'tax'), row.tax, '个人所得税')" /></td>
                <td data-label="到手收入" class="net-amount">{{ formatMoney(row.net) }}</td>
              </tr>
              <tr class="breakdown-row"><td colspan="6">
                <details v-if="row.recordType === 'bonus'" class="month-details">
                  <summary>全年一次性奖金计税过程</summary>
                  <div class="details-body tax-explanation">
                    <p>全年一次性奖金收入 {{ formatMoney(row.bonus) }} 元，单独计税 {{ formatMoney(row.bonusTax) }} 元，到手奖金为 <b>{{ formatMoney(row.net) }}</b> 元。</p>
                  </div>
                </details>
                <details v-else class="month-details">
                  <summary>社保公积金与计税过程 <span>公司缴纳 {{ formatMoney(row.company) }} 元</span></summary>
                  <div class="details-body">
                    <p class="helper">固定月薪 {{ formatMoney(row.configuredSalary) }} 元；<template v-if="row.probationApplied">试用期按 {{ formatRate(row.probationRate) }} 计算为 {{ formatMoney(row.salaryAfterProbation) }} 元；</template>浮动后整月工资 {{ formatMoney(row.fullSalary) }} 元（{{ row.floating ? `浮动 ${row.offset >= 0 ? '+' : ''}${formatMoney(row.offset)}` : '本月未启用浮动' }}）；{{ row.attendance.fullMonth ? '本月按完整月薪计算。' : `按 ${row.attendance.paidDays} ÷ ${row.attendance.totalDays} 折算，含在职期间法定带薪节日。` }}</p>
                    <div class="table-scroll"><table class="contribution-table"><thead><tr><th>项目</th><th>个人基数 / 比例</th><th>个人缴纳</th><th>公司基数 / 比例</th><th>公司缴纳</th><th>精度</th></tr></thead><tbody><tr v-for="item in row.details" :key="item.key"><th>{{ item.label }}<small v-if="!item.active">本月不缴</small></th><td>{{ contributionBasis(item, 'personal') }}</td><td>{{ formatMoney(item.personal.amount) }}</td><td>{{ contributionBasis(item, 'company') }}</td><td>{{ formatMoney(item.company.amount) }}</td><td>{{ item.precision }} 位 / {{ roundLabels[item.roundMode] }}</td></tr></tbody></table></div>
                    <div class="tax-explanation">
                      <p>累计应税所得 = 累计收入 {{ formatMoney(row.cumulative.income) }} − 个人五险一金 {{ formatMoney(row.cumulative.contributions) }} − 减除费用 {{ formatMoney(row.cumulative.deduction) }} = <b>{{ formatMoney(row.cumulative.taxable) }}</b> 元（最低为 0）。</p>
                      <p>工资个税 = 累计应税所得 × {{ formatRate(row.cumulative.rate) }} − 速算扣除数 {{ formatMoney(row.cumulative.quickDeduction) }} − 此前已预扣 {{ formatMoney(row.cumulative.previousWithheld) }} = <b>{{ formatMoney(row.salaryTax) }}</b> 元（本月不产生负税额）。</p>
                    </div>
                    <p v-if="row.net < 0" class="notice warning">本月收入不足以覆盖个人缴费，净额为负，表示仍需补足的金额。</p>
                  </div>
                </details>
              </td></tr>
              </template>
            </tbody>
            <tfoot><tr><th>全部合计</th><td>{{ formatMoney(result.totals.displayedGross) }}</td><td>{{ formatMoney(result.totals.bonus) }}</td><td>{{ formatMoney(result.totals.personal) }}</td><td>{{ formatMoney(result.totals.tax) }}</td><td class="net-amount">{{ formatMoney(result.totals.net) }}</td></tr></tfoot>
          </table>
        </div>
        <div v-else class="table-scroll">
          <table class="payroll-table app-flow-table">
            <caption class="sr-only">按发薪月份展示的税前工资、个人所得税及收入差值</caption>
            <thead><tr><th>发薪月份</th><th>税前工资</th><th>个人所得税</th><th>收入差值</th></tr></thead>
            <tbody v-for="row in appFlowTableRows" :key="row.recordKey" class="month-group">
              <tr v-if="row.recordType === 'yearTotal'" class="month-row year-total-row">
                <th>{{ row.year }} 年合计</th>
                <td data-label="税前工资">{{ formatMoney(row.income) }}</td>
                <td data-label="个人所得税">{{ formatMoney(row.tax) }}</td>
                <td data-label="收入差值">—</td>
              </tr>
              <tr v-else class="month-row">
                <th>{{ row.month }}<small>{{ row.incomeType }}</small></th>
                <td data-label="税前工资"><CopyAmount :amount="row.income" :label="`${row.month} 税前工资`" :copied="copied.has(`${row.month}:${appCopyField(row, 'gross')}`)" :pending="pending.has(`${row.month}:${appCopyField(row, 'gross')}`)" @copy="copy(row.month, appCopyField(row, 'gross'), row.income, '税前工资')" /></td>
                <td data-label="个人所得税"><CopyAmount :amount="row.tax" :label="`${row.month} 个人所得税`" :copied="copied.has(`${row.month}:${appCopyField(row, 'tax')}`)" :pending="pending.has(`${row.month}:${appCopyField(row, 'tax')}`)" @copy="copy(row.month, appCopyField(row, 'tax'), row.tax, '个人所得税')" /></td>
                <td data-label="收入差值">{{ formatMoney(row.difference) }}</td>
              </tr>
            </tbody>
            <tfoot><tr><th>全部合计</th><td class="app-flow-total-income">{{ formatMoney(appFlowTotals.income) }}</td><td>{{ formatMoney(appFlowTotals.tax) }}</td><td>—</td></tr></tfoot>
          </table>
        </div>
      </div>
    </template>
    <div v-else class="card empty-results">
      <div class="empty-illustration" aria-hidden="true"><div class="paper-lines"><span></span><span></span><span></span><span></span></div><span class="empty-currency">¥</span></div>
      <span class="eyebrow">YOUR PAY, EXPLAINED</span><h2>每个月，到手多少？</h2><p>填写工资和任职时间，查看每月到手收入、<br />累计个税，以及你和公司的五险一金。</p>
      <div class="empty-features"><span>01 <b>按月折算</b></span><span>02 <b>累计计税</b></span><span>03 <b>缴费明细</b></span></div>
    </div>
    <div class="calculation-note"><UiIcon name="info" /><p>所有月份使用库内最新城市政策，属于统一口径测算，不还原历史政策。个税按工资所属年份累计，每年 1 月重置；个税 App 流水仅将结果顺延至次月展示，不重新计税。不含专项附加扣除和年度汇算。</p></div>
  </section>
</template>
