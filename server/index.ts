import http = require('http');
import path = require('path');
import fse = require('fs-extra');
// 使用 multiparty 处理前端传来的 formData
// 在 multiparty.parse 的回调中，files 参数保存了 formData 中文件，fields 参数保存了 formData 中非文件的字段
import multiparty = require('multiparty');
import {
  UPLOAD_DIR,
  createUploadedList,
  extractExt,
  getChunkDir,
} from './utils';

const server = http.createServer();

function resolvePost<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve) => {
    let chunk = '';
    req.on('data', (data) => {
      chunk += data;
    });
    req.on('end', () => {
      resolve(JSON.parse(chunk));
    });
  });
}

// 写入文件流
const pipeStream = (path, writeStream) => {
  return new Promise((resolve) => {
    const readStream = fse.createReadStream(path);
    readStream.on('end', () => {
      // fse.unlinkSync(path);
      resolve('');
    });

    readStream.pipe(writeStream);
  });
};

// 合并切片
const mergeFileChunk = async (filePath, fileHash, size) => {
  const chunkDir = getChunkDir(fileHash);
  const chunkPaths = await fse.readdir(chunkDir);
  console.log(chunkDir, chunkPaths);

  // 根据切片下标进行排序
  // 否则直接读取目录的获得的顺序会错乱
  chunkPaths.sort((a: any, b: any) => a.split('-')[1] - b.split('-')[1]);
  // 并发写入文件
  await Promise.all(
    chunkPaths.map((chunkPath, index) => {
      pipeStream(
        path.resolve(chunkDir, chunkPath),
        fse.createWriteStream(filePath, { start: index * size })
      );
    })
  );
  // 合并后删除保存切片的目录
  // TODO 有问题，会报错
  // fse.rmdirSync(chunkDir);
};

server.on('request', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.url === '/merge') {
    const data = await resolvePost<{
      fileHash: string;
      filename: string;
      size: number;
    }>(req);
    const { fileHash, filename, size } = data;
    const ext = extractExt(filename);
    const filePath = path.resolve(UPLOAD_DIR, `${fileHash}.${ext}`);
    await mergeFileChunk(filePath, fileHash, size);
    res.end(
      JSON.stringify({
        code: 0,
        message: 'file merged success',
      })
    );

    return;
  }

  if (req.url === '/verify') {
    const { filename, fileHash } = await resolvePost<{
      filename: string;
      fileHash: string;
    }>(req);

    const ext = extractExt(filename);
    const filePath = path.resolve(UPLOAD_DIR, `${fileHash}.${ext}`);

    if (fse.existsSync(filePath)) {
      res.end(
        JSON.stringify({
          shouldUpload: false,
        })
      );
    } else {
      const uploadedList = await createUploadedList(fileHash);

      res.end(
        JSON.stringify({
          shouldUpload: true,
          uploadedList,
        })
      );
    }
    return;
  }

  const multipart = new multiparty.Form();

  multipart.parse(req, async (err, fields, files) => {
    if (err) return;

    const [chunk] = files.chunk;
    const [hash] = fields.hash;
    const [fileHash] = fields.fileHash;
    const [filename] = fields.filename;
    // 创建临时文件夹用于临时存储chunk
    // 添加chunkDir 前缀与文件名作区分
    const chunkDir = getChunkDir(fileHash);

    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir);
    }

    await fse.move(chunk.path, `${chunkDir}/${hash}`);
    res.end('received file chunk');
  });
});

server.listen(3000, () => {
  console.log('listening port 3000');
});
