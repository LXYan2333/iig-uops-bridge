import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from scripts import download_data as downloader


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.stage = Path(self.temp.name)
        output = contextlib.redirect_stdout(io.StringIO())
        output.__enter__()
        self.addCleanup(output.__exit__, None, None, None)

    def serve(self, responses):
        def open_url(request, **kwargs):
            result = responses.get(request.full_url, 403)
            if isinstance(result, int):
                raise HTTPError(request.full_url, result, 'Test HTTP error', {}, None)
            return io.BytesIO(result)
        return patch.object(downloader.urllib.request, 'urlopen', side_effect=open_url)

    def test_discovers_current_xml_from_guide_renderer(self):
        renderer = downloader.BASE + '/assets/intrinsicsguide.min.js?new'
        xml = downloader.BASE + '/assets/data-next.xml'
        with self.serve({
            downloader.GUIDE: b'<script src="/assets/intrinsicsguide.min.js?new"></script>',
            renderer: b'url:"data-next.xml"',
            xml: b'<intrinsics_list version="next"><intrinsic name="example"/></intrinsics_list>',
        }):
            manifest = downloader.fetch_intel(self.stage)
        self.assertEqual(manifest['intel-data-3-6-9.xml']['url'], xml)
        self.assertEqual(manifest['intel-intrinsicsguide.min.js']['url'], renderer)

    def test_falls_back_to_official_regional_host_when_main_xml_is_blocked(self):
        renderer = downloader.RENDERER_PATH
        with self.serve({
            downloader.BASE + renderer: b'url:"/assets/data-new.xml"',
            'https://www.intel.cn' + renderer: b'url:"/assets/data-new.xml"',
            'https://www.intel.cn/assets/data-new.xml': b'<intrinsics_list><intrinsic/></intrinsics_list>',
        }):
            manifest = downloader.fetch_intel(self.stage)
        self.assertEqual(manifest['intel-data-3-6-9.xml']['url'], 'https://www.intel.cn/assets/data-new.xml')
        self.assertNotIn('intel-guide.html', manifest)

    def test_rejects_html_in_place_of_xml(self):
        with self.serve({
            'https://www.intel.cn' + downloader.RENDERER_PATH: b'url:"data-new.xml"',
            'https://www.intel.cn' + downloader.RENDERER_PATH.rsplit('/', 1)[0] + '/data-new.xml':
                b'<html><body>Access denied</body></html>',
        }):
            with self.assertRaisesRegex(RuntimeError, 'contains no intrinsics'):
                downloader.fetch_intel(self.stage)

    def test_failed_update_preserves_existing_downloads(self):
        research = self.stage / 'research'
        research.mkdir()
        old = research / 'intel-data-3-6-9.xml'
        old.write_text('previous data')
        with patch.object(downloader, 'ROOT', self.stage), self.serve({}):
            with self.assertRaisesRegex(RuntimeError, 'previous data retained'):
                downloader.main()
        self.assertEqual(old.read_text(), 'previous data')
        self.assertEqual(list(research.iterdir()), [old])

    def test_retries_transient_server_failure(self):
        error = HTTPError('https://uops.info/test', 503, 'Unavailable', {}, None)
        with patch.object(downloader.urllib.request, 'urlopen', side_effect=[error, io.BytesIO(b'ok')]) as opener:
            with patch.object(downloader.time, 'sleep') as sleep:
                downloader.fetch('https://uops.info/test', self.stage / 'data')
        self.assertEqual(opener.call_count, 2)
        sleep.assert_called_once_with(1)
        self.assertEqual((self.stage / 'data').read_bytes(), b'ok')

    def test_does_not_retry_forbidden_response(self):
        with self.serve({}) as opener, patch.object(downloader.time, 'sleep') as sleep:
            with self.assertRaises(HTTPError):
                downloader.fetch(downloader.GUIDE, self.stage / 'data')
        self.assertEqual(opener.call_count, 1)
        sleep.assert_not_called()
        self.assertFalse((self.stage / 'data').exists())


if __name__ == '__main__':
    unittest.main()
