# 发送gif表情

## 简要描述
- 发送gif表情

## 请求URL
- `http://47.94.7.218:8083/wxwork/SendEmotionMessage`

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
  "uuid": "41cba32733a3643f7bdc4cbdd360d797",
  "send_userid": 7881302555913738,
  "isRoom": false,
  "imgurl": "https://wework.qpic.cn/wwpic3az/wwwx_954b864d1be1d3afbf6fd6581c1903c1/0",
  "width": 240,
  "height": 240,
  "emotionType": 0
}
```

## 返回示例
```json
{
  "data": {
    "receiver": 7881302555913738,
    "sender": 1688853790599424,
    "EmotionType": "EMOTION_STATIC",
    "sender_name": "",
    "is_room": 0,
    "sendtime": 1652169938,
    "msg_id": 1066247,
    "app_info": "from_msgid_697590829808721944",
    "server_id": 12381211,
    "msgtype": 29,
    "url": "https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fimglf3.nosdn0.126.net%2Fimg%2FWEFHU2lQKzFVM1lGbWFTcG84YXdudFl2dnhPN3ZSY0g4UFRzSlpzMjZ1TGs5MEF4YTRYbjN3PT0.gif&refer=http%3A%2F%2Fimglf3.nosdn0.126.net&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1654435655&t=4ef360eed30a307a951785967a097030"
  },
  "errcode": 0,
  "errmsg": "ok"
}
```
