import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fetchCityPolicy } from './source.js';

export function createSyncService(repository) {
  let job = null;
  let nextRequestAt = 0;

  async function run(currentJob) {
    let blocked = false;
    for (const entry of currentJob.entries) {
      if (blocked) {
        entry.status = 'skipped';
        entry.message = '同步请求过于频繁，已停止后续请求，请稍后重试';
        currentJob.completed++;
        continue;
      }
      await delay(Math.max(0, nextRequestAt - Date.now()));
      entry.status = 'running';
      currentJob.currentCity = entry.city;
      try {
        const { policy, raw } = await fetchCityPolicy(entry.city);
        repository.savePolicy(entry.city, policy, raw);
        entry.status = 'success';
        entry.message = `已更新：${policy.name}`;
        currentJob.succeeded++;
      } catch (error) {
        entry.status = 'failed';
        entry.message = error.name === 'TimeoutError' ? '城市查询超时，请稍后重试' : error.message;
        repository.saveError(entry.city, entry.message);
        currentJob.failed++;
        blocked = Boolean(error.rateLimited);
      } finally {
        // 从请求结束起等待一秒，跨同步任务也共享冷却时间。
        nextRequestAt = Date.now() + 1000;
        currentJob.completed++;
      }
    }
    currentJob.currentCity = null;
    currentJob.status = currentJob.failed ? 'completed_with_errors' : 'completed';
    currentJob.finishedAt = new Date().toISOString();
  }

  return {
    current: () => job,
    startCities(cities, options = {}) {
      if (job?.status === 'running') {
        const error = new Error('已有同步任务正在运行，请等待完成');
        error.status = 409;
        throw error;
      }
      const names = [...new Set(cities
        .map((city) => String(city || '').trim())
        .filter(Boolean))];
      if (!names.length) throw new Error('没有可同步的城市');
      job = {
        id: randomUUID(), status: 'running', kind: options.kind || 'selected',
        label: options.label || '城市同步', total: names.length, completed: 0,
        succeeded: 0, failed: 0, currentCity: null, startedAt: new Date().toISOString(),
        entries: names.map((name) => ({ city: name, status: 'pending', message: '等待同步' })),
      };
      const currentJob = job;
      void run(currentJob).catch((error) => {
        currentJob.status = 'failed';
        currentJob.error = error.message;
      });
      return currentJob;
    },
    start(city) {
      if (city) return this.startCities([city], { kind: 'city', label: '单个城市' });
      const cities = repository.listCities().map((entry) => entry.name);
      if (!cities.length) throw new Error('请先添加一个城市');
      return this.startCities(cities, { kind: 'local-all', label: '本地已保存城市' });
    },
  };
}
