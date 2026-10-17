import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // 相对资源路径同时兼容 username.github.io 和仓库子路径，导航使用 hash。
  base: process.env.GITHUB_ACTIONS ? "/flowCalculation/" : "/",
});
