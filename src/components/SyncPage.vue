<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, isLocalHost } from '../services/sync-api.js';
import PolicyDetails from './PolicyDetails.vue';
import CityCombobox from './CityCombobox.vue';
import ArrowUpRightIcon from './ArrowUpRightIcon.vue';
import UiIcon from './UiIcon.vue';

const props = defineProps({ cities: { type: Array, required: true }, loading: Boolean });
const emit = defineEmits(['updated']);
const selectedCities = ref([]);
const connected = ref(false);
const connecting = ref(false);
const submitting = ref(false);
const preparingGlobal = ref(false);
const error = ref('');
const job = ref(null);
const globalConfirm = ref(null);
const localConfirm = ref(false);
const localCandidates = ref([]);
const localSelection = ref([]);
const localQuery = ref('');
const libraryQuery = ref('');
const showProblems = ref(false);
let timer;
let disposed = false;
const running = computed(() => job.value?.status === 'running');
const progress = computed(() => job.value?.total ? Math.round(job.value.completed / job.value.total * 100) : 0);
const problemEntries = computed(() => (job.value?.entries || []).filter((entry) => ['failed', 'skipped'].includes(entry.status)));
const visibleEntries = computed(() => showProblems.value && problemEntries.value.length ? problemEntries.value : (job.value?.entries || []));
const failedCount = computed(() => (job.value?.entries || []).filter((entry) => entry.status === 'failed').length);
const skippedCount = computed(() => (job.value?.entries || []).filter((entry) => entry.status === 'skipped').length);
// 已保存城市查询只负责筛选展示，不改变数据库内容或当前同步任务。
const filteredCities = computed(() => {
  const keyword = libraryQuery.value.trim().toLocaleLowerCase();
  if (!keyword) return props.cities;
  return props.cities.filter((city) => `${city.name} ${city.policy?.name || ''}`.toLocaleLowerCase().includes(keyword));
});
const filteredLocalCandidates = computed(() => {
  const keyword = localQuery.value.trim().toLocaleLowerCase();
  if (!keyword) return localCandidates.value;
  return localCandidates.value.filter((city) => `${city.name} ${city.policy?.name || ''}`.toLocaleLowerCase().includes(keyword));
});
const allVisibleLocalSelected = computed(() => filteredLocalCandidates.value.length > 0
  && filteredLocalCandidates.value.every((city) => localSelection.value.includes(city.name)));
const labels = { pending: '等待', running: '同步中', success: '已更新', failed: '失败', skipped: '已跳过' };

