type fnIncludeReturn<T> = (e: T) => T;
// type fn<T> = (e: T) => void;

export type TPEvent = ProgressEvent<EventTarget>;

interface IRequestParams {
  url: string;
  data: any;
  method?: 'post' | 'get';
  headers?: Record<string, any>;
  requestList?: any[];
  onprogress?: fnIncludeReturn<TPEvent>;
}

function request<T>({
  url,
  method = 'post',
  data,
  headers = {},
  onprogress = (e) => e,
  requestList,
}: IRequestParams): Promise<T> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = onprogress;
    xhr.open(method, url);
    Object.keys(headers).forEach((key) => {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.send(data);
    xhr.onload = (ev) => {
      // 将请求成功的xhr从列表中删除
      if (requestList) {
        const xhrIndex = requestList.findIndex((item) => item === xhr);
        requestList.splice(xhrIndex, 1);
      }

      resolve((ev.target as XMLHttpRequest)?.response || '');
      console.log(ev);
    };
    // 暴露当前xhr给外部
    requestList?.push(xhr);
    console.log(requestList);
    
  });
}

export default request;
