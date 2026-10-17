<script setup>
defineProps({
  name: {
    type: String,
    required: true,
  },
});
</script>

<template>
  <!-- 常用界面图标集中维护，确保导航、按钮和提示中的线宽与对齐一致。 -->
  <svg class="ui-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
    <template v-if="name === 'calculator'">
      <rect x="4" y="2.75" width="12" height="14.5" rx="2.25" />
      <path d="M7 6.25h6M7.25 10h.01M10 10h.01M12.75 10h.01M7.25 13.25h.01M10 13.25h.01M12.75 13.25h.01" />
    </template>
    <template v-else-if="name === 'sync'">
      <path d="M15.8 7.25A6.1 6.1 0 0 0 5.1 5.1L3.5 6.7" />
      <path d="M3.5 3.9v2.8h2.8M4.2 12.75a6.1 6.1 0 0 0 10.7 2.15l1.6-1.6" />
      <path d="M16.5 16.1v-2.8h-2.8" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="8.75" cy="8.75" r="4.75" />
      <path d="m12.25 12.25 3.75 3.75" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9.2v4.2M10 6.65h.01" />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="M4 10h11M11.5 6.5 15 10l-3.5 3.5" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m4.5 10 3.5 3.5 7.5-7.5" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M10 4.5v11M4.5 10h11" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m6 6 8 8M14 6l-8 8" />
    </template>
  </svg>
</template>
