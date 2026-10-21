"""Check package/source identity, without trusting the dashboard or running Pump code."""
import hashlib, json
from pathlib import Path
root=Path(__file__).resolve().parents[3]
manifest=json.loads(Path(__file__).with_name('manifest.json').read_text())
for relative,expected in manifest['sha256'].items():
    actual=hashlib.sha256((root/relative).read_bytes()).hexdigest()
    if actual!=expected:
        raise SystemExit(f'DIGEST MISMATCH: {relative}')
print(f"Verified {len(manifest['sha256'])} source/artifact digests. This establishes file identity, not source truth or execution attestation.")
