<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { routes } from './router/index.js';
import { loadPolicies } from './services/policies.js';
import ArrowUpRightIcon from './components/ArrowUpRightIcon.vue';
import UiIcon from './components/UiIcon.vue';

const route = useRoute();
const navigation = routes.filter((entry) => entry.meta?.title);
const cities = ref([]);
const loading = ref(false);
const error = ref('');
const policyCount = computed(() => cities.value.filter((city) => city.policy).length);
let loadVersion = 0;

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
onMounted(reload);
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <RouterLink class="brand" :to="{ name: 'calculator' }" aria-label="薪算首页"><span class="brand-icon">薪</span><span>薪算<small>PAYROLL STUDIO</small></span></RouterLink>
      <div class="sidebar-label">我的工作台</div>
      <nav aria-label="主导航">
        <RouterLink v-for="item in navigation" :key="item.name" :to="{ name: item.name }" active-class="active">
          <span class="nav-icon"><UiIcon :name="item.meta.icon" /></span><span class="nav-label">{{ item.meta.title }}</span><ArrowUpRightIcon class="nav-arrow" />
        </RouterLink>
      </nav>
      <div class="sidebar-bottom"><span class="status-dot"></span> 计算在浏览器内完成<p>输入只用于本次计算<br />不保存个人工资数据</p></div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <span class="breadcrumb">
          <strong class="breadcrumb-current">{{ route.meta.title }}</strong>
        </span>
        <span class="database-badge"><span class="status-dot"></span>{{ policyCount }} 个城市已就绪</span>
      </header>
      <div v-if="error" class="notice error" role="alert">{{ error }} <button class="text-button" @click="reload">重新加载</button></div>
      <div v-if="loading" class="notice" role="status">正在读取城市政策…</div>
      <RouterView v-slot="{ Component }">
        <!-- 缓存计算页以保留输入、结果和复制标记；同步页离开后停止进度轮询。 -->
        <KeepAlive include="CalculatorPage">
          <component :is="Component" :cities="cities" :loading="loading" v-on="route.name === 'sync' ? { updated: reload } : {}" />
        </KeepAlive>
      </RouterView>
      <footer class="site-footer">薪算 · 让每一笔收入清楚可见 <span>本地计算 · 按所选口径生成结果</span></footer>
    </main>
  </div>
</template>
