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
const STATUS = {
  WAIT: 'wait',
  ERROR: 'error',
  UPLOADING: 'uploading',
  DONE: 'done',
};

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

      return { formData, index, status: STATUS.WAIT };
    });
  //   .map(({ formData, index }) =>
  //     request({
  //       url: 'http://localhost:3000/request',
  //       data: formData,
  //       onprogress: createProgressHandler(data[index]),
  //       requestList: requestXhrList,
  //     }),
  //   );

  // // 并发请求
  // const v = await Promise.all(requestList);

  // 控制并发
  const reslut = await sendRequest(requestList, container.data);

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

// ⭐️网络请求并发控制
// 思路：把异步请求放在队列里，比如并发数为4，就先同时发起3个请求，然后有请求结束了，再发起下一个请求即可
// 并发重试 + 报错
function sendRequest(
  forms: {
    formData: FormData;
    index: number;
    status: string;
  }[],
  data: TItemData[],
  max = 4, // 最大并发请求数，默认为4
) {
  return new Promise((resolve, reject) => {
    const len = forms.length; // 获取forms数组的长度
    // 初始化一个索引变量，用于跟踪当前处理的FormData
    let idx = 0;
    // 初始化一个计数器，用于跟踪已完成的请求数量
    let counter = 0;
    const retryArr: number[] = [];

    const start = async () => {
      // 有请求，有通道
      // 当索引小于FormData数组的长度且最大并发数大于0时，继续执行
      while (idx < len && max > 0) {
        // 减少可用的并发数，表示占用一个通道
        max--; // 占用通道
        console.log(idx, 'start');
        // const form = forms[idx].formData;
        // const index = forms[idx].index;

        // idx++; // 增加索引以处理下一个表单

        // 任务不能仅仅累加获取，而是要根据状态
        // wait 和 error的可以发出请求 方便重试
        // 根据状态找到下一个要处理的表单的索引
        const i = forms.findIndex((v) => v.status == STATUS.WAIT || v.status == STATUS.ERROR);

        // 更新表单状态为UPLOADING，表示正在上传
        forms[i].status = STATUS.UPLOADING;

        const form = forms[i].formData;
        const index = forms[i].index;

        if (typeof retryArr[index] === 'number') {
          console.log(index, '开始重试');
        }

        request({
          url: 'http://localhost:3000/request',
          data: form,
          onprogress: createProgressHandler(data[index]),
          requestList: requestXhrList,
        })
          .then((res) => {
            forms[i].status = STATUS.DONE;
            // 增加可用的并发数，表示释放一个通道
            max++; // 释放通道
            counter++;

            if (counter === len) {
              // 如果已完成的请求数量等于数组的长度，解析Promise
              resolve(res);
            } else {
              // 否则继续处理下一个表单
              start();
            }
          })
          .catch(() => {
            forms[i].status = STATUS.ERROR;
            if (typeof retryArr[index] !== 'number') {
              retryArr[index] = 0;
            }

            //次数累加
            retryArr[index]++;
            if (retryArr[index] >= 2) {
              // 一个请求报错三次
              return reject();
            }
            console.log(index, retryArr[index], '报错次数');
            // 3次报错以内的 重启
            data[index].percentage = 0; // 报错的进度条重置
            max++; // 释放当前占用的通道，但是counter不累加
            idx++; // 增加索引以处理下一个表单

            start();
          });
      }
    };
    // 调用start函数，开始处理请求
    start();
  });
}
</script>

<!-- 对文件进行切片 -->
<!-- 讲切片上传给服务器 -->
