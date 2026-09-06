# External-proof regression fixture

`record.json` and `record.json.ots` are fixed test bytes for the external-proof verifier. Their source was a public Clawprint verification experiment when this fixture was added, but CI reads only these checked-in files.

- `record.json`: 573 bytes
- SHA-256: `fbe3c656e8ffc887b321e424fb05770562a6251413c990648b2fbad46f6ebb95`
- `record.json.ots`: 1,652 bytes

The unit tests use the exact record and receipt, then separately mutate one byte of a covered file. A mismatch must be reported as `invalid` and must not return a Bitcoin attestation.

This fixture tests byte/proof behavior only. It does not establish authorship, truth, legal validity, or preservation of assets outside these two files.
