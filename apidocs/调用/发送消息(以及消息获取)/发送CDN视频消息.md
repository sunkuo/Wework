# 发送CDN视频消息

## 简要描述
- 发送CDN视频消息

## 请求URL
- `http://47.94.7.218:8083/wxwork/SendCDNVideoMsg`

## 请求方式
- POST
- ContentType: `application/json`

## 参数
| 参数名 | 必选 | 类型 | 说明 |
| --- | --- | --- | --- |
| uuid | 是 | String | 每个实例的唯一标识，根据uuid操作具体企业微信 |
| send_userid | 是 | long | 要发送的人或群id |
| isRoom | 是 | bool | 是否是群消息 |

## 请求示例
```json
{
  "uuid": "505f61baa654b5b684a8c1917ad8bb00",
  "send_userid": 7881302555913738,
  "cdnkey": "306b02010204643062020100020x04109c6131377dae038824b43f8e388efa1c0201040201000400",
  "aeskey": "BE02BA568E3B545F04009F5E81972C0E",
  "md5": "9c6131377dae038824b43f8e388efa1c",
  "video_duration": 38,
  "fileSize": 3561782,
  "video_img_size": 65472,
  "video_width": 540,
  "video_height": 1170,
  "isRoom": false
}
```

## 返回示例
```json
{
  "data": {
    "video_duration": 38,
    "video_height": 1170,
    "openim_cdn_ld_aeskey": "",
    "receiver": 78813025559xxx,
    "openim_cdn_ld_size": 65472,
    "file_name": "",
    "video_width": 540,
    "sender_name": "",
    "cdn_Key": "",
    "is_room": 0,
    "server_id": 7651694,
    "file_size": 3561782,
    "size": 3561782,
    "VideoDuration": 38,
    "sender": 1688854256622049,
    "file_id": "306b020102046430620201000204060b19ex131377dae038824b43f8e388efa1c0201040201000400",
    "openim_cdn_authkey": "",
    "aes_key": "BE02BA568E3B545F04009F5E81972C0E",
    "app_info": "CIOACBDIjp7Q6jIY4bOssJCAgAMgEA==",
    "sendtime": 1746609341,
    "msg_id": 1014578,
    "msgtype": 23,
    "md5": "9c6131377dae038824b43f8e388efa1c",
    "preview_img_url": ""
  },
  "errcode": 0,
  "errmsg": "ok"
}
```
