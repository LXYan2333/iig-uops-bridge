import unittest
import xml.etree.ElementTree as ET

from scripts.build_data import detail_id, table_catalog


class CatalogTests(unittest.TestCase):
    def instruction(self, name='VPSHRDQ (ZMM, ZMM, ZMM, I8)', extension='AVX512EVEX', **attrs):
        return ET.Element('instruction', {'string': name, 'extension': extension, **attrs})

    def test_recovers_missing_url_from_full_official_catalog_entry(self):
        catalog = table_catalog('VPSHRDQ (ZMM, ZMM, ZMM, I8)|AVX512EVEX\n')
        self.assertEqual(detail_id(self.instruction(), catalog), 'VPSHRDQ_ZMM_ZMM_ZMM_I8')

    def test_preserves_width_mask_zeroing_memory_and_broadcast_variants(self):
        names = {
            'VPSHRDQ (YMM, YMM, YMM, I8)': 'VPSHRDQ_YMM_YMM_YMM_I8',
            'VPSHRDQ (ZMM, K, ZMM, ZMM, I8)': 'VPSHRDQ_ZMM_K_ZMM_ZMM_I8',
            'VPSHRDQ_Z (ZMM, K, ZMM, ZMM, I8)': 'VPSHRDQ_Z_ZMM_K_ZMM_ZMM_I8',
            'VPSHRDQ (ZMM, ZMM, M512, I8)': 'VPSHRDQ_ZMM_ZMM_M512_I8',
            'VPSHRDQ (ZMM, ZMM, M64_1to8, I8)': 'VPSHRDQ_ZMM_ZMM_M64_1to8_I8',
        }
        catalog = table_catalog('\n'.join(name + '|AVX512EVEX' for name in names))
        for name, identifier in names.items():
            with self.subTest(name=name):
                self.assertEqual(detail_id(self.instruction(name), catalog), identifier)

    def test_does_not_invent_links_for_unlisted_names_or_extensions(self):
        catalog = table_catalog('VPSHRDQ (ZMM, ZMM, ZMM, I8)|AVX512EVEX')
        self.assertIsNone(detail_id(self.instruction('VPSHRDQ (ZMM, ZMM, M512, I8)'), catalog))
        self.assertIsNone(detail_id(self.instruction(extension='OTHER'), catalog))

    def test_retains_explicit_xml_url_without_a_catalog_match(self):
        for prefix in ['uops.info', 'https://uops.info']:
            self.assertEqual(detail_id(self.instruction(url=prefix + '/html-instr/EXPLICIT.html'), {}), 'EXPLICIT')

    def test_rejects_unsafe_xml_urls_instead_of_falling_back(self):
        catalog = table_catalog('VPSHRDQ (ZMM, ZMM, ZMM, I8)|AVX512EVEX')
        for url in ['evil.test/html-instr/X.html', 'http://uops.info/html-instr/X.html',
                    'uops.info/html-instr/../X.html', 'uops.info/html-instr/X.html?other=1']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                detail_id(self.instruction(url=url), catalog)

    def test_rejects_invalid_or_colliding_catalog_entries(self):
        for data in ['', '<html>Access denied</html>', 'NAME|', 'NAME|EXT|EXTRA',
                     '../X|EXT', 'X (R64)|EXT\nX_R64|EXT', 'X|EXT\nX|OTHER']:
            with self.subTest(data=data), self.assertRaises(ValueError):
                table_catalog(data)


if __name__ == '__main__':
    unittest.main()
