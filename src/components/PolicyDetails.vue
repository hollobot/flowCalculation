<script setup>
import { formatRate, roundLabels } from '../domain/money.js';
import ArrowUpRightIcon from './ArrowUpRightIcon.vue';
defineProps({ policy: { type: Object, required: true } });
const range = (side) => side ? `${side.min.toLocaleString('zh-CN')} – ${side.max.toLocaleString('zh-CN')}` : '—';
const sides = [{ key: 'personal', label: '个人' }, { key: 'company', label: '公司' }];
const fixedAmounts = (entries) => entries.map((entry) => `${entry.months.join('、')} 月：${entry.amount} 元/月`).join('；');
</script>

<template>
  <details class="policy-details">
    <summary>查看本次使用的城市政策 <span>{{ policy.name }} <ArrowUpRightIcon class="icon-arrow-up-right" /></span></summary>
    <div class="details-body">
      <p class="helper">以下为当前城市保存的缴费标准，默认使用最低档比例。</p>
      <p class="helper">按已保存的基数和比例测算；附加金额及文字备注中的其他缴费规则不计入。</p>
      <p v-if="policy.fundTaxFreeLimit" class="helper">政策记录的额外公积金免税上限为 {{ policy.fundTaxFreeLimit }}；本次测算未单独应用该上限。</p>
      <div class="table-scroll">
        <table class="policy-table">
          <caption class="sr-only">社保公积金缴费基数、比例和舍入规则</caption>
          <thead><tr><th>项目</th><th>个人基数范围</th><th>个人比例</th><th>公司基数范围</th><th>公司比例</th><th>舍入规则</th></tr></thead>
          <tbody><tr v-for="item in policy.items" :key="item.key"><th>{{ item.label }}</th><td>{{ range(item.personal) }}</td><td>{{ formatRate(item.personal?.rate) }}</td><td>{{ range(item.company) }}</td><td>{{ formatRate(item.company?.rate) }}</td><td>{{ item.precision }} 位 · {{ roundLabels[item.roundMode] }}</td></tr></tbody>
        </table>
      </div>
      <template v-for="side in sides" :key="side.key">
        <p v-if="policy.seriousIllness?.[side.key]?.length" class="helper">{{ side.label }}附加大病医疗：{{ fixedAmounts(policy.seriousIllness[side.key]) }}。仅展示，不参与工资测算。</p>
      </template>
      <p class="helper">展示默认最低档比例；工伤取最低档，补充公积金不缴。自定义比例以计算明细为准。</p>
    </div>
  </details>
</template>
