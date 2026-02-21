<template>
  <el-card>
    <template #header>
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span>状态</span>
        <el-button @click="refresh">刷新</el-button>
      </div>
    </template>
    <el-descriptions column="1" border size="small">
      <el-descriptions-item label="UUID">{{ appStore.active.uuid }}</el-descriptions-item>
      <el-descriptions-item label="VID">{{ appStore.active.vid }}</el-descriptions-item>
      <el-descriptions-item label="登录状态">{{ appStore.active.isLogin ? '已登录' : '未登录' }}</el-descriptions-item>
      <el-descriptions-item label="最后事件">{{ appStore.active.lastEvent }}</el-descriptions-item>
      <el-descriptions-item label="最后错误">{{ appStore.active.lastError }}</el-descriptions-item>
      <el-descriptions-item label="监控">
        {{ appStore.monitor.enabled ? '已开启' : '已关闭' }} 
        运行中: {{ appStore.monitor.running ? '是' : '否' }}
      </el-descriptions-item>
    </el-descriptions>
    <div style="margin-top: 15px; display: flex; gap: 10px;">
      <el-button @click="startMonitor" type="success" :disabled="appStore.monitor.enabled">启动监控</el-button>
      <el-button @click="stopMonitor" type="danger" :disabled="!appStore.monitor.enabled">停止监控</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { startMonitor as apiStart, stopMonitor as apiStop } from '../api/wxwork';
import { onMounted, onUnmounted } from 'vue';

const appStore = useAppStore();

const refresh = () => appStore.fetchState();
let pollTimer: ReturnType<typeof setInterval> | null = null;

const startMonitor = async () => {
  try {
    await apiStart();
    refresh();
  } catch (e) {
    console.error(e);
  }
};

const stopMonitor = async () => {
  try {
    await apiStop();
    refresh();
  } catch (e) {
    console.error(e);
  }
};

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
