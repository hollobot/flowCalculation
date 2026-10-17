import { createRouter, createWebHashHistory } from 'vue-router';
import CalculatorPage from '../components/CalculatorPage.vue';
import SyncPage from '../components/SyncPage.vue';

// 显式路由表管理两个页面；hash 路由可在静态托管环境直接刷新和分享。
export const routes = [
  { path: '/', redirect: { name: 'calculator' } },
  { path: '/calculator', name: 'calculator', component: CalculatorPage, meta: { title: '工资计算', icon: 'calculator' } },
  { path: '/sync', name: 'sync', component: SyncPage, meta: { title: '数据同步', icon: 'sync' } },
  { path: '/:pathMatch(.*)*', redirect: { name: 'calculator' } },
];

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => { document.title = `${to.meta.title || '工资计算'} · 薪算`; });
