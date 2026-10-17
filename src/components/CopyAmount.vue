<script setup>
import { formatMoney } from '../domain/money.js';

defineProps({ amount: { type: Number, required: true }, label: { type: String, required: true }, copied: Boolean, pending: Boolean });
defineEmits(['copy']);
</script>

<template>
  <span class="copy-amount" :class="{ 'is-copied': copied }">
    <span class="copy-amount-value">{{ formatMoney(amount) }}</span>
    <button
      type="button" class="copy-amount-button" :disabled="pending" :aria-label="`复制${label}`"
      :title="copied ? '已复制，点击可再次复制' : `复制${label}`" @click="$emit('copy')"
    >
      <svg v-if="!copied" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M12 4V3H3v9h1" /></svg>
      <svg v-else viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
      <span class="sr-only">{{ pending ? '复制中' : copied ? '已复制' : '复制' }}</span>
    </button>
  </span>
</template>
