import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import build_support as support, update_data


class SupportDataTests(unittest.TestCase):
    def test_xed_inheritance_removal_readdition_and_common_subset(self):
        chips = support.chips_from(['''A: AVX SSE
B: ALL_OF(A) NOT(AVX) BMI
C: ALL_OF(B) AVX
D: COMMON_SUBSET(A,B) \\
 FMA
'''])
        self.assertEqual(chips['B'], {'SSE', 'BMI'})
        self.assertEqual(chips['C'], {'SSE', 'BMI', 'AVX'})
        self.assertEqual(chips['D'], {'SSE', 'FMA'})
        for text in ['A: ALL_OF(B)\nB: ALL_OF(A)', 'A: UNKNOWN(X)', 'A: SSE\nA: AVX']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                support.chips_from([text])

    def test_llvm_expands_dependencies_and_set_operators(self):
        defs = '\n'.join(f'X86_FEATURE ({f}, "{f.lower()}")' for f in ['SSE', 'AVX', 'AVX2', 'SGX'])
        cpp = '''
constexpr FeatureBitset FeaturesBase = FeatureAVX2 | FeatureSGX;
constexpr FeatureBitset FeaturesChild = (FeaturesBase & ~FeatureSGX);
constexpr FeatureBitset FeaturesOther = FeaturesChild ^ FeatureSGX;
constexpr FeatureBitset ImpliedFeaturesSSE = {};
constexpr FeatureBitset ImpliedFeaturesAVX = FeatureSSE;
constexpr FeatureBitset ImpliedFeaturesAVX2 = FeatureAVX;
constexpr FeatureBitset ImpliedFeaturesSGX = {};
{ {"child"}, {CK_Child, FEATURE_AVX2, FeaturesChild, 'a', false} },
{ {"other"}, {CK_Other, ~0U, FeaturesOther, 'b', false} },
'''
        processors, _ = support.llvm_from(cpp, defs)
        self.assertEqual(processors['child'], {'SSE', 'AVX', 'AVX2'})
        self.assertEqual(processors['other'], {'SSE', 'AVX', 'AVX2', 'SGX'})
        with self.assertRaises(ValueError):
            support.llvm_from(cpp.replace('FeaturesBase & ~FeatureSGX', 'unknown()'), defs)

    def test_cpuid_conditions_are_or_of_and_with_three_valued_logic(self):
        groups = support.cpuid_from(['''XED_ISA_SET_TEST: a b
XED_ISA_SET_TEST, AVX10: c unknown
XED_ISA_SET_EMPTY: n/a'''])
        bindings = {'a': 'A', 'b': 'B', 'c': 'C'}
        evaluate = lambda features: support.evaluate_groups(groups['TEST'], set(features), bindings)
        self.assertTrue(evaluate(['A', 'B']))
        self.assertFalse(evaluate(['A']))  # Both alternatives provably fail.
        self.assertIsNone(evaluate(['C']))  # Cannot discard an unknown alternative.
        self.assertIsNone(support.evaluate_groups(groups['EMPTY'], set(), bindings))
        self.assertIsNone(support.evaluate_groups([], set(), bindings))
        self.assertEqual(support.cpuid_from(['XED_ISA_SET_A: a', 'XED_ISA_SET_A: a']), {'A': [['a']]})
        with self.assertRaises(ValueError):
            support.cpuid_from(['XED_ISA_SET_A: a', 'XED_ISA_SET_A: b'])
        with self.assertRaises(ValueError):
            support.cpuid_from(['XED_ISA_SET_A, NEW_GROUP: a'])

    def test_conflicts_are_unknown_not_preferred_source_wins(self):
        self.assertEqual(support.combine(True, False), 'conflicts')
        self.assertEqual(support.combine(None, None), 'unknown')
        self.assertEqual(support.combine(None, False), 'unsupported')
        self.assertEqual(support.combine(True, None), 'supported')

    def test_failed_download_or_checksum_does_not_replace_old_sources(self):
        from scripts import download_data
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            old = directory / 'xed.tar.gz'; old.write_bytes(b'previous')
            with patch.object(download_data, 'fetch', side_effect=OSError('unavailable')):
                with self.assertRaises(OSError):
                    support.download(directory)
            def wrong_download(url, target):
                target.write_bytes(b'wrong content')
            with patch.object(download_data, 'fetch', side_effect=wrong_download):
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    support.download(directory)
            self.assertEqual(old.read_bytes(), b'previous')

    def test_support_parse_failure_keeps_both_generated_datasets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); generated = root / 'src/generated'; generated.mkdir(parents=True)
            for name in ('index.json', 'support.json'):
                (generated / name).write_text('old')
            def run(command, **kwargs):
                if command[1].endswith('build_data.py'):
                    Path(command[command.index('--output') + 1]).write_text('new index')
                else:
                    raise ValueError('invalid support source')
            with patch.object(update_data, 'ROOT', root), patch('sys.argv', ['update_data.py']), patch.object(update_data.subprocess, 'run', side_effect=run):
                with self.assertRaises(ValueError):
                    update_data.main()
            for name in ('index.json', 'support.json'):
                self.assertEqual((generated / name).read_text(), 'old')

    def test_bundled_data_is_disjoint_and_pinned_to_source_lock(self):
        data = json.loads((support.ROOT / 'src/generated/support.json').read_text())
        self.assertEqual(data['sources'], json.loads(support.LOCK.read_text()))
        for model in data['architectures'].values():
            a, b, c = (set(model[key]) for key in ['supported', 'unsupported', 'conflicts'])
            self.assertFalse(a & b or a & c or b & c)
        self.assertIn('AVX512_VBMI2_512', data['architectures']['ZEN4']['supported'])
        self.assertIn('AVX512_VBMI2_512', data['architectures']['ZEN3']['unsupported'])


if __name__ == '__main__':
    unittest.main()
