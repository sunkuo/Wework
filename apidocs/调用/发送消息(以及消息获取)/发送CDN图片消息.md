# 发送CDN图片消息

## 简要描述
- 发送CDN图片消息

## 请求URL
- `http://47.94.7.218:8083/wxwork/SendCDNImgMsg`

## 请求方式
- POST
- ContentType: `application/json`

## 参数
| 参数名 | 必选 | 类型 | 说明 |
| --- | --- | --- | --- |
| uuid | 是 | String | 每个实例的唯一标识，根据uuid操作具体企业微信 |
| send_userid | 是 | long | 要发送的人或群id |
| isRoom | 是 | bool | 是否是群消息 |
| cdnkey | 是 | String | cdnkey |
| aeskey | 是 | String | aeskey |
| md5 | 是 | String | md5 |
| fileSize | 是 | int | 文件大小 |

## 请求示例
```json
{
  "uuid": "47b24a10e92f66b2fc440608a19c86c8",
  "send_userid": "7881302555913738",
  "kf_id": 0,
  "isRoom": false,
  "cdnkey": "306b020102046430620201000204060b19e102034c4cd20204986b259902046807456b042466303163353336302d636437642d346335302d626238632d38356638333361613238376402031038000203317d8004107d8a8e79499210c6242c36afd10647c70201010201000400",
  "aeskey": "B26DB4824341608DB848A2DA563B7147",
  "md5": "7d8a8e79499210c6242c36afd10647c7",
  "fileSize": 3243381,
  "width": 1279,
  "height": 1706,
  "thumb_image_height": 512,
  "thumb_image_width": 384,
  "thumb_file_size": 15195,
  "thumb_file_md5": "4331947dc5f67c0d8a2893653a3f0cee",
  "is_hd": 1
}
```

## 返回示例
```json
{
  "data": {
    "receiver": 7881302555913738,
    "cdn_key": "308189020102048181307f0201000204ea44290002030f55cb0204a48e1e6f0204626c17c604444e45574944315f6561343432393030613438653165366636323663313833385f31313841414234302d453237422d346539312d383843442d33343735453032423531313202010002023c600410d9c8750bed0b3c7d089fa7d55720d6cf0201010201000400",
    "file_name": "",
    "sender_name": "",
    "is_room": 0,
    "server_id": 12381205,
    "size": 15444,
    "app_info": "from_msgid_697590829808721944",
    "sender": 1688853790599424,
    "aes_key": "66303662386666346430373037326666",
    "sendtime": 1652169457,
    "msg_id": 1066235,
    "msgtype": 14,
    "md5": "d9c8750bed0b3c7d089fa7d55720d6cf"
  },
  "errcode": 0,
  "errmsg": "ok"
}
```
