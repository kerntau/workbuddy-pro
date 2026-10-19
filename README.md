# Workbuddy Pro

腾讯 CodeBuddy 账号池管理控制台与 OpenAI 兼容网关。

[English](README.en.md) · [下载](https://github.com/kerntau/workbuddy-pro/releases/latest) · [更新日志](CHANGELOG.md) · [反馈](https://github.com/kerntau/workbuddy-pro/issues)

> **告示**：本项目仅供个人学习与自用，与腾讯、CodeBuddy 等相关方无隶属或官方合作关系。如有侵权、冒犯或其他不妥之处，请通过 [Issues](https://github.com/kerntau/workbuddy-pro/issues) 联系反馈，我会及时核实并处理。

## 功能

- 扫码添加账号，定时签到、保活与账号分组。
- OpenAI 兼容接口，多密钥、额度、IP 与模型白名单。
- 用量统计、调用日志、可视化配置与备份。

## 快速开始

### Windows

从 [最新 Release](https://github.com/kerntau/workbuddy-pro/releases/latest) 下载 **WorkbuddyProSetup.exe**，双击安装后启动项目。内置运行环境，无需另装 Python 或 Docker。

### Ubuntu / Debian

在服务器终端执行，自动安装 Python 3.11+、Docker、Compose，下载并校验部署包，启动服务并设置开机自启：

```bash
sudo bash -c 'set -e; apt-get update; apt-get install -y curl ca-certificates; f=$(mktemp); trap '\''rm -f -- "$f"'\'' EXIT; curl -fsSL --retry 3 https://raw.githubusercontent.com/kerntau/workbuddy-pro/main/deploy/bootstrap.sh -o "$f"; bash "$f"'
```

云平台安全组放行 TCP **7864** 后，打开 `http://服务器公网IP:7864`。用户名 `admin`，初始密码：

```bash
sudo cat /opt/workbuddy-pro/data/initial-admin-password.txt
```

已有旧目录 `/opt/workbuddy-manager` 时会沿用，实际路径以脚本输出为准。重跑保留配置与账号。手动安装请下载 `workbuddy-pro-vX.Y.Z.tar.gz`（含前端和上游），校验同名 `.sha256` 后解压，运行 `sudo bash deploy/install.sh`。

## 文档

- [使用指南](docs/usage.md) · [功能说明](docs/features.md) · [界面截图](docs/screenshots.md)
- [部署与 HTTPS](deploy/README.md) · [开发说明](docs/development.md)
- [API 令牌](docs/api-tokens.md) · [账号代理](docs/account-proxy-routes.md)
- [安全说明](docs/security-notes.md) · [安全审计](docs/SECURITY-AUDIT.md) · [发布包校验](docs/release-signing.md)

## 许可与致谢

基于 [ithtelab/workbuddy-manager](https://github.com/ithtelab/workbuddy-manager) 定制；底层网关为 workbuddy2api，源码随发布包分发。感谢原项目及所有贡献者，保留原作者版权与第三方许可。

本项目使用 [MIT 许可证](LICENSE)。请勿公开 `.env`、`data/` 或账号授权文件。
