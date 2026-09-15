# image2 studio

![image2 studio banner](assets/home-banner.png)

一个无构建依赖的纯前端 image2 工作台，兼容 OpenAI Images API 格式。

## 运行

Windows 用户可以双击 `start-image2.bat` 一键启动。脚本会自动打开浏览器，并在端口已被当前应用占用时复用已有服务；关闭启动窗口即可停止服务。

也可以直接打开 `index.html`，或在当前目录启动任意静态服务器：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 接口约定

生成请求发送到：`POST {base_url}/images/generations`。请求体包含 `model`、`prompt`、`n`、`size`、`quality`、`response_format`。响应支持 `data[].url` 和 `data[].b64_json`。

“生成数量”会以并发方式发送多个单图请求（每个请求使用 `n: 1`），兼容只支持单张输出的 image2 服务。数量为 2 就会同时发出 2 次请求，因此会产生 2 次 API 调用和对应费用。

模型列表与连接测试使用：`GET {base_url}/models`。

浏览器直连要求服务端允许 CORS。生成成功后默认会自动下载图片，也可以取消“生成后自动下载”。生成图片和元数据会静默保存在当前浏览器的 IndexedDB 中，刷新页面后仍可查看；清空历史记录后不可恢复。API key 默认只保存在当前页面内；勾选“在本机记住 API key”后会写入浏览器 localStorage，请勿在公共设备使用。
