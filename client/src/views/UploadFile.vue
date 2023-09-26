<template>
  <div>
    <input type="file" name="" id="" @change="handleFileChange" />
    <el-button @click="handleUpload">upload</el-button>
    <el-progress :percentage="uploadPercentage" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import request, { type TPEvent } from '../utils/request';

interface TItemData {
  chunk: Blob;
  hash: string;
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

const uploadPercentage = computed(() => {
  if (!container.file || !container.data.length) return 0;
  const loaded = container.data
    .map((item) => item.size * item.percentage)
    .reduce((acc, cur) => acc + cur);
  return parseInt((loaded / container.file.size).toFixed(2));
});

function handleFileChange(e: any) {
  console.log(e);
  const [file] = e.target.files;
  if (!file) return;
  container.file = file;
}

async function handleUpload() {
  console.log('handle upload');
  if (!container.file) return;

  const fileChunks = createFileChunks(container.file);
  console.log('fileChunks ==> ', fileChunks);
  container.data = fileChunks.map(({ file }, index) => {
    return {
      chunk: file,
      index,
      size: file.size,
      hash: container.file?.name + '-' + index,
      percentage: 0,
    };
  });

  await uploadChunks(container.data);
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
async function uploadChunks(data: TData) {
  console.log(data);
  const requestList = data
    .map(({ chunk, hash, index }) => {
      const formData = new FormData();

      formData.append('chunk', chunk);
      formData.append('hash', hash);
      formData.append('filename', container.file?.name || '');

      return { formData, index };
    })
    .map(({ formData, index }) =>
      request({
        url: 'http://localhost:3000/request',
        data: formData,
        onprogress: createProgressHandler(data[index]),
      }),
    );

  // 并发请求
  const v = await Promise.all(requestList);
  console.log(v);
  console.log('requestList ==> ', requestList);

  // 合并切片
  await mergeRequest();
}

async function mergeRequest() {
  await request({
    url: 'http://localhost:3000/merge',
    headers: {
      'content-type': 'application/json',
    },
    data: JSON.stringify({ filename: container.file?.name, size: CHUNK_SIZE }),
  });
}

function createProgressHandler(item: TItemData) {
  return (e: TPEvent) => {
    item.percentage = parseInt(String((e.loaded / e.total) * 100));
    console.log('percentage:', item.percentage);

    return e;
  };
}
</script>

<!-- 对文件进行切片 -->
<!-- 讲切片上传给服务器 -->
