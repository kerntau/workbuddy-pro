#!/usr/bin/env bash
# Workbuddy Pro: provision Ubuntu/Debian and install a verified release.
# Can also be sourced by install.sh to prepare dependencies for a local package.
set -euo pipefail

wb_log() { printf '\033[1;34m[Workbuddy Pro]\033[0m %s\n' "$*"; }
wb_warn() { printf '\033[1;33m[WARNING]\033[0m %s\n' "$*" >&2; }
wb_die() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

wb_default_app_dir() {
  if [[ -f /opt/workbuddy-manager/server/main.py && ! -f /opt/workbuddy-pro/server/main.py ]]; then
    printf '%s\n' /opt/workbuddy-manager
  else
    printf '%s\n' /opt/workbuddy-pro
  fi
}

wb_os_release() { cat /etc/os-release; }

wb_detect_system() {
  [[ $(id -u) == 0 ]] || wb_die '请使用 sudo bash bootstrap.sh，或切换 root 后运行。'
  [[ $(uname -s) == Linux ]] || wb_die '此脚本适用于 Ubuntu/Debian 云服务器。'
  # os-release is a trusted, root-owned system file.
  eval "$(wb_os_release)"
  case "${ID:-}" in ubuntu|debian) ;; *) wb_die "不支持的系统：${ID:-unknown}（支持 Ubuntu/Debian）。" ;; esac
  WB_OS_ID=$ID
  WB_OS_CODENAME=${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}
  [[ $WB_OS_CODENAME =~ ^[a-z][a-z0-9-]*$ ]] || wb_die '无法识别系统发行代号。'
  case "$(uname -m)" in
    x86_64) WB_COMPOSE_ARCH=x86_64 ;;
    aarch64|arm64) WB_COMPOSE_ARCH=aarch64 ;;
    *) wb_die '支持的服务器架构为 x86_64 / ARM64。' ;;
  esac
  command -v apt-get >/dev/null || wb_die '此系统缺少 apt-get。'
  command -v systemctl >/dev/null || wb_die '此脚本需要使用 systemd 的云服务器。'
  [[ -d /run/systemd/system ]] || wb_die 'systemd 未运行；请在云服务器宿主机中运行此脚本。'
  APP_DIR=${APP_DIR:-$(wb_default_app_dir)}
  UPSTREAM_DIR=${UPSTREAM_DIR:-/opt/workbuddy2api}
  local directory port
  for directory in "$APP_DIR" "$UPSTREAM_DIR"; do
    [[ $directory =~ ^/[A-Za-z0-9._/-]+$ && $(realpath -m "$directory") != / ]] || wb_die '安装路径必须是绝对目录，仅支持英文、数字、点、下划线和连字符，且不能是 /。'
  done
  APP_DIR=$(realpath -m "$APP_DIR")
  UPSTREAM_DIR=$(realpath -m "$UPSTREAM_DIR")
  for port in "${MANAGER_PORT:-7864}" "${UPSTREAM_PORT:-7863}"; do
    [[ $port =~ ^[1-9][0-9]{0,4}$ ]] && ((port <= 65535)) || wb_die '端口必须为 1–65535。'
  done
  export APP_DIR UPSTREAM_DIR
  wb_log "系统：$WB_OS_ID / $WB_OS_CODENAME；安装目录：$APP_DIR"
}

wb_fetch() {
  curl --fail --location --silent --show-error --retry 3 --connect-timeout 20 --max-time 600 "$1" -o "$2"
}

wb_python_ok() {
  "$1" -c 'import sys, venv; sys.exit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1
}

