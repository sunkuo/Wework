# 发送CDN文件消息

## 简要描述
- 发送CDN文件消息

## 请求URL
- `http://47.94.7.218:8083/wxwork/SendCDNFileMsg`

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
  "uuid": "1753cdff-0501-42fe-bb5a-2a4b9629f7fb",
  "send_userid": 7881302555913738,
  "cdnkey": "30680201020461305f0201xxxx0501d03e3d1c0480fd7d1193205a080160201050201000400",
  "aeskey": "38633161326636666630396135353630",
  "md5": "501d03e3d1c0480fd7d1193205a08016",
  "file_name": "111.txt",
  "fileSize": 2813,
  "isRoom": false
}
```

## 返回示例
```json
{
  "data": {
    "receiver": 7881302555913738,
    "cdn_key": "30680201020461305f0201000204ea44290002030f55cb0204a48e1e6f0204626d8bb0042430453235394136372d443435322d343032302d393341372d38344445364532363030303902010002020b000410501d03e3d1c0480fd7d1193205a080160201050201000400",
    "file_name": "协议.txt",
    "sender_name": "",
    "is_room": 0,
    "server_id": 12381206,
    "size": 2813,
    "app_info": "from_msgid_697590829808721944",
    "sender": 1688853790599424,
    "aes_key": "38633161326636666630396135353630",
    "sendtime": 1652169489,
    "msg_id": 1066237,
    "msgtype": 15,
    "md5": "501d03e3d1c0480fd7d1193205a08016"
  },
  "errcode": 0,
  "errmsg": "ok"
}
```
