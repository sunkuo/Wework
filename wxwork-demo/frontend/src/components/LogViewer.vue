<template>
  <el-card>
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>事件日志 (最近 100 条)</span>
        <el-button size="small" @click="refresh">刷新</el-button>
      </div>
    </template>
    <div style="height: 400px; overflow-y: auto; background: #f9f9f9; padding: 10px;">
      <div v-if="appStore.events.length === 0">暂无事件日志</div>
      <div v-for="(event, index) in appStore.events" :key="index" style="margin-bottom: 10px; font-family: monospace; font-size: 12px; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">
        <div style="color: #409EFF; font-weight: bold;">{{ event.time }} [{{ event.stage }}]</div>
        <pre style="white-space: pre-wrap; word-break: break-all; color: #606266; margin: 5px 0;">{{ JSON.stringify(event, null, 2) }}</pre>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { onMounted, onUnmounted } from 'vue';

const appStore = useAppStore();
const refresh = () => appStore.fetchEvents();
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