wb_prepare_python() {
  local candidate
  if [[ -n ${PY:-} ]]; then
    wb_python_ok "$PY" || wb_die '指定的 PY 不可用，需要 Python 3.11+ 和 venv。'
  else
    for candidate in python3 python3.13 python3.12 python3.11; do
      if command -v "$candidate" >/dev/null && wb_python_ok "$candidate"; then
        PY=$(command -v "$candidate")
        break
      fi
    done
  fi
  if [[ -z ${PY:-} ]]; then
    wb_log '系统 Python 版本不足，安装项目独立 Python 3.12…'
    local uv_dir="$APP_DIR/.tools/uv" uv_installer
    mkdir -p "$uv_dir"
    uv_installer=$(mktemp)
    if [[ ! -x $uv_dir/uv ]]; then
      wb_fetch https://astral.sh/uv/install.sh "$uv_installer"
      env UV_UNMANAGED_INSTALL="$uv_dir" sh "$uv_installer"
    fi
    rm -f -- "$uv_installer"
    export UV_PYTHON_INSTALL_DIR="$APP_DIR/.tools/python"
    export UV_PYTHON_BIN_DIR="$APP_DIR/.tools/python-bin"
    "$uv_dir/uv" python install 3.12
    PY=$("$uv_dir/uv" python find --managed-python 3.12)
    wb_python_ok "$PY" || wb_die '独立 Python 运行时安装失败。'
  fi
  export PY
  wb_log "Python：$("$PY" --version)（$PY）"
}

