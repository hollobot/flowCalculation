<script setup>
import { computed, nextTick, ref, watch, watchEffect } from 'vue';

const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: String, default: '' },
  cities: { type: Array, required: true },
  label: { type: String, default: '城市' },
  allowCreate: Boolean,
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const input = ref(null);
const opened = ref(false);
const activeIndex = ref(-1);
const matches = computed(() => {
  const keyword = props.modelValue.trim().toLocaleLowerCase();
  return props.cities.filter((city) => city.name.toLocaleLowerCase().includes(keyword));
});
const exists = computed(() => props.cities.some((city) => city.name === props.modelValue.trim()));

watch(() => props.modelValue, () => { activeIndex.value = -1; });
watch(() => props.disabled, (disabled) => { if (disabled) opened.value = false; });
watchEffect(() => {
  // 计算页只能选择已有城市；同步页允许提交新名称，但是否入库由服务端查询结果决定。
  input.value?.setCustomValidity(!props.allowCreate && props.modelValue && !exists.value ? '城市不存在，请选择列表中的城市' : '');
});

function selectCity(city) {
  emit('update:modelValue', city.name);
  opened.value = false;
  activeIndex.value = -1;
}

async function onKeydown(event) {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    opened.value = false;
  } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    opened.value = true;
    const count = matches.value.length;
    if (!count) return;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value = activeIndex.value < 0 ? (direction > 0 ? 0 : count - 1) : (activeIndex.value + direction + count) % count;
    await nextTick();
    document.getElementById(`${props.id}-option-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter' && opened.value && matches.value[activeIndex.value]) {
    event.preventDefault();
    selectCity(matches.value[activeIndex.value]);
  }
}
</script>

<template>
  <div class="city-combobox" @focusout="opened = false">
    <label :for="id">{{ label }}</label>
    <div class="city-input-wrap">
      <input
        :id="id" ref="input" :value="modelValue" :disabled="disabled" required maxlength="80"
        :placeholder="allowCreate ? '搜索已有城市，或输入新城市名称' : '输入城市名称搜索'"
        role="combobox" aria-autocomplete="list" :aria-expanded="opened"
        :aria-controls="`${id}-options`"
        :aria-activedescendant="opened && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined"
        autocomplete="off" @focus="opened = true" @keydown="onKeydown"
        @input="emit('update:modelValue', $event.target.value); opened = true"
      />
      <span class="city-input-arrow" aria-hidden="true">⌄</span>
    </div>
    <div v-if="opened && !disabled" class="city-dropdown">
      <div class="city-dropdown-title">已有城市 · {{ matches.length }}</div>
      <ul :id="`${id}-options`" role="listbox" :aria-label="label">
        <li
          v-for="(city, index) in matches" :id="`${id}-option-${index}`" :key="city.name"
          role="option" :aria-selected="city.name === modelValue"
          :class="{ highlighted: index === activeIndex, selected: city.name === modelValue }"
          @mousedown.prevent @click="selectCity(city)"
        >
          <span>{{ city.name }}</span><small>{{ city.policy ? '已同步' : '待同步' }}</small>
        </li>
      </ul>
      <p v-if="!matches.length" class="city-no-match">{{ modelValue.trim() ? '城市不存在' : '暂无已保存城市' }}</p>
      <p v-if="allowCreate && modelValue.trim() && !exists" class="city-create-hint">可同步新城市“{{ modelValue.trim() }}”，查询成功后保存。</p>
    </div>
  </div>
</template>
