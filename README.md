# my-website
# 我的网页目录

一个使用 HTML 构建的静态网站，通过 GitHub Pages 发布。
首页用于汇总和访问仓库中的其他网页。

## 在线访问

https://YOUR_USERNAME.github.io/my-website/

## 文件结构

```text
my-website/
├── index.html       # 网站首页和网页目录
├── ****.html      # 报告页面，替换为你的实际文件
├── ****.html       # 介绍页面，替换为你的实际文件
├── images/          # 网页使用的图片，可选
├── README.md        # 项目说明
└── .gitignore       # Git 忽略规则
```

## 本地查看

使用浏览器打开 index.html。

如果页面需要通过 HTTP 加载资源，可以使用本地网页服务器预览。

## GitHub Pages 设置

进入仓库的 Settings → Pages，选择：

- Source：Deploy from a branch
- Branch：main
- Folder：/(root)

保存并等待部署完成，通过 Visit site 获取公开网址。

## 更新网站

1. 在 VS Code 打开克隆到本地的仓库文件夹。
2. 修改网页文件并保存。
3. 在源代码管理中暂存修改。
4. 填写提交说明并 Commit。
5. 点击 Sync Changes 或 Push，将修改推送到 main 分支。
6. 等待 GitHub Pages 部署完成，再刷新网站。

只保存文件或 Commit，不会更新公开网站；必须完成推送。

## 添加网页

1. 将新的 HTML 文件放入仓库，例如 example.html。
2. 在 index.html 中添加指向 ./example.html 的链接。
3. 提交并推送新增文件和首页修改。

子文件夹中的页面也可以访问，例如：
./reports/report1.html

## 资源路径

图片、样式、脚本和页面链接使用相对路径，例如：

- ./images/photo.jpg
- ./style.css
- ./script.js
- ./report.html

文件名大小写必须与实际文件一致。
不要使用 C:\、D:\ 或 file:/// 等本机路径。

## 适用范围

本项目用于静态网页展示。
GitHub Pages 不运行 Python、PHP 等后台服务。