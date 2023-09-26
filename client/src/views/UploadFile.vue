<template>
  <div>
    <input type="file" name="" id="" @change="handleFileChange" />
    <el-button @click="handleUpload">Upload</el-button>
    <el-button v-if="!isPaused" @click="handlePause">Pause</el-button>
    <el-button v-else @click="handleResume">Resume</el-button>
    <el-progress :percentage="uploadPercentage" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import request, { type TPEvent } from '../utils/request';
import { verifyUpload } from '@/utils/helper';
let worker = null;

interface TItemData {
  chunk: Blob;
  hash: string;
  fileHash: string;
  index: number;
  size: number;
  percentage: number;
}

type TData = TItemData[];

type IContainer = {
  file: File | null;
  data: TData;
};

// 定义切片大小
const CHUNK_SIZE = 10 * 1024;

const container = reactive<IContainer>({
  file: null,
  data: [],
});

const hashPercentage = ref(0);
const hash = ref('');
const requestXhrList = reactive<XMLHttpRequest[]>([]);

const isPaused = ref(false);

const uploadPercentage = computed(() => {
  if (!container.file || !container.data.length) return 0;
  const loaded = container.data
    .map((item) => item.size * item.percentage)
    .reduce((acc, cur) => acc + cur);
  return parseInt((loaded / container.file.size).toFixed(2));
});

function handleFileChange(e: any) {
  const [file] = e.target.files;
  if (!file) return;
  container.file = file;
}

async function handleUpload() {
  if (!container.file) return;

  const fileChunks = createFileChunks(container.file);
  hash.value = await calculateHash<string>(fileChunks);

  // 发送给服务端检验hash是否已存在
  const { shouldUpload, uploadedList } = await verifyUpload(container.file.name, hash.value);

  if (!shouldUpload) {
    ElMessage({
      message: 'skip upload：file upload success',
      type: 'success',
    });
    return;
  }

  container.data = fileChunks.map(({ file }, index) => {
    return {
      chunk: file,
      index,
      size: file.size,
      hash: hash.value + '-' + index,
      fileHash: hash.value,
      percentage: uploadedList?.includes(hash.value + '-' + index) ? 100 : 0,
    };
  });

  await uploadChunks(container.data, uploadedList);
}

// 生成切片
function createFileChunks(file: File | null, size = CHUNK_SIZE) {
  const fileChunkList: { file: Blob }[] = [];
  if (!file) return fileChunkList;
  let cur = 0;

  while (cur < file.size) {
    fileChunkList.push({ file: file.slice(cur, cur + size) });
    cur += size;
  }

  return fileChunkList;
}

// 上传切片
async function uploadChunks(data: TData, uploadedList: string[] = []) {
  const requestList = data
    .filter(({ hash }) => !uploadedList.includes(hash))
    .map(({ chunk, hash, fileHash, index }) => {
      const formData = new FormData();

      formData.append('chunk', chunk);
      formData.append('hash', hash);
      formData.append('fileHash', fileHash);
      formData.append('filename', container.file?.name || '');

      return { formData, index };
    })
    .map(({ formData, index }) =>
      request({
        url: 'http://localhost:3000/request',
        data: formData,
        onprogress: createProgressHandler(data[index]),
        requestList: requestXhrList,
      }),
    );

  // 并发请求
  const v = await Promise.all(requestList);

  // 合并切片
  if (container.data.length === requestList.length + uploadedList.length) {
    await mergeRequest();
  }
}

async function mergeRequest() {
  await request({
    url: 'http://localhost:3000/merge',
    headers: {
      'content-type': 'application/json',
    },
    data: JSON.stringify({
      filename: container.file?.name,
      size: CHUNK_SIZE,
      fileHash: hash.value,
    }),
  });
}

function createProgressHandler(item: TItemData) {
  return (e: TPEvent) => {
    item.percentage = parseInt(String((e.loaded / e.total) * 100));

    return e;
  };
}

function calculateHash<T>(fileChunkList: any): Promise<T> {
  return new Promise((resolve) => {
    // 添加 worker 属性
    worker = new Worker('/hash.js');
    worker.postMessage({ fileChunkList });
    worker.onmessage = (e) => {
      const { percentage, hash } = e.data;
      hashPercentage.value = percentage;
      if (hash) {
        resolve(hash);
      }
    };
  });
}

function handlePause() {
  isPaused.value = true;
  requestXhrList.forEach((xhr) => {
    xhr?.abort();
  });
  requestXhrList.length = 0;
}

async function handleResume() {
  const { shouldUpload, uploadedList } = await verifyUpload(container.file?.name || '', hash.value);

  if (shouldUpload) {
    isPaused.value = false;
    await uploadChunks(container.data, uploadedList);
  }
}
</script>

<!-- 对文件进行切片 -->
<!-- 讲切片上传给服务器 -->
