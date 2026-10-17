<script setup>
import { computed, nextTick, ref, watch, watchEffect } from 'vue';
import UiIcon from './UiIcon.vue';

const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: [String, Array], default: '' },
  cities: { type: Array, required: true },
  label: { type: String, default: '城市' },
  allowCreate: Boolean,
  multiple: Boolean,
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const input = ref(null);
const query = ref('');
const opened = ref(false);
const activeIndex = ref(-1);
const selectedNames = computed(() => (props.multiple
  ? (Array.isArray(props.modelValue) ? props.modelValue : []).filter((name) => typeof name === 'string')
  : []));
const keyword = computed(() => (props.multiple ? query.value : String(props.modelValue || '')).trim().toLocaleLowerCase());
const matches = computed(() => props.cities.filter((city) => city.name.toLocaleLowerCase().includes(keyword.value)));
const exists = computed(() => props.cities.some((city) => city.name === query.value.trim()));

watch(() => props.modelValue, (value) => {
  if (!props.multiple) query.value = String(value || '');
  activeIndex.value = -1;
}, { immediate: true });
watch(() => props.disabled, (disabled) => { if (disabled) opened.value = false; });
watchEffect(() => {
  // 计算页只允许选择已有城市；同步页允许输入新名称，但仍由服务端查询成功后保存。
  input.value?.setCustomValidity(!props.multiple && !props.allowCreate && props.modelValue && !exists.value
    ? '城市不存在，请选择列表中的城市' : '');
});

function removeCity(name) {
  emit('update:modelValue', selectedNames.value.filter((city) => city !== name));
}

function onInput(event) {
  if (props.multiple) query.value = event.target.value;
  else emit('update:modelValue', event.target.value);
  opened.value = true;
}

function selectCity(city) {
  if (props.multiple) {
    if (selectedNames.value.includes(city.name)) removeCity(city.name);
    else emit('update:modelValue', [...selectedNames.value, city.name]);
    query.value = '';
    opened.value = true;
  } else {
    emit('update:modelValue', city.name);
    opened.value = false;
    activeIndex.value = -1;
  }
}

function selectCustom() {
  const name = query.value.trim();
  if (!props.allowCreate || !name) return;
  if (props.multiple) {
    if (!selectedNames.value.includes(name)) emit('update:modelValue', [...selectedNames.value, name]);
    query.value = '';
    opened.value = true;
  } else {
    emit('update:modelValue', name);
    opened.value = false;
  }
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
  } else if (event.key === 'Enter' && opened.value) {
    event.preventDefault();
    if (matches.value[activeIndex.value]) selectCity(matches.value[activeIndex.value]);
    else if (props.allowCreate) selectCustom();
  } else if (event.key === 'Backspace' && props.multiple && !query.value && selectedNames.value.length) {
    removeCity(selectedNames.value.at(-1));
  }
}
</script>

<template>
  <div class="city-combobox" @focusout="opened = false">
    <label :for="id">{{ label }}</label>
    <div v-if="multiple && selectedNames.length" class="city-selected-list" aria-label="已选择城市">
      <button v-for="name in selectedNames" :key="name" type="button" class="city-chip" :disabled="disabled" @click="removeCity(name)">
        {{ name }} <UiIcon name="close" />
      </button>
    </div>
    <div class="city-input-wrap">
      <input
        :id="id" ref="input" :value="multiple ? query : modelValue" :disabled="disabled"
        :required="!multiple" maxlength="80" :placeholder="multiple ? '搜索并勾选城市，可连续选择' : (allowCreate ? '搜索已有城市，或输入新城市名称' : '输入城市名称搜索')"
        role="combobox" aria-autocomplete="list" :aria-expanded="opened" :aria-controls="`${id}-options`"
        :aria-activedescendant="opened && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined"
        autocomplete="off" @focus="opened = true" @keydown="onKeydown" @input="onInput"
      />
      <span class="city-input-arrow" aria-hidden="true"></span>
    </div>
    <div v-if="opened && !disabled" class="city-dropdown">
      <div class="city-dropdown-title">{{ multiple ? `选择城市 · 已选 ${selectedNames.length} 个` : `已有城市 · ${matches.length}` }}</div>
      <ul :id="`${id}-options`" role="listbox" :aria-label="label" :aria-multiselectable="multiple || undefined">
        <li
          v-for="(city, index) in matches" :id="`${id}-option-${index}`" :key="city.name"
          role="option" :aria-selected="multiple ? selectedNames.includes(city.name) : city.name === modelValue"
          :class="{ highlighted: index === activeIndex, selected: multiple ? selectedNames.includes(city.name) : city.name === modelValue }"
          @mousedown.prevent @click="selectCity(city)"
        >
          <span class="city-option-label"><UiIcon v-if="multiple" :name="selectedNames.includes(city.name) ? 'check' : 'plus'" />{{ city.name }}</span><small>{{ city.policy ? '已同步' : '待同步' }}</small>
        </li>
      </ul>
      <p v-if="!matches.length" class="city-no-match">{{ keyword ? '城市不存在' : '暂无已保存城市' }}</p>
      <button v-if="allowCreate && keyword && !exists" type="button" class="city-create-hint" @mousedown.prevent @click="selectCustom">添加“{{ query.trim() }}”到同步列表</button>
    </div>
  </div>
</template>
