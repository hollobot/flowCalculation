<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import CalculatorPage from './components/CalculatorPage.vue';
import SyncPage from './components/SyncPage.vue';
import { loadPolicies } from './services/policies.js';

const page = ref(window.location.hash === '#sync' ? 'sync' : 'calculator');
const cities = ref([]);
const loading = ref(false);
const error = ref('');
const policyCount = computed(() => cities.value.filter((city) => city.policy).length);
let loadVersion = 0;

function onHashChange() { page.value = window.location.hash === '#sync' ? 'sync' : 'calculator'; }
async function reload() {
  const version = ++loadVersion;
  loading.value = true;
  error.value = '';
  try {
    const result = await loadPolicies();
    // 同步前后的刷新可能交错，只采用最后发起的一次读取结果。
    if (version === loadVersion) cities.value = result;
  } catch (cause) {
    if (version === loadVersion) error.value = cause.message;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}
onMounted(() => {
  window.addEventListener('hashchange', onHashChange);
  void reload();
});
onUnmounted(() => window.removeEventListener('hashchange', onHashChange));
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <a class="brand" href="#calculator" aria-label="薪算首页"><span class="brand-icon">薪</span><span>薪算<small>PAYROLL STUDIO</small></span></a>
      <div class="sidebar-label">我的工作台</div>
      <nav aria-label="主导航">
        <a href="#calculator" :class="{ active: page === 'calculator' }" :aria-current="page === 'calculator' ? 'page' : undefined"><span aria-hidden="true">▦</span> 工资计算<span class="nav-arrow">↗</span></a>
        <a href="#sync" :class="{ active: page === 'sync' }" :aria-current="page === 'sync' ? 'page' : undefined"><span aria-hidden="true">⇄</span> 数据同步<span class="nav-arrow">↗</span></a>
      </nav>
      <div class="sidebar-bottom"><span class="status-dot"></span> 计算在浏览器内完成<p>输入只用于本次计算<br />不保存个人工资数据</p></div>
    </aside>
    <main class="main-content">
      <header class="topbar"><span>工作台 <span class="muted">/</span> {{ page === 'calculator' ? '工资计算' : '数据同步' }}</span><span class="database-badge"><span class="status-dot"></span>{{ policyCount }} 个城市政策已就绪</span></header>
      <div v-if="error" class="notice error" role="alert">{{ error }} <button class="text-button" @click="reload">重新加载</button></div>
      <div v-if="loading" class="notice" role="status">正在读取城市政策…</div>
      <CalculatorPage v-show="page === 'calculator'" :cities="cities" :loading="loading" />
      <SyncPage v-if="page === 'sync'" :cities="cities" @updated="reload" />
      <footer class="site-footer">薪算 · 让每一笔收入清楚可见 <span>城市政策来自工资哥 · 结果按所选测算口径生成</span></footer>
    </main>
  </div>
</template>
