// 提取后缀名

import path = require('path');
import fse = require('fs-extra');

// 大文件存储目录
export const UPLOAD_DIR = path.resolve(__dirname, 'target');

// get file extension
export const extractExt = (filename: string) =>
  filename.slice(filename.lastIndexOf('.'), filename.length);

export function getChunkDir(fileHash: string) {
  return path.resolve(UPLOAD_DIR, 'chunkDir_' + fileHash);
}

// 返回已上传的所有切片名
export async function createUploadedList(fileHash) {
  console.log(fse.existsSync(path.resolve(UPLOAD_DIR, fileHash)));

  return fse.existsSync(getChunkDir(fileHash))
    ? await fse.readdir(getChunkDir(fileHash))
    : [];
}
