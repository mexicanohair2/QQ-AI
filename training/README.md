# QQ AI training data

No training run is authorized or possible until a suitable compute environment is approved. This folder establishes the data contract for a future QQ-owned supervised fine-tuning dataset.

## JSONL record

Each line is one JSON object with:
- \`id\`: unique stable example ID.
- \`split\`: \`train\`, \`validation\`, or \`test\`.
- \`license\`: one of the validator's allow-listed licenses.
- \`source\`: \`kind\`, \`reference\`, and, for consented data, \`consent_reference\`.
- \`messages\`: chat messages with \`system\`, \`user\`, and \`assistant\` roles.
- \`tags\`: optional short task labels.

## Rules

- Prefer original QQ-authored examples and sources with explicit compatible licenses.
- Do not use private chats, personal uploads, QQ Knowledge, account data, or private game data as training material by default.
- Do not include secrets, personal contact details, private identifiers, or sensitive personal information.
- Keep train/validation/test splits separate and remove duplicates across all splits.
- Preserve source and license provenance. A validator cannot prove that a license is valid; a human must review each source.
- Do not put model weights or large datasets in the Git repository.

## Validate

Run:
\`\`\`bash
python3 training/validate_sft_dataset.py --self-test
python3 training/validate_sft_dataset.py path/to/qq-ai-training.jsonl
\`\`\`

The validator checks JSONL structure, provenance metadata, allowed license labels, duplicate records, basic secret/contact patterns, and split names. These checks are only a safety filter, not legal review or a guarantee that all personal data has been removed.
