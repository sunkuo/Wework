<template>
  <el-card>
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>Login Panel</span>
        <el-tag :type="appStore.active.isLogin ? 'success' : 'info'">
          {{ appStore.active.isLogin ? 'Logged In' : 'Not Logged In' }}
        </el-tag>
      </div>
    </template>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="Initial Login (No VID)" name="first">
        <el-form :model="form" label-width="100px" size="small">
          <el-form-item label="VID">
            <el-input v-model="form.vid" placeholder="Force Empty for Init" disabled />
            <span style="font-size: 12px; color: #999;">(Automatically cleared for initial flow)</span>
          </el-form-item>
          
          <el-divider content-position="left">Step 1: Init</el-divider>
          <el-button type="primary" @click="handleInit">Initialize Client</el-button>
          
          <el-divider content-position="left">Step 2: Callback</el-divider>
          <el-input v-model="form.callbackUrl" placeholder="Callback URL (Auto from env)" />
          <el-button @click="handleSetCallback" :disabled="!appStore.active.uuid">Set Callback URL</el-button>
          
          <el-divider content-position="left">Step 3: QR Code</el-divider>
          <el-button @click="handleGetQr" :disabled="!appStore.active.uuid">Get QR Code</el-button>
          
          <div v-if="appStore.active.qrcode" style="margin-top: 10px; border: 1px solid #ddd; padding: 10px; text-align: center;">
            <img v-if="isUrl(appStore.active.qrcode)" :src="appStore.active.qrcode" style="max-width: 200px;" />
            <div v-else style="word-break: break-all;">{{ appStore.active.qrcode }}</div>
            <div>Key: {{ appStore.active.qrcodeKey }}</div>
          </div>
          
          <el-divider content-position="left">Step 4: Verify</el-divider>
          <div style="display: flex; gap: 10px;">
            <el-input v-model="code" placeholder="6-digit code from phone" maxlength="6" />
            <el-button type="success" @click="handleCheckCode" :disabled="!appStore.active.qrcodeKey">Submit Code</el-button>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="Auto Login (With VID)" name="auto">
        <el-form :model="form" label-width="100px">
          <el-form-item label="VID">
            <el-input v-model="form.vid" placeholder="Required for auto login" />
          </el-form-item>
          <el-button type="primary" @click="handleAutoInit">1. Init (With VID)</el-button>
          <el-button @click="handleSetCallback">2. Set Callback</el-button>
          <el-button type="success" @click="handleAutoLogin">3. Auto Login</el-button>
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
      ElMessage.success('Init success');
      appStore.fetchState();
    } else {
      ElMessage.error(res.message || 'Init failed');
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleAutoInit = async () => {
  if (!form.value.vid) return ElMessage.warning('VID is required');
  try {
    const res: any = await initClient(form.value);
    if (res.ok) {
      ElMessage.success('Init (Auto) success');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleSetCallback = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('UUID missing');
  try {
    const res: any = await setCallbackUrl({ 
      uuid: appStore.active.uuid, 
      url: form.value.callbackUrl 
    });
    if (res.ok) {
      ElMessage.success('Callback set');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleGetQr = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('UUID missing');
  try {
    const res: any = await getQrCode({ uuid: appStore.active.uuid });
    if (res.ok) {
      ElMessage.success('QR Code retrieved');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleCheckCode = async () => {
  if (!appStore.active.uuid || !appStore.active.qrcodeKey || !code.value) {
    return ElMessage.warning('Missing params');
  }
  try {
    const res: any = await checkCode({
      uuid: appStore.active.uuid,
      qrcodeKey: appStore.active.qrcodeKey,
      code: code.value
    });
    if (res.ok) {
      ElMessage.success('Code submitted');
      appStore.fetchState();
    } else {
      ElMessage.error(res.message);
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleAutoLogin = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('UUID missing');
  try {
    const res: any = await automaticLogin({ uuid: appStore.active.uuid });
    if (res.ok) {
      ElMessage.success('Auto login triggered');
      appStore.fetchState();
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};
</script>
