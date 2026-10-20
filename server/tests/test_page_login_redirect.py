"""Exercise the real static-page handlers with signed, expired and revoked sessions."""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server import config, main, security
from server.routers import auth


class PageLoginRedirectTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.static = self.root / 'static'
        self.static.mkdir()
        for name in ('index.html', 'dashboard/index.html', 'settings/users/index.html',
                     'login/index.html', 'login.html', 'claim/index.html', '404.html',
                     'dashboard/index.txt', '_next/static/chunk.js', 'robots.txt'):
            path = self.static / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(name, encoding='utf-8')
        users = self.root / 'users.json'
        self.users = {'secret': 'page-test-secret', 'users': [
            {'username': 'admin', 'role': 'admin', 'sv': 0}], 'api_keys': []}
        users.write_text(json.dumps(self.users), encoding='utf-8')
        for name, value in {'STATIC_DIR': self.static, 'USERS_FILE': users,
                            'DATA_DIR': self.root, 'BASE_PATH': '',
                            'SESSION_IDLE_HOURS': 12}.items():
            patcher = mock.patch.object(config, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.app = FastAPI()
        self.app.middleware('http')(main.cache_headers)
        self.app.include_router(auth.router)
        self.app.add_api_route('/', main.index, methods=['GET'])
        self.app.add_api_route('/{full_path:path}', main.spa, methods=['GET'])
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def test_anonymous_management_pages_redirect_before_sending_html(self):
        for path in ('/dashboard', '/dashboard/',
                     '/dashboard/index.html', '/settings/users/'):
            with self.subTest(path=path):
                response = self.client.get(path, follow_redirects=False)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.headers['location'], '/')
                self.assertEqual(response.headers['cache-control'], 'no-store')
                self.assertNotIn('dashboard/index.html', response.text)

    def test_anonymous_root_stays_at_the_public_entry(self):
        response = self.client.get('/', follow_redirects=False)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.url.path, '/')
        self.assertEqual(response.text, 'index.html')
        self.assertNotIn('location', response.headers)

    def test_anonymous_navigation_reaches_root_without_a_loop(self):
        response = self.client.get('/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.url.path, '/')
        self.assertEqual(response.text, 'index.html')
        self.assertEqual(len(response.history), 1)

    def test_valid_session_can_open_management_pages(self):
        self.client.cookies.set(config.COOKIE_NAME, security.issue_token('admin', 'admin'))
        for path in ('/dashboard/', '/settings/users/'):
            with self.subTest(path=path):
                response = self.client.get(path, follow_redirects=False)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_invalid_expired_and_revoked_sessions_redirect(self):
        now = int(time.time())
        tokens = ['invalid-token']
        for overrides in ({'exp': now - 1}, {'sv': 1}, {'iat': now - 13 * 3600},
                          {'username': 'deleted'}):
            payload = {'username': 'admin', 'role': 'admin', 'sv': 0,
                       'iat': now, 'orig': now, 'exp': now + 3600, **overrides}
            tokens.append(security._sign(json.dumps(payload), self.users['secret']))
        for token in tokens:
            with self.subTest(token=token[:20]):
                self.client.cookies.set(config.COOKIE_NAME, token)
                response = self.client.get('/dashboard/', follow_redirects=False)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.headers['location'], '/')

    def test_legacy_login_paths_return_to_root(self):
        for path in ('/login', '/login/', '/login/index.html', '/login.html'):
            with self.subTest(path=path):
                response = self.client.get(path, follow_redirects=False)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.headers['location'], '/')
                self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_public_pages_and_assets_remain_accessible(self):
        for path in ('/', '/index.html', '/claim/', '/404.html',
                     '/_next/static/chunk.js', '/robots.txt'):
            with self.subTest(path=path):
                response = self.client.get(path, follow_redirects=False)
                self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/not-a-page/').status_code, 404)

    def test_rsc_fetch_and_api_authentication_keep_their_response_types(self):
        response = self.client.get('/dashboard/index.txt', headers={'rsc': '1'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, 'dashboard/index.txt')
        response = self.client.get('/api/me', follow_redirects=False)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {'detail': '未登录'})
        self.assertEqual(self.client.get('/api/healthz').status_code, 200)

    def test_subpath_redirect_stays_under_the_deployment_prefix(self):
        with mock.patch.object(config, 'BASE_PATH', '/manager'):
            self.app.add_middleware(main.StripBasePathMiddleware, prefix='/manager')
            response = self.client.get('/manager/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.url.path, '/manager/')
        self.assertEqual(response.history[0].headers['location'], '/manager/')


if __name__ == '__main__':
    unittest.main()
