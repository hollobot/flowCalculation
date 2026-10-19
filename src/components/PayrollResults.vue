<script setup>
import { computed } from 'vue';
import { formatMoney, formatRate, roundLabels } from '../domain/money.js';
import { useAmountCopy } from '../composables/useAmountCopy.js';
import CopyAmount from './CopyAmount.vue';
import UiIcon from './UiIcon.vue';
const props = defineProps({ result: { type: Object, default: null }, dirty: Boolean });
const { copied, pending, message, error, copy, reset } = useAmountCopy(() => props.result);

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

function contributionBasis(item, side) {
  if (!item[side].available) return '—';
  return item.fixed ? '按月定额' : `${item[side].base} / ${formatRate(item[side].rate)}`;
}

const copyField = (row, field) => row.recordType === 'bonus' ? `bonus-${field}` : field;
</script>

<template>
  <section class="results-panel" aria-label="计算结果" aria-live="polite">
    <template v-if="result">
      <div v-if="dirty" class="notice warning">参数或政策已更新，以下仍为上次结果，请点击“计算工资”。</div>
      <div class="summary-cards">
        <article class="summary-card primary"><span>预计累计到手 <small>元</small></span><strong>{{ formatMoney(result.totals.net) }}</strong><div>{{ result.rows.length }} 个月 · 含年终奖</div></article>
        <article class="summary-card"><span>累计税前收入 <small>元</small></span><strong>{{ formatMoney(result.totals.gross + result.totals.bonus) }}</strong><div>年终奖 {{ formatMoney(result.totals.bonus) }}</div></article>
        <article class="summary-card"><span>累计个人所得税 <small>元</small></span><strong>{{ formatMoney(result.totals.tax) }}</strong><div>个人五险一金 {{ formatMoney(result.totals.personal) }}</div></article>
      </div>
      <div class="card result-card">
        <div class="card-heading result-heading">
          <div><h2>每月工资明细</h2><p>{{ result.rows[0].month }} — {{ result.rows.at(-1).month }} · {{ result.policyName }}</p></div>
          <div class="result-heading-actions">
            <span class="pill">人民币 / 元</span>
            <button type="button" class="button small-button secondary-button" :disabled="!copied.size && !pending.size" @click="reset">重置复制标记</button>
          </div>
        </div>
        <div class="copy-toolbar"><span>点击金额旁的按钮，复制当前月份的对应金额。</span><span>{{ copied.size ? `已标记 ${copied.size} 项` : '已复制的金额将以蓝色标记' }}</span></div>
        <p v-if="error" class="notice error copy-feedback" role="alert">{{ error }}</p>
        <p class="sr-only" role="status">{{ message }}</p>
        <div class="table-scroll">
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
      </div>
    </template>
    <div v-else class="card empty-results">
      <div class="empty-illustration" aria-hidden="true"><div class="paper-lines"><span></span><span></span><span></span><span></span></div><span class="empty-currency">¥</span></div>
      <span class="eyebrow">YOUR PAY, EXPLAINED</span><h2>每个月，到手多少？</h2><p>填写工资和任职时间，查看每月到手收入、<br />累计个税，以及你和公司的五险一金。</p>
      <div class="empty-features"><span>01 <b>按月折算</b></span><span>02 <b>累计计税</b></span><span>03 <b>缴费明细</b></span></div>
    </div>
    <div class="calculation-note"><UiIcon name="info" /><p>所有月份使用库内最新城市政策，属于统一口径测算，不还原历史政策。个税按年累计，每年 1 月重置；不含专项附加扣除和年度汇算。</p></div>
  </section>
</template>
