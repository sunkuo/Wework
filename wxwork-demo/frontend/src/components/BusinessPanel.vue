<template>
  <el-card>
    <template #header>
      <span>Business Actions</span>
    </template>
    
    <el-tabs>
      <el-tab-pane label="Send Text">
        <el-form :model="msgForm" label-width="100px" size="small">
          <el-form-item label="UUID">
             <el-input v-model="appStore.active.uuid" disabled />
          </el-form-item>
          <el-form-item label="Target UserID">
            <el-input v-model="msgForm.send_userid" placeholder="Receiver ID" />
          </el-form-item>
          <el-form-item label="Content">
            <el-input v-model="msgForm.content" type="textarea" />
          </el-form-item>
          <el-form-item label="Is Room">
            <el-switch v-model="msgForm.isRoom" />
          </el-form-item>
          <el-button type="primary" @click="handleSend" :disabled="!appStore.active.uuid">Send Message</el-button>
        </el-form>
        <div v-if="sendResult" style="margin-top: 10px; font-size: 12px; color: #666;">
          Last Result: {{ sendResult }}
        </div>
      </el-tab-pane>
      
      <el-tab-pane label="Contacts">
         <div style="margin-bottom: 10px;">
           <el-button @click="handleGetContacts" :disabled="!appStore.active.uuid">Get Contacts (Inner & External)</el-button>
         </div>
         <el-input 
           type="textarea" 
           v-model="contactsResult" 
           :rows="10" 
           placeholder="Results will appear here..." 
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
  if (!appStore.active.uuid) return ElMessage.warning('UUID missing');
  try {
    const res: any = await sendTextMsg({
      uuid: appStore.active.uuid,
      ...msgForm
    });
    sendResult.value = JSON.stringify(res, null, 2);
    if (res.ok) {
      ElMessage.success('Sent successfully');
    } else {
      ElMessage.error(res.message);
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};

const handleGetContacts = async () => {
  if (!appStore.active.uuid) return ElMessage.warning('UUID missing');
  try {
    const res: any = await getContacts({
      uuid: appStore.active.uuid,
      innerLimit: 100,
      externalLimit: 100
    });
    contactsResult.value = JSON.stringify(res, null, 2);
    if (res.ok) {
      ElMessage.success('Contacts retrieved');
    } else {
      ElMessage.error(res.message);
    }
  } catch (e: any) {
    ElMessage.error(e.message);
  }
};
</script>
