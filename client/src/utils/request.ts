type fnIncludeReturn<T> = (e: T) => T;
type fn<T> = (e: T) => void;


export type TPEvent = ProgressEvent<EventTarget>

interface IRequestParams {
  url: string;
  data: any;
  method?: 'post' | 'get';
  headers?: Record<string, any>;
  requestList?: any[];
  onprogress?: fnIncludeReturn<TPEvent>;
}

function request({
  url,
  method = 'post',
  data,
  headers = {},
  onprogress = (e) => e,
  requestList,
}: IRequestParams) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = onprogress;
    xhr.open(method, url);
    Object.keys(headers).forEach((key) => {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.send(data);
    xhr.onload = (ev) => {
      resolve((ev.target as XMLHttpRequest)?.response || '');
      // console.log(ev);
    };
  });
}

export default request;
