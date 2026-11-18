import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "training" / "validate_sft_dataset.py"
SPEC = importlib.util.spec_from_file_location("qq_ai_dataset_validator", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class DatasetValidatorTests(unittest.TestCase):
    def setUp(self):
        self.valid = {
            "id": "case-1",
            "split": "train",
            "license": "CC0-1.0",
            "source": {"kind": "authored", "reference": "Original QQ AI example"},
            "messages": [
                {"role": "user", "content": "Сколько будет 5 + 7?"},
                {"role": "assistant", "content": "12."},
            ],
        }

    def test_accepts_valid_record(self):
        split, fingerprint = MODULE.validate_record(self.valid, 1)
        self.assertEqual(split, "train")
        self.assertIn("5 + 7", fingerprint)

    def test_rejects_unknown_license(self):
        record = dict(self.valid)
        record["license"] = "unknown"
        with self.assertRaises(MODULE.DatasetError):
            MODULE.validate_record(record, 1)

    def test_rejects_personal_contact_information(self):
        record = dict(self.valid)
        record["messages"] = [
            {"role": "user", "content": "Свяжись со мной test@example.com"},
            {"role": "assistant", "content": "Хорошо."},
        ]
        with self.assertRaises(MODULE.DatasetError):
            MODULE.validate_record(record, 1)

    def test_requires_consent_reference_for_consented_data(self):
        record = dict(self.valid)
        record["source"] = {"kind": "consented", "reference": "User-provided sample"}
        record["license"] = "custom-consented"
        with self.assertRaises(MODULE.DatasetError):
            MODULE.validate_record(record, 1)


if __name__ == "__main__":
    unittest.main()
