<script setup>
import { computed, reactive, ref, watch } from 'vue';
import Decimal from 'decimal.js';
import { calculatePayroll, createOffsets } from '../domain/payroll.js';
import { calendarYears, listMonths } from '../domain/calendar.js';
import PayrollResults from './PayrollResults.vue';
import PolicyDetails from './PolicyDetails.vue';
import CityCombobox from './CityCombobox.vue';
import UiIcon from './UiIcon.vue';
import FormSelect from './FormSelect.vue';

defineOptions({ name: 'CalculatorPage' });
const props = defineProps({ cities: { type: Array, required: true }, loading: Boolean });
const form = reactive({
  city: '', salary: 8000, fluctuation: 540.2, start: '2025-02-01', end: '2026-02-01',
  probation: { enabled: false, months: 3, percent: 80 }, monthlyIncome: {},
  bonusEnabled: false, bonusMonth: '2026-02', bonusAmount: 50000, bonusMode: 'separate',
  social: { mode: 'minimum', base: 5000, first: 'auto', last: 'yes' },
  fund: { mode: 'minimum', base: 5000, first: 'auto', last: 'yes' },
  customRates: false, rates: {},
});
const selectedCity = computed(() => props.cities.find((city) => city.name === form.city.trim()));
const policy = computed(() => selectedCity.value?.policy);
const result = ref(null);
const error = ref('');
const dirty = ref(false);
const incomeMonths = computed(() => {
  try { return listMonths(form.start, form.end); }
  catch { return []; }
});
const monthlySettings = computed(() => incomeMonths.value.map((month) => ({
  month,
  settings: form.monthlyIncome[month],
})));
let offsets = {};
let offsetKey = '';
const groups = [{ key: 'social', title: '社保' }, { key: 'fund', title: '公积金' }];
const baseModeOptions = [
  { value: 'minimum', label: '政策最低基数' },
  { value: 'salary', label: '固定月薪全额' },
  { value: 'custom', label: '自定义基数' },
];
const bonusModeOptions = [
  { value: 'separate', label: '单独计税' },
  { value: 'combined', label: '并入综合所得' },
];

watch(() => props.cities, (cities) => {
  if (!form.city && cities.length) form.city = (cities.find((city) => city.policy) || cities[0]).name;
}, { immediate: true });
watch(incomeMonths, (months) => {
  // null 表示持续跟随全局月薪；三个逐月开关都默认开启，并补齐热更新前已有的设置。
  for (const month of months) {
    const settings = form.monthlyIncome[month] ??= { salary: null };
    settings.floating ??= true;
    settings.social ??= true;
    settings.fund ??= true;
  }
}, { immediate: true });
watch(policy, (value, previous) => {
  // 同一城市刷新数据库时保留用户已填写的比例，切换城市才重新带入默认值。
  if (form.customRates && value?.id === previous?.id) {
    if (result.value) dirty.value = true;
    return;
  }
  form.rates = Object.fromEntries((value?.items || []).map((item) => [item.key, {
    personal: new Decimal(item.personal?.rate || 0).times(100).toNumber(),
    company: new Decimal(item.company?.rate || 0).times(100).toNumber(),
  }]));
  if (result.value) dirty.value = true;
}, { immediate: true });
watch(form, () => { if (result.value) dirty.value = true; }, { deep: true });

function probationRate(index) {
  const months = Number(form.probation.months);
  const percent = Number(form.probation.percent);
  if (!form.probation.enabled || index >= months || !Number.isFinite(percent)) return new Decimal(1);
  return new Decimal(percent).div(100);
}