async function poll() {
  clearTimeout(timer);
  try {
    const data = await api('sync');
    if (disposed) return;
    const wasRunning = running.value;
    job.value = data.job;
    if (wasRunning && !running.value) showProblems.value = problemEntries.value.length > 0;
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

async function submitJob(path, body, clearSelection = false) {
  submitting.value = true;
  error.value = '';
  try {
    const data = await api(path, body);
    if (disposed) return;
    job.value = data.job;
    showProblems.value = false;
    if (clearSelection) selectedCities.value = [];
    emit('updated');
    await poll();
  } catch (cause) {
    if (!disposed) error.value = cause.message;
  } finally { submitting.value = false; }
}

function startSelected() {
  if (!selectedCities.value.length) return;
  return submitJob('sync/cities', { cities: selectedCities.value }, true);
}

function startOne(city) {
  return submitJob('sync/city', { city }, false);
}

function prepareLocalSync() {
  localCandidates.value = [...props.cities];
  localSelection.value = props.cities.map((city) => city.name);
  localQuery.value = '';
  localConfirm.value = true;
}

function toggleLocalCity(name) {
  localSelection.value = localSelection.value.includes(name)
    ? localSelection.value.filter((city) => city !== name)
    : [...localSelection.value, name];
}

function toggleVisibleLocalCities() {
  const visibleNames = filteredLocalCandidates.value.map((city) => city.name);
  if (allVisibleLocalSelected.value) {
    localSelection.value = localSelection.value.filter((name) => !visibleNames.includes(name));
  } else {
    localSelection.value = [...new Set([...localSelection.value, ...visibleNames])];
  }
}

function cancelLocalSync() {
  localConfirm.value = false;
}

async function confirmLocalSync() {
  const cities = [...localSelection.value];
  localConfirm.value = false;
  if (cities.length) await submitJob('sync/all', { cities });
}

function durationText(count) {
  const minutes = Math.ceil(count / 60);
  return minutes < 1 ? '不到 1 分钟' : `约 ${minutes} 分钟`;
}

async function prepareGlobalSync() {
  preparingGlobal.value = true;
  error.value = '';
  try {
    const data = await api('source/cities');
    if (!data.cities?.length) throw new Error('数据源没有返回可同步的城市');
    globalConfirm.value = { cities: data.cities, count: data.cities.length };
  } catch (cause) {
    if (!disposed) error.value = cause.message;
  } finally { preparingGlobal.value = false; }
}

function cancelGlobalSync() {
  globalConfirm.value = null;
}

async function confirmGlobalSync() {
  const cities = globalConfirm.value?.cities || [];
  globalConfirm.value = null;
  if (cities.length) await submitJob('sync/source-all', { cities });
}

onMounted(() => { if (isLocalHost) void connect(); });
onUnmounted(() => { disposed = true; clearTimeout(timer); });
</script>

<template>
  <div class="page-title">
    <div><span class="eyebrow">CITY DATA</span>
      <h1>城市数据，一处管理。</h1>
      <p>按需同步已保存城市，也可以从数据源刷新全量城市政策。</p>
    </div>
    <UiIcon name="sync" class="title-mark title-mark-icon" />
  </div>
  <div v-if="!isLocalHost" class="notice offline-notice"><b>当前为在线计算模式</b>
    <p>同步需要在电脑本地执行。在项目目录运行 <code>npm run dev</code>，打开本地地址后同步，再将更新后的数据库随站点一起发布。</p>
  </div>
  <div v-if="error" class="notice error" role="alert">{{ error }}</div>
  <div class="sync-layout">
    <section class="card sync-controls">
      <div class="card-heading">
        <h2>城市同步</h2><span :class="['pill', connected ? 'success-pill' : '']">{{ connected ? '本地服务已连接' : '本地服务未连接'
          }}</span>
      </div>
      <div class="sync-controls-body">
        <form class="sync-action-module" @submit.prevent="startSelected">
          <div class="module-label"><span class="step">01</span>
            <h3>选定城市</h3>
          </div>
          <CityCombobox id="sync-city" v-model="selectedCities" :cities="cities" label="选择一个或多个城市" allow-create multiple
            :disabled="!connected || running || submitting || loading" />
          <p class="helper">支持模糊搜索和多选；新城市查询成功后才会写入本地数据库。</p>
          <button type="submit" class="button primary-button"
            :disabled="!connected || running || submitting || loading || !selectedCities.length">同步选中城市 <span>{{
              selectedCities.length || '' }}</span></button>
        </form>
        <div class="sync-action-module">
          <div class="module-label"><span class="step">02</span>
            <h3>本地全量</h3>
          </div>
          <p class="helper">只同步数据库中已经保存的城市，每次请求结束后间隔 1 秒。</p>
          <button class="button secondary-button"
            :disabled="!connected || running || submitting || loading || !cities.length"
            @click="prepareLocalSync">选择并同步本地城市</button>
        </div>
        <div class="sync-action-module source-sync-module">
          <div class="module-label"><span class="step source-step">03</span>
            <h3>数据源全城市</h3><span class="pill source-pill">需要确认</span>
          </div>
          <p class="helper">先读取数据源城市列表，再逐个同步。请求数量较多，预计耗时较长，开始前会显示确认信息。</p>
          <button class="button source-button"
            :disabled="!connected || running || submitting || preparingGlobal || loading" @click="prepareGlobalSync">{{
              preparingGlobal ? '正在读取数据源城市…' : '读取并同步全部城市' }}
            <ArrowUpRightIcon class="icon-arrow-up-right" />
          </button>
        </div>
        <button v-if="isLocalHost && !connected" class="button secondary-button reconnect" :disabled="connecting"
          @click="connect">{{ connecting ? '正在连接…' : '重新连接本地服务' }}</button>
      </div>
    </section>
    <section class="card progress-card" aria-live="polite">
      <div class="card-heading">
        <h2>同步进度</h2><span class="pill">{{ job ? `${job.completed} / ${job.total}` : '等待开始' }}</span>
      </div>
      <div v-if="job" class="progress-body">
        <div
          :class="['progress-heading', running ? 'is-running' : problemEntries.length ? 'has-problems' : 'is-success']">
          <strong>{{ progress }}<small>%</small></strong><span>{{ running ? `${job.label || '同步任务'} · 正在处理
            ${job.currentCity || '任务'}` : problemEntries.length ? `${job.label || '同步任务'}已结束 · 有
            ${problemEntries.length} 项需要处理` : `${job.label || '同步任务'}已成功完成` }}</span></div><progress
          :value="job.completed" :max="job.total" :aria-label="`同步进度 ${progress}%`"></progress>
        <div class="sync-result-summary" :class="problemEntries.length ? 'has-problems' : 'is-success'"><span><b>{{
          running ? '同步进行中' : problemEntries.length ? '同步完成，但存在问题' : '同步完成' }}</b><small>成功 {{ job.succeeded }} · 失败
              {{ failedCount }} · 跳过 {{ skippedCount }}</small></span><button v-if="problemEntries.length" type="button"
            class="text-button" @click="showProblems = !showProblems">{{ showProblems ? `查看全部记录（${job.entries.length}）`
              : `仅查看失败/跳过（${problemEntries.length}）` }}</button></div>
        <p v-if="job.error" class="notice error">{{ job.error }}</p>
        <ul class="sync-log">
          <li v-for="entry in visibleEntries" :key="entry.city">
            <div><b>{{ entry.city }}</b><span :class="['log-status', entry.status]">{{ labels[entry.status] }}</span>
            </div>
            <p>{{ entry.message }}</p>
          </li>
        </ul>
      </div>
      <div v-else class="progress-empty"><span class="progress-empty-icon">
          <UiIcon name="sync" />
        </span>
        <h3>政策更新，从一个城市开始</h3>
        <p>发起同步后，这里会显示每个城市的进度与结果。</p>
      </div>
    </section>
  </div>
  <section class="card city-library">
    <div class="card-heading">
      <div>
        <h2>已保存城市</h2>
        <p>查询城市并查看社保、公积金缴费标准和最近更新时间。</p>
      </div>
      <div class="library-heading-tools"><label class="library-search">
          <UiIcon name="search" /><input v-model="libraryQuery" type="search" placeholder="查询城市或政策名称"
            aria-label="查询已保存城市社保公积金数据" />
        </label><span class="pill">{{ libraryQuery.trim() ? `${filteredCities.length} / ${cities.length}` :
          `${cities.length}` }} 个城市</span></div>
    </div>
    <div v-if="!cities.length" class="library-empty">还没有城市。首次同步成功后，城市会显示在这里。</div>
    <div v-else-if="!filteredCities.length" class="library-empty">没有找到“{{ libraryQuery.trim() }}”对应的城市。</div>
    <div v-for="city in filteredCities" :key="city.name" class="city-entry">
      <div class="city-entry-heading">
        <div>
          <h3>{{ city.name }}</h3>
          <p>{{ city.syncedAt ? `上次同步：${new Date(city.syncedAt).toLocaleString('zh-CN')}` : '尚未成功同步' }}</p>
        </div><button class="button small-button secondary-button" :disabled="!connected || running || submitting"
          @click="startOne(city.name)">重新同步</button>
      </div>
      <p v-if="city.lastError" class="notice warning">上次同步未成功，请重新同步。{{ city.policy ? '当前仍保留上次成功的数据。' : '' }}</p>
      <PolicyDetails v-if="city.policy" :policy="city.policy" />
    </div>
  </section>
  <div class="publish-note"><span class="step publish-icon">
      <ArrowUpRightIcon class="icon-arrow-up-right" />
    </span>
    <div>
      <h3>同步完成后如何发布？</h3>
      <p>将 <code>public/data/policies.sqlite</code> 提交并推送到仓库，随站点一起发布即可。在线页面将读取更新后的城市数据。</p>
    </div>
  </div>

  <div v-if="globalConfirm" class="dialog-backdrop" role="presentation" @click.self="cancelGlobalSync">
    <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="global-sync-title">
      <span class="dialog-kicker">DATA SOURCE SYNC</span>
      <h2 id="global-sync-title">确认同步数据源全部城市？</h2>
      <p>已读取到 <strong>{{ globalConfirm.count }}</strong> 个城市，将逐个请求政策数据。每次请求间隔 1 秒，预计 {{
        durationText(globalConfirm.count) }}。</p>
      <p class="dialog-note">同步期间请保持本地服务运行。失败的城市会记录在进度列表中，不会阻止后续城市继续处理。</p>
      <div class="dialog-actions"><button class="button secondary-button" :disabled="submitting"
          @click="cancelGlobalSync">取消</button><button class="button source-button" :disabled="submitting"
          @click="confirmGlobalSync">确认开始同步</button></div>
    </section>
  </div>

  <div v-if="localConfirm" class="dialog-backdrop" role="presentation" @click.self="cancelLocalSync">
    <section class="confirm-dialog local-sync-dialog" role="dialog" aria-modal="true"
      aria-labelledby="local-sync-title">
      <span class="dialog-kicker">LOCAL CITY SYNC</span>
      <h2 id="local-sync-title">选择要同步的本地城市</h2>
      <div class="local-picker-toolbar"><label class="library-search">
          <UiIcon name="search" /><input v-model="localQuery" type="search" placeholder="查询城市或政策名称"
            aria-label="查询本地城市" />
        </label><button type="button" class="text-button picker-toggle" @click="toggleVisibleLocalCities">{{
          allVisibleLocalSelected ? '取消当前筛选' : '全选当前筛选' }}</button></div>
      <p class="local-selection-count">已选择 <strong>{{ localSelection.length }}</strong> / {{ localCandidates.length }}
        个城市</p>
      <div class="local-city-picker" role="group" aria-label="本地同步城市列表">
        <label v-for="city in filteredLocalCandidates" :key="city.name" class="local-city-row">
          <input type="checkbox" :checked="localSelection.includes(city.name)" @change="toggleLocalCity(city.name)" />
          <span><b>{{ city.name }}</b><small>{{ city.policy ? `政策：${city.policy.name}` : '尚未同步政策' }}</small></span>
        </label>
        <p v-if="!filteredLocalCandidates.length" class="local-picker-empty">没有找到匹配的城市。</p>
      </div>
      <p class="dialog-note">只会同步当前勾选的已保存城市，不会新增数据源城市。</p>
      <div class="dialog-actions"><button class="button secondary-button" :disabled="submitting"
          @click="cancelLocalSync">取消</button><button class="button primary-button"
          :disabled="submitting || !localSelection.length" @click="confirmLocalSync">确认同步 {{ localSelection.length }}
          个城市</button></div>
    </section>
  </div>
</template>
