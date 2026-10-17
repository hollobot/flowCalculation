<script setup>
import { computed, reactive, ref, watch } from 'vue';
import Decimal from 'decimal.js';
import { calculatePayroll, createOffsets } from '../domain/payroll.js';
import { calendarYears, listMonths } from '../domain/calendar.js';
import PayrollResults from './PayrollResults.vue';
import PolicyDetails from './PolicyDetails.vue';
import CityCombobox from './CityCombobox.vue';

defineOptions({ name: 'CalculatorPage' });
const props = defineProps({ cities: { type: Array, required: true }, loading: Boolean });
const form = reactive({
  city: '', salary: 8000, fluctuation: 540.2, start: '2025-02-01', end: '2026-02-01',
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
let offsets = {};
let offsetKey = '';
const groups = [{ key: 'social', title: '社保' }, { key: 'fund', title: '公积金' }];

watch(() => props.cities, (cities) => {
  if (!form.city && cities.length) form.city = (cities.find((city) => city.policy) || cities[0]).name;
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
        <p v-if="!policy && !loading" class="helper">{{ form.city.trim() ? '城市不存在。' : '请搜索并选择已有城市。' }}<RouterLink :to="{ name: 'sync' }">前往添加城市并同步 →</RouterLink></p>
        <p v-else-if="policy" class="helper policy-date"><span class="status-dot"></span>已选择 {{ selectedCity.name }} · 更新于 {{ selectedCity.syncedAt?.slice(0, 10) }}</p>
        <div class="field-grid"><label>固定税前月薪<div class="input-unit"><input v-model.number="form.salary" type="number" min="0" max="1000000000" step="0.01" required inputmode="decimal" /><span>元</span></div></label><label>每月随机浮动 ±<div class="input-unit"><input v-model.number="form.fluctuation" type="number" min="0" :max="form.salary" step="0.01" required inputmode="decimal" /><span>元</span></div></label></div>
        <div class="field-grid"><label>入职日期<input v-model="form.start" type="date" min="2019-01-01" :max="form.end || undefined" required /></label><label>离职日期<input v-model="form.end" type="date" :min="form.start || '2019-01-01'" required /></label></div>
        <p class="helper">首尾月按计薪天数比例折算，离职当天计薪。非整月日历已收录 {{ calendarYears }} 年。</p>
      </fieldset>
      <fieldset><legend><span class="step">02</span> 五险一金</legend>
        <div v-for="group in groups" :key="group.key" class="contribution-config">
          <label>{{ group.title }}缴费基数<select v-model="form[group.key].mode"><option value="minimum">政策最低基数</option><option value="salary">固定月薪全额</option><option value="custom">自定义基数</option></select></label>
          <label v-if="form[group.key].mode === 'custom'">{{ group.title }}自定义基数（元）<input v-model.number="form[group.key].base" type="number" min="0" max="1000000000" step="0.01" required inputmode="decimal" /></label>
          <div class="field-grid small-fields"><label>首月{{ group.title }}<select v-model="form[group.key].first"><option value="auto">自动：≤15 日入职缴纳</option><option value="yes">缴纳整月</option><option value="no">不缴纳</option></select></label><label>末月{{ group.title }}<select v-model="form[group.key].last" :disabled="form.start.slice(0, 7) === form.end.slice(0, 7)"><option value="yes">缴纳整月</option><option value="no">不缴纳</option></select></label></div>
        </div>
        <p class="helper">同月入离职以首月规则为准；基数按政策上下限限制。入离职月开关为测算设置。</p>
        <label class="checkbox-label"><input v-model="form.customRates" type="checkbox" :disabled="!policy" /> 自定义缴费比例<span class="muted">默认取政策最低档</span></label>
        <div v-if="form.customRates && policy" class="rate-fields"><div class="rate-head"><span>缴费项目</span><span>个人 %</span><span>公司 %</span></div><div v-for="item in policy.items" :key="item.key" class="rate-row"><span>{{ item.label }}</span><input v-model.number="form.rates[item.key].personal" :aria-label="`${item.label}个人比例（百分比）`" type="number" min="0" :max="item.group === 'fund' ? 12 : 100" step="0.0001" :disabled="!item.personal" required /><input v-model.number="form.rates[item.key].company" :aria-label="`${item.label}公司比例（百分比）`" type="number" min="0" :max="item.group === 'fund' ? 12 : 100" step="0.0001" :disabled="!item.company" required /></div><p class="helper">未单独缴费的项目不可编辑；公积金比例最高 12%，不含补充公积金。</p></div>
      </fieldset>
      <fieldset><legend><span class="step">03</span> 年终奖</legend>
        <label class="checkbox-label"><input v-model="form.bonusEnabled" type="checkbox" /> 本次计算包含年终奖</label>
        <template v-if="form.bonusEnabled"><div class="field-grid"><label>发放年月<input v-model="form.bonusMonth" type="month" :min="form.start.slice(0, 7)" :max="form.end.slice(0, 7)" required /></label><label>奖金金额（不含工资）<input v-model.number="form.bonusAmount" type="number" min="0" max="1000000000" step="0.01" required /></label></div><label>计税方式<select v-model="form.bonusMode"><option value="separate">单独计税</option><option value="combined">并入综合所得</option></select></label><p class="helper">单独计税政策已收录至 2027 年底，奖金不会按出勤天数折算。</p></template>
      </fieldset>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
      <div class="form-actions"><button class="button primary-button" type="submit" :disabled="!policy || loading">计算工资 <span>→</span></button><button class="button secondary-button" type="button" :disabled="!policy || loading" @click="calculate(true)">重新生成浮动</button></div>
      <p class="helper centered">普通重算保留浮动值 · 刷新页面不保留结果</p>
    </form>
    <div class="results-column">
      <div class="module-heading"><div><span class="eyebrow">CALCULATION RESULTS</span><h2>收入与缴费总览</h2></div><span class="pill">按月展示</span></div>
      <PayrollResults :result="result" :dirty="dirty" />
      <div v-if="policy" class="card policy-card"><PolicyDetails :policy="policy" /></div>
    </div>
  </div>
</template>
