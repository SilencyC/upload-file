// 导入脚本
self.importScripts('/spark-md5.min.js');

// 生成文件hash
self.onmessage = (e) => {
  const { fileChunkList } = e.data;
  const spark = new self.SparkMD5.ArrayBuffer();

  let percentage = 0;
  let count = 0;

  const loadNext = (index) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(fileChunkList[index].file);
    reader.onload = (onloadEvent) => {
      count++;
      spark.append(onloadEvent.target.result);
      if (count === fileChunkList.length) {
        self.postMessage({
          percentage: 100,
          hash: spark.end(),
        });
      } else {
        percentage += 100 / fileChunkList;
        self.postMessage({
          percentage,
        });
        loadNext(count);
      }
    };
  };

  loadNext(0);
};
