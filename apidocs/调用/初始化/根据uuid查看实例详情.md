# 根据uuid查看实例详情

## 简要描述
- 根据uuid查看实例详情

## 请求URL
- `http://127.0.0.1:8083/wxwork/GetRunClientByUuid`

## 请求方式
- POST
- ContentType: `application/json`

## 参数
| 参数名 | 必选 | 类型 | 说明 |
| --- | --- | --- | --- |
| uuid | 是 | String | 要查询的账号状态 |

## 请求示例
```json
{
  "uuid": "xxxxxx"
}
```

## 返回示例
```json
{
  "data": {
    "logintime": 1744427201,
    "loginType": 2,
    "user_info": {
      "object": {
        "unionid": "ozynqsgN5h3Vuulx4E07Oy17j-7s",
        "create_time": 0,
        "sex": 1,
        "mobile": "xxxx",
        "acctid": "xxxx",
        "scorp_id": "xxxxx",
        "avatar": "https://wework.qpic.cn/wwpic3az/319926_srytF-ZZSX2lOL7_1743776394/0",
        "corp_name": "xxx",
        "english_name": "xx",
        "realname": "xxx",
        "user_id": xxxx,
        "nickname": "xxx",
        "position": "",
        "corp_id": xxxx,
        "corp_full_name": "xxxxxx",
        "corp_desc": ""
      },
      "userid": xxxxxx,
      "clientId": "e1d672c613717ca41fcbd6823da9015a",
      "updateTime": 1745125943,
      "uuid": "e1d672c613717ca41fcbd6823da9015a",
      "requrl": "http://47.94.7.218:8083",
      "isLogin": true
    },
    "uuid": "e1d672c613717ca41fcbd6823da9015a"
  },
  "errcode": 0,
  "errmsg": "获取成功"
}
```
