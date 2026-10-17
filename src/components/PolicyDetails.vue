<script setup>
import { formatRate, roundLabels } from '../domain/money.js';
defineProps({ policy: { type: Object, required: true } });
const range = (side) => side ? `${side.min.toLocaleString('zh-CN')} – ${side.max.toLocaleString('zh-CN')}` : '—';
</script>

<template>
  <details class="policy-details">
    <summary>查看本次使用的城市政策 <span>{{ policy.name }} ↗</span></summary>
    <div class="details-body">
      <p class="helper">{{ policy.description }} {{ policy.note }}</p>
      <p v-if="policy.unsupported?.length" class="notice warning">含尚未支持的{{ policy.unsupported.join('、') }}，计算时将提示处理。</p>
      <p v-if="policy.fundTaxFreeLimit" class="notice warning">数据源提供额外公积金免税上限 {{ policy.fundTaxFreeLimit }}，需核对其计税口径后才能计算。</p>
      <div class="table-scroll">
        <table class="policy-table">
          <caption class="sr-only">社保公积金缴费基数、比例和舍入规则</caption>
          <thead><tr><th>项目</th><th>个人基数范围</th><th>个人比例</th><th>公司基数范围</th><th>公司比例</th><th>舍入规则</th></tr></thead>
          <tbody><tr v-for="item in policy.items" :key="item.key"><th>{{ item.label }}</th><td>{{ range(item.personal) }}</td><td>{{ formatRate(item.personal?.rate) }}</td><td>{{ range(item.company) }}</td><td>{{ formatRate(item.company?.rate) }}</td><td>{{ item.precision }} 位 · {{ roundLabels[item.roundMode] }}</td></tr></tbody>
        </table>
      </div>
      <p class="helper">展示默认最低档比例；工伤取最低档，补充公积金不缴。自定义比例以计算明细为准。</p>
    </div>
  </details>
</template>
