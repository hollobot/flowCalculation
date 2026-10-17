<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, isLocalHost } from '../services/sync-api.js';
import PolicyDetails from './PolicyDetails.vue';

defineProps({ cities: { type: Array, required: true } });
const emit = defineEmits(['updated']);
const cityName = ref('');
const connected = ref(false);
const connecting = ref(false);
const submitting = ref(false);
const error = ref('');
const job = ref(null);
let timer;
let disposed = false;
const running = computed(() => job.value?.status === 'running');
const progress = computed(() => job.value?.total ? Math.round(job.value.completed / job.value.total * 100) : 0);
const labels = { pending: '等待', running: '同步中', success: '已更新', failed: '失败', skipped: '已跳过' };

async function poll() {
  clearTimeout(timer);
  try {
    const data = await api('sync');
    if (disposed) return;
    const wasRunning = running.value;
    job.value = data.job;
    if (running.value) timer = setTimeout(poll, 1000);
    else if (wasRunning) emit('updated');
  } catch (cause) {
    if (disposed) return;
    connected.value = false;
    error.value = `${cause.message}；服务端任务可能仍在运行，重新连接可恢复查看进度。`;
  }
}

async function connect() {
  connecting.value = true;
  error.value = '';
  try {
    const health = await api('health');
    if (health.service !== 'flow-calculation') throw new Error('未检测到本项目的同步服务');
    if (disposed) return;
    connected.value = true;
    await poll();
    emit('updated');
  } catch (cause) { if (!disposed) error.value = cause.message; }
  finally { connecting.value = false; }
}

async function start(city) {
  submitting.value = true;
  error.value = '';
  try {
    const data = await api(city ? 'sync/city' : 'sync/all', city ? { city } : {});
    if (disposed) return;
    job.value = data.job;
    if (city) cityName.value = '';
    emit('updated');
    await poll();
  } catch (cause) {
    if (!disposed) error.value = cause.message;
  } finally { submitting.value = false; }
}
onMounted(() => { if (isLocalHost) void connect(); });
onUnmounted(() => { disposed = true; clearTimeout(timer); });
</script>

<template>
  <div class="page-title"><div><span class="eyebrow">POLICY DATA</span><h1>城市政策，一处更新。</h1><p>在本地同步，再将更新后的数据库发布到 GitHub Pages。</p></div><span class="title-mark" aria-hidden="true">⇄</span></div>
  <div v-if="!isLocalHost" class="notice offline-notice"><b>当前为在线计算模式</b><p>同步需要在电脑本地执行。在项目目录运行 <code>npm run dev</code>，打开本地地址后添加城市、同步政策，再将 <code>public/data/policies.sqlite</code> 推送到 GitHub。</p></div>
  <div v-if="error" class="notice error" role="alert">{{ error }}</div>
  <div class="sync-layout">
    <section class="card sync-controls"><div class="card-heading"><h2>同步城市政策</h2><span :class="['pill', connected ? 'success-pill' : '']">{{ connected ? '本地服务已连接' : '本地服务未连接' }}</span></div>
      <div class="sync-controls-body"><form @submit.prevent="start(cityName.trim())"><label>添加并同步城市<input v-model="cityName" placeholder="例如：杭州市、上海城区" maxlength="80" required :disabled="!connected || running || submitting" /></label><p class="helper">使用工资哥数据源中的城市名称，每次查询一个城市。</p><button type="submit" class="button primary-button" :disabled="!connected || running || submitting || !cityName.trim()">添加并同步 <span>＋</span></button></form>
        <div class="sync-divider"></div><h3>更新已有城市</h3><p class="helper">逐个同步数据库中的所有城市，每次请求结束后间隔 1 秒。</p><button class="button secondary-button" :disabled="!connected || running || submitting || !cities.length" @click="start()">{{ running ? '正在同步，请稍候…' : `一键同步全部 ${cities.length} 个城市` }}</button>
        <button v-if="isLocalHost && !connected" class="button secondary-button reconnect" :disabled="connecting" @click="connect">{{ connecting ? '正在连接…' : '重新连接本地服务' }}</button>
      </div>
    </section>
    <section class="card progress-card" aria-live="polite"><div class="card-heading"><h2>同步进度</h2><span class="pill">{{ job ? `${job.completed} / ${job.total}` : '等待开始' }}</span></div>
      <div v-if="job" class="progress-body"><div class="progress-heading"><strong>{{ progress }}<small>%</small></strong><span>{{ running ? `正在处理 ${job.currentCity || '任务'}` : job.status === 'failed' ? '任务异常结束' : '本次同步已结束' }}</span></div><progress :value="job.completed" :max="job.total" :aria-label="`同步进度 ${progress}%`"></progress><p class="helper">成功 {{ job.succeeded }} · 失败 {{ job.failed }} · 跳过 {{ job.entries.filter((entry) => entry.status === 'skipped').length }}</p><p v-if="job.error" class="notice error">{{ job.error }}</p><ul class="sync-log"><li v-for="entry in job.entries" :key="entry.city"><div><b>{{ entry.city }}</b><span :class="['log-status', entry.status]">{{ labels[entry.status] }}</span></div><p>{{ entry.message }}</p></li></ul></div>
      <div v-else class="progress-empty"><span aria-hidden="true">↻</span><h3>政策更新，从一个城市开始</h3><p>发起同步后，这里会显示每个城市的进度与结果。</p></div>
    </section>
  </div>
  <section class="card city-library"><div class="card-heading"><div><h2>城市政策库</h2><p>只保存城市政策，不保存工资与个人信息。</p></div><span class="pill">{{ cities.length }} 个城市</span></div>
    <div v-if="!cities.length" class="library-empty">还没有城市。在本地添加第一个城市，开始建立政策库。</div>
    <div v-for="city in cities" :key="city.name" class="city-entry"><div class="city-entry-heading"><div><h3>{{ city.name }}</h3><p>{{ city.syncedAt ? `上次同步：${new Date(city.syncedAt).toLocaleString('zh-CN')}` : '尚未成功同步' }}</p></div><button class="button small-button secondary-button" :disabled="!connected || running || submitting" @click="start(city.name)">重新同步</button></div><p v-if="city.lastError" class="notice warning">上次同步失败：{{ city.lastError }}{{ city.policy ? '；当前仍保留上次成功的数据。' : '' }}</p><PolicyDetails v-if="city.policy" :policy="city.policy" /></div>
  </section>
  <div class="publish-note"><span class="step">↗</span><div><h3>同步完成后如何发布？</h3><p>将 <code>public/data/policies.sqlite</code> 提交并推送到仓库。GitHub Actions 会重新发布页面与数据库，线上无需运行 Node 服务。</p></div></div>
</template>
