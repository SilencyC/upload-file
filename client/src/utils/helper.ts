import request from './request';

export async function verifyUpload(
  filename: string,
  fileHash: string,
): Promise<{
  shouldUpload: boolean;
  uploadedList?: string[];
}> {
  const data = await request<string>({
    url: 'http://localhost:3000/verify',
    headers: {
      'content-type': 'application/json',
    },
    data: JSON.stringify({
      filename,
      fileHash,
    }),
  });

  console.log(data);

  return JSON.parse(data);
}
