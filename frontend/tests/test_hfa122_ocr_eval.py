"""HFA #122: synthetic-only, offline adversarial tests of the OCR evaluator."""
import copy
from hashlib import sha256
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from hfa122_ocr_eval import evaluate, InvalidEvidence, edits

class OCRQualityTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.original=b'\x89PNG\r\n\x1a\nSYNTHETIC_VALIDATION'
        self.root.joinpath('source.png').write_bytes(self.original)
        self.root.joinpath('reference.txt').write_bytes(b'ABC hello world')
        self.root.joinpath('recognized.txt').write_bytes(b'ABC hello world')
        self.case={
            'id':'synthetic-1','kind':'png','sampling_stratum':'synthetic-clean',
            'original_path':'source.png','source_document_sha256':sha256(self.original).hexdigest(),
            'reference_path':'reference.txt',
            'reference_sha256':sha256(b'ABC hello world').hexdigest(),
            'ocr_path':'recognized.txt',
            'ocr_sha256':sha256(b'ABC hello world').hexdigest(),
            'consent_authorization_id':'SYNTHETIC_ONLY',
            'ground_truth_verified_by':'synthetic-test',
            'ocr_engine_version':'tesseract.synthetic',
        }
        self.manifest=self.root/'manifest.json'

    def run_case(self,case=None,protocol='HFA122-OCR-EVAL-2'):
        self.manifest.write_text(json.dumps({'protocol_version':protocol,
            'cases':[case or self.case]}),encoding='utf-8')
        return evaluate(self.manifest)

    def test_zero_errors(self):
        out=self.run_case()
        self.assertEqual(out['n_cases'],1)
        self.assertEqual(out['overall']['strict']['CER'],0)
        self.assertEqual(out['overall']['strict']['WER'],0)
        self.assertIn('png / synthetic-clean',out['by_kind_and_stratum'])

    def test_substitutions(self):
        self.root.joinpath('recognized.txt').write_bytes(b'ABC hello world!')
        self.case['ocr_sha256']=sha256(b'ABC hello world!').hexdigest()
        result=self.run_case()
        self.assertGreater(result['overall']['strict']['CER'],0)
        self.assertAlmostEqual(result['overall']['strict']['WER'],1/3,places=6)

    def test_whitespace_policy(self):
        self.root.joinpath('recognized.txt').write_bytes(b'ABC  hello world')
        self.case['ocr_sha256']=sha256(b'ABC  hello world').hexdigest()
        result=self.run_case()
        self.assertGreater(result['overall']['strict']['CER'],0)
        self.assertEqual(result['overall']['whitespace']['CER'],0)

    def test_original_hash_tampered(self):
        self.root.joinpath('source.png').write_bytes(self.original+b'altered')
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_original_signature_fake(self):
        new=b'JPG\x00'+self.original
        self.root.joinpath('source.png').write_bytes(new)
        self.case['source_document_sha256']=sha256(new).hexdigest()
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_reference_tampered(self):
        self.root.joinpath('reference.txt').write_bytes(b'DIFFERENT')
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_ocr_tampered(self):
        self.root.joinpath('recognized.txt').write_bytes(b'DIFFERENT')
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_missing_consent(self):
        self.case.pop('consent_authorization_id')
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_missing_human_reference_verification(self):
        self.case.pop('ground_truth_verified_by')
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_relative_path_escape(self):
        self.case['original_path']='../source.png'
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_symlink_blocks(self):
        target=self.root/'source.png'
        (self.root/'link.png').symlink_to(target)
        self.case['original_path']='link.png'
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_wrong_protocol_version(self):
        with self.assertRaises(InvalidEvidence):self.run_case(protocol='1')

    def test_duplicate_case_ids(self):
        self.manifest.write_text(json.dumps({'protocol_version':'HFA122-OCR-EVAL-2',
            'cases':[self.case,self.case]}))
        with self.assertRaises(InvalidEvidence):evaluate(self.manifest)

    def test_independent_reference_and_ocr(self):
        self.case['ocr_path']='reference.txt'
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_empty_ground_truth(self):
        self.root.joinpath('reference.txt').write_bytes(b'    ')
        self.case['reference_sha256']=sha256(b'    ').hexdigest()
        with self.assertRaises(InvalidEvidence):self.run_case()

    def test_edit_distance_cpu_budget(self):
        # A valid-size but adversarial transcript must fail quickly, not hang.
        with self.assertRaisesRegex(InvalidEvidence, 'computation budget'):
            edits('A'*6000, 'B'*6000)

    def test_large_equal_transcripts_without_quadratic_work(self):
        self.assertEqual(edits('A'*100_000, 'A'*100_000), 0)
        self.assertEqual(edits('A'*100_000+'X', 'A'*100_000+'Y'), 1)

    def test_edit_distance_boundaries(self):
        self.assertEqual(edits([],[]),0)
        self.assertEqual(edits('abcd','ab'),2)
        self.assertEqual(edits(['a','b'],['a','x','b']),1)

if __name__=='__main__':
    unittest.main()
