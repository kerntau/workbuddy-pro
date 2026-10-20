# Workbuddy Pro

Tencent CodeBuddy account pool console and OpenAI-compatible gateway.

[简体中文](README.md) · [Downloads](https://github.com/kerntau/workbuddy-pro/releases/latest) · [Changelog](CHANGELOG.md) · [Feedback](https://github.com/kerntau/workbuddy-pro/issues)

> **Notice**: This project is maintained for personal learning and use. It is not affiliated with or officially endorsed by Tencent, CodeBuddy or related parties. If anything infringes your rights, causes offense or otherwise needs attention, please contact me through [Issues](https://github.com/kerntau/workbuddy-pro/issues). I will review and address it promptly.

## Features

- QR account onboarding, scheduled check-ins, keepalive and account groups.
- OpenAI-compatible APIs, multiple keys, quotas, IP and model allowlists.
- Usage statistics, request logs, visual configuration and backups.

## Quick start

### Windows

Download **WorkbuddyProSetup.exe** from the [latest Release](https://github.com/kerntau/workbuddy-pro/releases/latest), install and start the project. The runtime is bundled; Python and Docker do not need to be installed separately.

### Ubuntu / Debian

Run in the server terminal. This installs Python 3.11+, Docker and Compose, downloads and verifies the deployment package, starts services and enables startup at boot:

```bash
sudo bash -c 'set -e; apt-get update; apt-get install -y curl ca-certificates; f=$(mktemp); trap '\''rm -f -- "$f"'\'' EXIT; curl -fsSL --retry 3 https://raw.githubusercontent.com/kerntau/workbuddy-pro/main/deploy/bootstrap.sh -o "$f"; bash "$f"'
```

If UFW is active, the script automatically allows the manager's TCP port (**7864** by default, including custom ports). Set `WB_CONFIGURE_FIREWALL=0` to skip this when using an HTTPS reverse proxy without direct access to the manager.

Your cloud security group must still allow TCP **7864**, then open `http://your-public-IP:7864`. The username is `admin`. Read the initial password with:

```bash
sudo cat /opt/workbuddy-pro/data/initial-admin-password.txt
```

Existing `/opt/workbuddy-manager` installations are reused; check the printed path. Reruns preserve configuration and accounts. For manual installation, download `workbuddy-pro-vX.Y.Z.tar.gz` (includes the frontend and upstream), verify its `.sha256`, extract it and run `sudo bash deploy/install.sh`.

## Documentation

- [Usage](docs/usage.md) · [Features](docs/features.md) · [Screenshots](docs/screenshots.md)
- [Deployment and HTTPS](deploy/README.md) · [Development](docs/development.md)
- [API tokens](docs/api-tokens.md) · [Account proxy routes](docs/account-proxy-routes.md)
- [Security notes](docs/security-notes.md) · [Security audit](docs/SECURITY-AUDIT.md) · [Release verification](docs/release-signing.md)

## License and credits

Customized from [ithtelab/workbuddy-manager](https://github.com/ithtelab/workbuddy-manager). The gateway is workbuddy2api, whose source is included in release packages. Thanks to the original projects and all contributors; original copyright notices and third-party licenses are retained.

Licensed under [MIT](LICENSE). Do not publish `.env`, `data/` or account authorization files.
