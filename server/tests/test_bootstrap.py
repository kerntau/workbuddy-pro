"""Run the real Bash bootstrap with isolated fixtures; never install host packages."""
from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BASH = (r'C:\Program Files\Git\bin\bash.exe' if os.name == 'nt' else shutil.which('bash'))
if BASH and not Path(BASH).is_file():
    BASH = None


@unittest.skipUnless(BASH, 'Bash is required')
class BootstrapTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def run_bash(self, script, *, ok=True):
        env = dict(os.environ, WB_TEST_ROOT=self.directory.as_posix(),
                   PY=Path(sys.executable).as_posix(), WB_REAL_PY=Path(sys.executable).as_posix())
        result = subprocess.run(
            [BASH, '-c', f'source "{ROOT.as_posix()}/deploy/bootstrap.sh"\n' + script],
            env=env, capture_output=True, text=True, encoding='utf-8', timeout=20)
        if ok:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def archive(self, *, extra=None, version='v2.6.6'):
        target = self.directory / 'release.tar.gz'
        with tarfile.open(target, 'w:gz') as archive:
            for name, data in {
                '.version': version, 'deploy/install.sh': '#!/bin/bash\n',
                'server/main.py': '# fixture\n', 'web/out/index.html': 'Workbuddy Pro',
                'upstream/docker-compose.yml': 'services: {}',
            }.items():
                payload = data.encode()
                entry = tarfile.TarInfo('workbuddy-pro-v2.6.6/' + name)
                entry.size = len(payload)
                archive.addfile(entry, io.BytesIO(payload))
            if extra:
                archive.addfile(extra)
        return target

    def test_help_does_not_provision(self):
        self.run_bash('wb_prepare_system() { exit 99; }; wb_main --help')

    def test_unknown_option_is_rejected(self):
        self.run_bash('wb_prepare_system() { exit 99; }; wb_main --unexpected', ok=False)

    def test_checksum_accepts_valid_and_rejects_tampered_download(self):
        archive = self.archive()
        (self.directory / 'release.sha256').write_text(
            hashlib.sha256(archive.read_bytes()).hexdigest() + '  release.tar.gz\n')
        command = 'wb_verify_archive "$WB_TEST_ROOT/release.tar.gz" "$WB_TEST_ROOT/release.sha256"'
        self.run_bash(command)
        archive.write_bytes(archive.read_bytes() + b'tampered')
        self.run_bash(command + '\nprintf should-not-run', ok=False)

    def test_regular_release_extracts(self):
        self.archive()
        self.run_bash('wb_unpack_release "$WB_TEST_ROOT/release.tar.gz" "$WB_TEST_ROOT/out" v2.6.6')
        self.assertTrue((self.directory / 'out/workbuddy-pro-v2.6.6/web/out/index.html').is_file())

    def test_traversal_and_symlink_are_refused(self):
        for name, kind in [('workbuddy-pro-v2.6.6/../../escape', tarfile.REGTYPE),
                           ('workbuddy-pro-v2.6.6/linked', tarfile.SYMTYPE)]:
            with self.subTest(name=name):
                entry = tarfile.TarInfo(name)
                entry.type = kind
                entry.linkname = '/etc/passwd' if kind == tarfile.SYMTYPE else ''
                self.archive(extra=entry)
                self.run_bash('wb_unpack_release "$WB_TEST_ROOT/release.tar.gz" "$WB_TEST_ROOT/out" v2.6.6', ok=False)
                self.assertFalse((self.directory / 'escape').exists())

    def test_version_mismatch_is_refused(self):
        self.archive(version='v0.0.1')
        self.run_bash('wb_unpack_release "$WB_TEST_ROOT/release.tar.gz" "$WB_TEST_ROOT/out" v2.6.6', ok=False)

    def test_stale_neighboring_installer_cannot_replace_verified_package(self):
        shutil.copyfile(ROOT / 'deploy/bootstrap.sh', self.directory / 'bootstrap.sh')
        (self.directory / 'install.sh').write_text('# Old, unrelated installer\nexit 99\n')
        self.run_bash('''
source "$WB_TEST_ROOT/bootstrap.sh"
APP_DIR="$WB_TEST_ROOT/app"
TMPDIR="$WB_TEST_ROOT"
WB_VERSION=v2.6.6
wb_prepare_system() { :; }
wb_fetch() { : > "$2"; }
wb_verify_archive() { :; }
wb_unpack_release() {
  mkdir -p "$2/workbuddy-pro-$3/deploy"
  cat > "$2/workbuddy-pro-$3/deploy/install.sh" <<'INSTALL'
#!/usr/bin/env bash
# wb_prepare_system: this is the installer from the verified release.
printf verified-release > "$WB_TEST_ROOT/installer-used"
INSTALL
}
systemctl() { :; }
curl() { :; }
wb_main
''')
        self.assertEqual((self.directory / 'installer-used').read_text(), 'verified-release')

    def test_existing_docker_and_compose_are_reused(self):
        self.run_bash('''
docker() { return 0; }
systemctl() { printf '%s\n' "$*" >> "$WB_TEST_ROOT/calls"; }
wb_install_docker() { exit 91; }
wb_install_compose() { exit 92; }
wb_prepare_docker
''')
        self.assertIn('enable --now docker', (self.directory / 'calls').read_text())

    def test_missing_compose_installs_only_plugin(self):
        self.run_bash('''
ready=0
docker() { if [[ "$1 ${2:-}" == 'compose version' && $ready == 0 ]]; then return 1; fi; }
systemctl() { :; }
wb_install_docker() { exit 91; }
wb_install_compose() { ready=1; printf plugin > "$WB_TEST_ROOT/calls"; }
wb_prepare_docker
''')
        self.assertEqual((self.directory / 'calls').read_text(), 'plugin')

    def test_missing_docker_installs_engine(self):
        self.run_bash('''
command() { if [[ "$*" == '-v docker' ]]; then return 1; else builtin command "$@"; fi; }
systemctl() { :; }
wb_install_docker() { printf engine > "$WB_TEST_ROOT/calls"; docker() { :; }; }
wb_install_compose() { exit 92; }
wb_prepare_docker
''')
        self.assertEqual((self.directory / 'calls').read_text(), 'engine')

    def test_unusable_explicit_python_is_rejected(self):
        self.run_bash('PY=/definitely/missing/python; wb_prepare_python', ok=False)

    def test_old_system_python_gets_project_runtime(self):
        self.run_bash('''
unset PY
APP_DIR="$WB_TEST_ROOT/app"
command() { case "$*" in '-v python'*) return 1;; *) builtin command "$@";; esac; }
wb_fetch() {
  cat > "$2" <<'INSTALL'
#!/bin/sh
cat > "$UV_UNMANAGED_INSTALL/uv" <<'UV'
#!/usr/bin/env bash
if [[ $2 == install ]]; then printf installed > "$WB_TEST_ROOT/runtime"; else printf '%s\n' "$WB_REAL_PY"; fi
UV
chmod +x "$UV_UNMANAGED_INSTALL/uv"
INSTALL
}
wb_prepare_python
[[ $PY == "$WB_REAL_PY" ]]
[[ $UV_PYTHON_INSTALL_DIR == "$APP_DIR/.tools/python" ]]
''')
        self.assertEqual((self.directory / 'runtime').read_text(), 'installed')

    def test_unsupported_os_stops_before_package_installation(self):
        result = self.run_bash('''
id() { echo 0; }; uname() { echo Linux; }
wb_os_release() { printf 'ID=fedora\nVERSION_CODENAME=test\n'; }
apt-get() { printf modified > "$WB_TEST_ROOT/calls"; }
wb_prepare_system
''', ok=False)
        self.assertFalse((self.directory / 'calls').exists())
        self.assertIn('fedora', result.stderr)