function monthSalaryValue(month, index) {
  const salary = form.monthlyIncome[month].salary ?? form.salary;
  if (salary === '') return '';
  return new Decimal(salary).times(probationRate(index)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function setMonthSalary(month, index, event) {
  if (event.target.value === '') {
    form.monthlyIncome[month].salary = '';
    return;
  }
  const rate = probationRate(index);
  // 列表编辑的是折后固定收入，内部还原为折前值，使试用期比例变化时可以继续联动。
  form.monthlyIncome[month].salary = rate.isZero()
    ? event.target.valueAsNumber
    : new Decimal(event.target.valueAsNumber).div(rate).toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toNumber();
}

function calculate(regenerate = false) {
  error.value = '';
  try {
    const months = listMonths(form.start, form.end);
    const key = JSON.stringify([form.start, form.end, form.fluctuation]);
    // 折叠明细、切换页面和普通重算都复用浮动值；主动重新生成或变更期间/幅度才重新抽取。
    if (regenerate || key !== offsetKey) {
      offsets = createOffsets(months, form.fluctuation);
      offsetKey = key;
    }
    result.value = calculatePayroll(form, policy.value, offsets);
    dirty.value = false;
  } catch (cause) {
    error.value = cause.message;
  }
}
</script>

<template>
  <div class="page-title"><div><span class="eyebrow">SALARY CALCULATOR</span><h1>工资算清楚，收入更有数。</h1><p>从税前到到手，拆解每个月的收入与缴费。</p></div><span class="title-mark" aria-hidden="true">¥</span></div>
  <div class="calculator-layout">
    <form class="card calculator-form" @submit.prevent="calculate(false)">
      <div class="card-heading"><h2>计算条件</h2><span class="pill">仅本次使用</span></div>
      <fieldset><legend><span class="step">01</span> 收入与任职</legend>
        <CityCombobox id="calculator-city" v-model="form.city" :cities="cities" label="社保公积金缴纳地" :disabled="loading" />
        <p v-if="!policy && !loading" class="helper">{{ form.city.trim() ? '城市不存在。' : '请搜索并选择已有城市。' }}<RouterLink class="inline-link" :to="{ name: 'sync' }">前往添加城市并同步 <UiIcon name="arrow-right" /></RouterLink></p>
        <p v-else-if="policy" class="helper policy-date"><span class="status-dot"></span>已选择 {{ selectedCity.name }} · 更新于 {{ selectedCity.syncedAt?.slice(0, 10) }}</p>
        <div class="field-grid"><label>默认固定税前月薪<div class="input-unit"><input v-model.number="form.salary" type="number" min="0" max="1000000000" step="0.01" required inputmode="decimal" /><span>元</span></div></label><label>每月随机浮动 ±<div class="input-unit"><input v-model.number="form.fluctuation" type="number" min="0" max="1000000000" step="0.01" required inputmode="decimal" /><span>元</span></div></label></div>
        <div class="field-grid"><label>入职日期<input v-model="form.start" type="date" min="2019-01-01" :max="form.end || undefined" required /></label><label>离职日期<input v-model="form.end" type="date" :min="form.start || '2019-01-01'" required /></label></div>
        <label class="checkbox-label"><input v-model="form.probation.enabled" type="checkbox" /> 启用试用期工资<span class="muted">从入职月开始计算</span></label>
        <div v-if="form.probation.enabled" class="field-grid">
          <label>试用期月数<input v-model.number="form.probation.months" type="number" min="1" max="120" step="1" required inputmode="numeric" /></label>
          <label>试用期工资比例<div class="input-unit"><input v-model.number="form.probation.percent" type="number" min="0" max="100" step="0.01" required inputmode="decimal" /><span>%</span></div></label>
        </div>
        <p v-if="form.probation.enabled" class="helper">入职当月算第 1 个月；先对当月固定月薪应用试用期比例，再计算浮动和首尾月出勤折算。年终奖不打折。</p>
        <details v-if="monthlySettings.length" class="monthly-income-settings">
          <summary>逐月固定税前收入、浮动与缴费 <span>{{ monthlySettings.length }} 个月</span></summary>
          <div class="monthly-income-head" aria-hidden="true"><span>月份</span><span>固定税前月薪</span><span>浮动 / 社保 / 公积金</span></div>
          <div v-for="({ month, settings }, index) in monthlySettings" :key="month" class="monthly-income-row">
            <span class="monthly-income-month">{{ month }} <small v-if="form.probation.enabled && index < Number(form.probation.months)">试用期</small></span>
            <label class="sr-only" :for="`monthly-income-${month}`">{{ month }} 固定税前月薪</label>
            <div class="input-unit"><input :id="`monthly-income-${month}`" :value="monthSalaryValue(month, index)" type="number" min="0" max="1000000000" step="0.01" required inputmode="decimal" @input="setMonthSalary(month, index, $event)" /><span>元</span></div>
            <div class="monthly-income-switches">
              <label><input v-model="settings.floating" type="checkbox" /> <span>浮动</span></label>
              <label><input v-model="settings.social" type="checkbox" /> <span>社保</span></label>
              <label><input v-model="settings.fund" type="checkbox" /> <span>公积金</span></label>
            </div>
          </div>
          <p class="helper">试用期月份直接显示折后固定收入；修改试用期设置会同步重算。每月默认开启浮动、社保和公积金，逐月缴费开关为最终选择。</p>
        </details>
        <p class="helper">首尾月按计薪天数比例折算，离职当天计薪。非整月日历已收录 {{ calendarYears }} 年。</p>
      </fieldset>
      <fieldset><legend><span class="step">02</span> 五险一金</legend>
        <div v-for="group in groups" :key="group.key" class="contribution-config">
          <FormSelect :id="`${group.key}-base-mode`" v-model="form[group.key].mode" :label="`${group.title}缴费基数`" :options="baseModeOptions" />
          <label v-if="form[group.key].mode === 'custom'">{{ group.title }}自定义基数（元）<input v-model.number="form[group.key].base" type="number" min="0" max="1000000000" step="0.01" required inputmode="decimal" /></label>
        </div>
        <p class="helper">基数按政策上下限限制；每个月是否缴纳社保、公积金在上方逐月设置中选择。</p>
        <label class="checkbox-label"><input v-model="form.customRates" type="checkbox" :disabled="!policy" /> 自定义缴费比例<span class="muted">默认取政策最低档</span></label>
        <div v-if="form.customRates && policy" class="rate-fields"><div class="rate-head"><span>缴费项目</span><span>个人 %</span><span>公司 %</span></div><div v-for="item in policy.items" :key="item.key" class="rate-row"><span>{{ item.label }}</span><input v-model.number="form.rates[item.key].personal" :aria-label="`${item.label}个人比例（百分比）`" type="number" min="0" :max="item.group === 'fund' ? 12 : 100" step="0.0001" :disabled="!item.personal" required /><input v-model.number="form.rates[item.key].company" :aria-label="`${item.label}公司比例（百分比）`" type="number" min="0" :max="item.group === 'fund' ? 12 : 100" step="0.0001" :disabled="!item.company" required /></div><p class="helper">未单独缴费的项目不可编辑；公积金比例最高 12%，不含补充公积金。</p></div>
      </fieldset>
      <fieldset><legend><span class="step">03</span> 年终奖</legend>
        <label class="checkbox-label"><input v-model="form.bonusEnabled" type="checkbox" /> 本次计算包含年终奖</label>
        <template v-if="form.bonusEnabled"><div class="field-grid"><label>发放年月<input v-model="form.bonusMonth" type="month" :min="form.start.slice(0, 7)" :max="form.end.slice(0, 7)" required /></label><label>奖金金额（不含工资）<input v-model.number="form.bonusAmount" type="number" min="0" max="1000000000" step="0.01" required /></label></div><FormSelect id="bonus-mode" v-model="form.bonusMode" label="计税方式" :options="bonusModeOptions" /><p class="helper">单独计税政策已收录至 2027 年底，奖金不会按出勤天数折算。</p></template>
      </fieldset>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
      <div class="form-actions"><button class="button primary-button" type="submit" :disabled="!policy || loading">计算工资 <UiIcon name="arrow-right" class="button-end-icon" /></button><button class="button secondary-button" type="button" :disabled="!policy || loading" @click="calculate(true)">重新生成浮动</button></div>
      <p class="helper centered">普通重算保留浮动值 · 刷新页面不保留结果</p>
    </form>
    <div class="results-column">
      <div class="module-heading"><div><span class="eyebrow">CALCULATION RESULTS</span><h2>收入与缴费总览</h2></div><span class="pill">按月展示</span></div>
      <PayrollResults :result="result" :dirty="dirty" />
      <div v-if="policy" class="card policy-card"><PolicyDetails :policy="policy" /></div>
    </div>
  </div>
</template>