wb_install_docker() {
  wb_log '从 Docker 官方 APT 源安装 Docker Engine 和 Compose…'
  local key_file=/etc/apt/keyrings/workbuddy-pro-docker.asc
  install -m 0755 -d /etc/apt/keyrings
  wb_fetch "https://download.docker.com/linux/$WB_OS_ID/gpg" "$key_file"
  chmod a+r "$key_file"
  cat > /etc/apt/sources.list.d/workbuddy-pro-docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/$WB_OS_ID
Suites: $WB_OS_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: $key_file
EOF
  apt-get update
  apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

wb_install_compose() {
  # An existing engine may belong to the distribution or a control panel.
  # Install only the official CLI plugin instead of replacing that engine.
  wb_log '保留现有 Docker，补装官方 Compose 插件…'
  local tag name staging expected actual
  tag=$(curl -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o /dev/null -w '%{url_effective}' https://github.com/docker/compose/releases/latest)
  tag=${tag##*/}
  [[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || wb_die '无法识别 Compose 版本。'
  name="docker-compose-linux-$WB_COMPOSE_ARCH"
  staging=$(mktemp -d)
  wb_fetch "https://github.com/docker/compose/releases/download/$tag/$name" "$staging/$name"
  wb_fetch "https://github.com/docker/compose/releases/download/$tag/$name.sha256" "$staging/$name.sha256"
  expected=$(awk 'NR==1 {print $1}' "$staging/$name.sha256")
  [[ $expected =~ ^[a-fA-F0-9]{64}$ ]] || wb_die 'Compose 校验信息无效。'
  actual=$(sha256sum "$staging/$name"); actual=${actual%% *}
  [[ ${actual,,} == ${expected,,} ]] || wb_die 'Compose SHA-256 校验失败。'
  install -m 0755 -D "$staging/$name" /usr/local/lib/docker/cli-plugins/docker-compose
  rm -f -- "$staging/$name" "$staging/$name.sha256"
  rmdir "$staging"
}

wb_prepare_docker() {
  if ! command -v docker >/dev/null; then
    wb_install_docker
  elif ! docker compose version >/dev/null 2>&1; then
    wb_install_compose
  else
    wb_log "复用 Docker：$(docker --version)；$(docker compose version --short)"
  fi
  docker compose version >/dev/null || wb_die 'Docker Compose 安装失败。'
  systemctl enable --now docker
  local attempt
  for attempt in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then return; fi
    sleep 1
  done
  wb_die 'Docker 服务未就绪，请运行 journalctl -u docker -n 80 查看日志。'
}

wb_prepare_system() {
  local skip_upstream=${1:-0}
  wb_detect_system
  export DEBIAN_FRONTEND=noninteractive
  wb_log '安装系统依赖…'
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl tar gzip git iproute2 python3 python3-venv python3-pip
  wb_prepare_python
  if [[ $skip_upstream != 1 ]]; then wb_prepare_docker; fi
}

wb_configure_firewall() {
  local port=${MANAGER_PORT:-7864} status
  if [[ ${WB_CONFIGURE_FIREWALL:-1} == 0 ]]; then
    wb_log '按 WB_CONFIGURE_FIREWALL=0 跳过主机防火墙配置。'
    return 0
  fi
  if ! command -v ufw >/dev/null 2>&1; then
    wb_log "未检测到 UFW；若使用其他主机防火墙，请自行允许 TCP $port。"
    return 0
  fi
  if ! status=$(LC_ALL=C ufw status 2>&1); then
    wb_warn "无法读取 UFW 状态，未自动放行 TCP $port；请检查防火墙后运行：sudo ufw allow $port/tcp"
    return 0
  fi
  case "$status" in
    'Status: active'*) ;;
    'Status: inactive'*)
      wb_log 'UFW 未启用，跳过主机防火墙配置。'
      return 0 ;;
    *)
      wb_warn "无法识别 UFW 状态，未自动放行 TCP $port；请手动检查防火墙。"
      return 0 ;;
  esac
  # UFW applies rules immediately and skips existing rules on repeated installs.
  # Open only the manager's TCP port; the upstream stays on loopback.
  if ufw allow "$port/tcp"; then
    wb_log "UFW 已允许管理端 TCP $port（立即生效）。"
  else
    wb_warn "UFW 未能放行管理端 TCP $port；请手动运行：sudo ufw allow $port/tcp"
  fi
}

wb_verify_archive() {
  local archive=$1 checksum=$2 expected actual
  expected=$(awk 'NR==1 {print $1}' "$checksum")
  [[ $expected =~ ^[a-fA-F0-9]{64}$ ]] || wb_die '发布包 SHA-256 信息无效，停止安装。'
  actual=$(sha256sum "$archive"); actual=${actual%% *}
  [[ ${actual,,} == ${expected,,} ]] || wb_die '发布包 SHA-256 不匹配，停止安装。'
  wb_log '发布包 SHA-256 校验通过。'
}

wb_unpack_release() {
  "$PY" - "$1" "$2" "$3" <<'PY'
import pathlib, sys, tarfile
archive_path, destination, tag = sys.argv[1:]
root = 'workbuddy-pro-' + tag
with tarfile.open(archive_path) as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if (path.is_absolute() or '..' in path.parts or not path.parts
                or path.parts[0] != root or not (member.isfile() or member.isdir())):
            raise SystemExit('Unsafe release archive entry: ' + member.name)
    # Older Python 3.11 builds do not have extraction filters. Entries above
    # are already restricted to regular files/directories under one safe root.
    options = {'filter': 'data'} if hasattr(tarfile, 'data_filter') else {}
    archive.extractall(destination, **options)
stage = pathlib.Path(destination) / root
for required in ('deploy/install.sh', 'server/main.py', 'web/out/index.html', 'upstream/docker-compose.yml'):
    if not (stage / required).is_file():
        raise SystemExit('Incomplete release: ' + required)
if (stage / '.version').read_text().strip() != tag:
    raise SystemExit('Release version does not match its tag')
PY
}

wb_cleanup() {
  # Delete only the temporary directory created by this invocation.
  if [[ -n ${WB_BOOTSTRAP_TEMP:-} && -d $WB_BOOTSTRAP_TEMP && ! -L $WB_BOOTSTRAP_TEMP
        && $WB_BOOTSTRAP_TEMP == "${WB_BOOTSTRAP_TEMP_PARENT:?}"/workbuddy-pro-bootstrap.* ]]; then
    rm -rf -- "$WB_BOOTSTRAP_TEMP"
  fi
}

wb_main() {
  local deps_only=0 skip_upstream=0 arg
  for arg in "$@"; do
    case "$arg" in
      --deps-only) deps_only=1 ;;
      --skip-upstream) skip_upstream=1 ;;
      -h|--help)
        printf '%s\n' 'Workbuddy Pro 一键部署（Ubuntu/Debian，x86_64/ARM64）' \
          'sudo bash bootstrap.sh             自动安装所有依赖并部署最新 Release' \
          'sudo bash bootstrap.sh --deps-only  只准备系统依赖' \
          '可选环境变量：APP_DIR、UPSTREAM_DIR、MANAGER_PORT、WB_VERSION、PY、WB_CONFIGURE_FIREWALL（0=不修改主机防火墙）'
        return ;;
      *) wb_die "未知参数：$arg" ;;
    esac
  done
  wb_prepare_system "$skip_upstream"
  [[ $deps_only == 0 ]] || return 0
  local repo=${WB_MANAGER_REPO:-kerntau/workbuddy-pro} tag=${WB_VERSION:-} resolved name stage
  [[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || wb_die 'WB_MANAGER_REPO 格式错误。'
  if [[ -z $tag ]]; then
    resolved=$(curl -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o /dev/null -w '%{url_effective}' "https://github.com/$repo/releases/latest")
    tag=${resolved##*/}
  fi
  [[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || wb_die '无法识别发布版本。'
  WB_BOOTSTRAP_TEMP_PARENT=$(realpath -m "${TMPDIR:-/tmp}")
  WB_BOOTSTRAP_TEMP=$(mktemp -d "$WB_BOOTSTRAP_TEMP_PARENT/workbuddy-pro-bootstrap.XXXXXX")
  trap wb_cleanup EXIT
  name="workbuddy-pro-$tag.tar.gz"
  wb_log "下载 $tag…"
  wb_fetch "https://github.com/$repo/releases/download/$tag/$name" "$WB_BOOTSTRAP_TEMP/$name"
  wb_fetch "https://github.com/$repo/releases/download/$tag/$name.sha256" "$WB_BOOTSTRAP_TEMP/$name.sha256"
  wb_verify_archive "$WB_BOOTSTRAP_TEMP/$name" "$WB_BOOTSTRAP_TEMP/$name.sha256"
  wb_unpack_release "$WB_BOOTSTRAP_TEMP/$name" "$WB_BOOTSTRAP_TEMP" "$tag"
  stage="$WB_BOOTSTRAP_TEMP/workbuddy-pro-$tag"
  # Run only the installer extracted from the verified release. A downloaded
  # bootstrap can sit beside an old /tmp/install.sh or an unrelated installer;
  # neither may overwrite files whose release checksum has already passed.
  grep -q 'wb_prepare_system' "$stage/deploy/install.sh" || wb_die "发布包 $tag 中的安装器缺少自动安装依赖功能，请选择 v2.6.6 或更新的完整部署包。"
  if [[ $skip_upstream == 1 ]]; then
    env WB_BOOTSTRAP_PREPARED=1 WB_BOOTSTRAP_FIREWALL_MANAGED=1 APP_DIR="$APP_DIR" PY="$PY" bash "$stage/deploy/install.sh" --skip-upstream
  else
    env WB_BOOTSTRAP_PREPARED=1 WB_BOOTSTRAP_FIREWALL_MANAGED=1 APP_DIR="$APP_DIR" PY="$PY" bash "$stage/deploy/install.sh"
  fi
  systemctl is-active --quiet workbuddy-web || wb_die '管理端服务未启动成功。'
  curl -fsS --retry 5 --retry-connrefused --retry-delay 2 "http://127.0.0.1:${MANAGER_PORT:-7864}/api/healthz" >/dev/null \
    || wb_die '管理端健康检查失败，请查看 journalctl -u workbuddy-web -n 80。'
  # Handle this here even when the verified release contains an older installer.
  wb_configure_firewall
  wb_log "已完成安装并设置开机启动。访问 http://服务器公网IP:${MANAGER_PORT:-7864}"
  wb_log "初始密码：sudo cat $APP_DIR/data/initial-admin-password.txt"
  wb_log "云平台安全组仍需确认已放行 TCP ${MANAGER_PORT:-7864}；上游 ${UPSTREAM_PORT:-7863} 仅监听本机。"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then wb_main "$@"; fi
