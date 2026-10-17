<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import UiIcon from './UiIcon.vue';

const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: [String, Number], required: true },
  label: { type: String, required: true },
  options: { type: Array, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const root = ref(null);
const trigger = ref(null);
const opened = ref(false);
const activeIndex = ref(-1);
const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue));

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) opened.value = false;
  },
);

function open() {
  if (props.disabled) return;
  activeIndex.value = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.modelValue),
  );
  opened.value = true;
}

function toggle() {
  if (opened.value) opened.value = false;
  else open();
}

async function selectOption(option) {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  opened.value = false;
  await nextTick();
  trigger.value?.focus();
}

function moveActive(direction) {
  const enabledIndexes = props.options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  if (!enabledIndexes.length) return;
  const current = enabledIndexes.indexOf(activeIndex.value);
  activeIndex.value = enabledIndexes[(current + direction + enabledIndexes.length) % enabledIndexes.length];
}

function onKeydown(event) {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    if (!opened.value) open();
    else moveActive(event.key === 'ArrowDown' ? 1 : -1);
  } else if (['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    if (!opened.value) open();
    else if (props.options[activeIndex.value]) void selectOption(props.options[activeIndex.value]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    opened.value = false;
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    if (!opened.value) open();
    activeIndex.value = event.key === 'Home' ? 0 : props.options.length - 1;
  }
}

function onFocusout(event) {
  // 焦点仍在组件内时保持展开，离开整个组件后再关闭选项列表。
  if (!root.value?.contains(event.relatedTarget)) opened.value = false;
}
</script>

<template>
  <div ref="root" class="form-select" @focusout="onFocusout">
    <label :for="id">{{ label }}</label>
    <button
      :id="id"
      ref="trigger"
      type="button"
      class="form-select-trigger"
      :class="{ 'is-open': opened }"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="opened"
      :aria-controls="`${id}-options`"
      :aria-activedescendant="opened && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span>{{ selectedOption?.label || '请选择' }}</span>
      <span class="form-select-icon"><UiIcon name="chevron-down" /></span>
    </button>
    <div v-if="opened" :id="`${id}-options`" class="form-select-menu" role="listbox" :aria-label="label">
      <button
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="option.value"
        type="button"
        class="form-select-option"
        :class="{ selected: option.value === modelValue, active: index === activeIndex }"
        :disabled="option.disabled"
        role="option"
        :aria-selected="option.value === modelValue"
        @mouseenter="activeIndex = index"
        @click="selectOption(option)"
      >
        <span>{{ option.label }}</span
        ><UiIcon v-if="option.value === modelValue" name="check" />
      </button>
    </div>
  </div>
</template>
