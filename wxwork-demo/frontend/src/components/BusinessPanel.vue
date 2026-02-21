<template>
  <el-card>
    <template #header>
      <span>业务操作</span>
    </template>
    
    <el-tabs>
      <el-tab-pane label="发送文本">
        <el-form :model="msgForm" label-width="100px" size="small">
          <el-form-item label="UUID">
             <el-input v-model="appStore.active.uuid" disabled />
          </el-form-item>
          <el-form-item label="目标用户 ID">
            <el-input v-model="msgForm.send_userid" placeholder="接收者 ID" />
          </el-form-item>
          <el-form-item label="内容">
            <el-input v-model="msgForm.content" type="textarea" />
          </el-form-item>
          <el-form-item label="是否群聊">
            <el-switch v-model="msgForm.isRoom" />
          </el-form-item>
          <el-button type="primary" @click="handleSend" :disabled="!appStore.active.uuid">发送消息</el-button>
        </el-form>
        <div v-if="sendResult" style="margin-top: 10px; font-size: 12px; color: #666;">
          最后结果: {{ sendResult }}
        </div>
      </el-tab-pane>
      
      <el-tab-pane label="联系人">
         <div style="margin-bottom: 10px;">
           <el-button @click="handleGetContacts" :disabled="!appStore.active.uuid">获取联系人 (内部与外部)</el-button>
         </div>
         <el-input 
           type="textarea" 
           v-model="contactsResult" 
           :rows="10" 
           placeholder="结果将在此显示..." 
           readonly 
         />
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useAppStore } from '../stores/app';
import { sendTextMsg, getContacts } from '../api/wxwork';
import { ElMessage } from 'element-plus';

const appStore = useAppStore();

const msgForm = reactive({
  send_userid: '',
  content: 'hello from vue',
  isRoom: false,
  kf_id: 0
});

const sendResult = ref('');
const contactsResult = ref('');

const handleSend = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('缺少 UUID');
  try {
    const res: any = await sendTextMsg({
      uuid: appStore.active.uuid,
      ...msgForm
    });
    sendResult.value = JSON.stringify(res, null, 2);
    if (res.ok) {
      ElMessage.success('发送成功');
    } else {
      ElMessage.error(res.message);
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleGetContacts = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('缺少 UUID');
  try {
    const res: any = await getContacts({
      uuid: appStore.active.uuid,
      innerLimit: 100,
      externalLimit: 100
    });
    contactsResult.value = JSON.stringify(res, null, 2);
    if (res.ok) {
      ElMessage.success('已获取联系人');
    } else {
      ElMessage.error(res.message);
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};
</script>
