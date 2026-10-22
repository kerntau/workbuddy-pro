"""Run numeric display boundary cases as part of the normal test suite."""
import shutil
import subprocess
import unittest
from pathlib import Path


class NumberDisplayTest(unittest.TestCase):
    def test_number_formats_and_period_summaries(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node.js is not installed')
        version = subprocess.check_output([node, '--version'], text=True, encoding='utf-8', timeout=20)
        if int(version.strip().lstrip('v').split('.')[0]) < 22:
            self.skipTest('Node.js 22+ is required for TypeScript type stripping')
        root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [node, '--experimental-strip-types', 'web/lib/number-format.test.mjs'],
            cwd=root, capture_output=True, text=True, encoding='utf-8', timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('all passed', result.stdout)
