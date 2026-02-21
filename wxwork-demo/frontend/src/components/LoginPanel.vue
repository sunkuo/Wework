<template>
  <el-card>
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>登录面板</span>
        <el-tag :type="appStore.active.isLogin ? 'success' : 'info'">
          {{ appStore.active.isLogin ? '已登录' : '未登录' }}
        </el-tag>
      </div>
    </template>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="初始登录 (无 VID)" name="first">
        <el-form :model="form" label-width="100px" size="small">
          <el-form-item label="VID">
            <el-input v-model="form.vid" placeholder="初始化时强制为空" disabled />
            <span style="font-size: 12px; color: #999;">(初始流程中会自动清除)</span>
          </el-form-item>
          
          <el-divider content-position="left">步骤 1: 初始化</el-divider>
          <el-button type="primary" @click="handleInit">初始化客户端</el-button>
          
          <el-divider content-position="left">步骤 2: 回调设置</el-divider>
          <el-input v-model="form.callbackUrl" placeholder="回调地址 (自动从环境获取)" />
          <el-button @click="handleSetCallback" :disabled="!appStore.active.uuid">设置回调地址</el-button>
          
          <el-divider content-position="left">步骤 3: 获取二维码</el-divider>
          <el-button @click="handleGetQr" :disabled="!appStore.active.uuid">获取二维码</el-button>
          
          <div v-if="appStore.active.qrcode" style="margin-top: 10px; border: 1px solid #ddd; padding: 10px; text-align: center;">
            <img v-if="isUrl(appStore.active.qrcode)" :src="appStore.active.qrcode" style="max-width: 200px;" />
            <div v-else style="word-break: break-all;">{{ appStore.active.qrcode }}</div>
            <div>Key: {{ appStore.active.qrcodeKey }}</div>
          </div>
          
          <el-divider content-position="left">步骤 4: 验证</el-divider>
          <div style="display: flex; gap: 10px;">
            <el-input v-model="code" placeholder="手机上收到的 6 位验证码" maxlength="6" />
            <el-button type="success" @click="handleCheckCode" :disabled="!appStore.active.qrcodeKey">提交验证码</el-button>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="自动登录 (含 VID)" name="auto">
        <el-form :model="form" label-width="100px">
          <el-form-item label="VID">
            <el-input v-model="form.vid" placeholder="自动登录必需" />
          </el-form-item>
          <el-button type="primary" @click="handleAutoInit">1. 初始化 (含 VID)</el-button>
          <el-button @click="handleSetCallback">2. 设置回调</el-button>
          <el-button type="success" @click="handleAutoLogin">3. 自动登录</el-button>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../stores/app';
import { 
  initClient, 
  setCallbackUrl, 
  getQrCode, 
  checkCode, 
  automaticLogin 
} from '../api/wxwork';
import { ElMessage } from 'element-plus';

const appStore = useAppStore();
const activeTab = ref('first');
const code = ref('');

const form = ref({
  vid: '',
  callbackUrl: '',
  ip: '',
  port: '',
  proxyType: '',
  userName: '',
  passward: '',
  proxySituation: 0,
  deverType: 'ipad'
});

const isUrl = (s: string) => /^https?:\/\//i.test(s);

const handleInit = async () => {
  try {
    const payload = { ...form.value, vid: '' }; // Force empty vid
    const res: any = await initClient(payload);
    if (res.ok) {
      ElMessage.success('初始化成功');
      appStore.fetchState();
    } else {
      ElMessage.error(res.message || '初始化失败');
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleAutoInit = async () => {
  if (!form.value.vid) return ElMessage.warning('请输入 VID');
  try {
    const res: any = await initClient(form.value);
    if (res.ok) {
      ElMessage.success('自动初始化成功');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleSetCallback = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('缺少 UUID');
  try {
    const res: any = await setCallbackUrl({ 
      uuid: appStore.active.uuid, 
      url: form.value.callbackUrl 
    });
    if (res.ok) {
      ElMessage.success('回调设置成功');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleGetQr = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('缺少 UUID');
  try {
    const res: any = await getQrCode({ uuid: appStore.active.uuid });
    if (res.ok) {
      ElMessage.success('获取二维码成功');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleCheckCode = async () => {
  if (!appStore.active.uuid || !appStore.active.qrcodeKey || !code.value) {
    return ElMessage.warning('参数缺失');
  }
  try {
    const res: any = await checkCode({
      uuid: appStore.active.uuid,
      qrcodeKey: appStore.active.qrcodeKey,
      code: code.value
    });
    if (res.ok) {
      ElMessage.success('验证码已提交');
      appStore.fetchState();
    } else {
      ElMessage.error(res.message);
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleAutoLogin = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('缺少 UUID');
  try {
    const res: any = await automaticLogin({ uuid: appStore.active.uuid });
    if (res.ok) {
      ElMessage.success('已触发自动登录');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};
</script>
