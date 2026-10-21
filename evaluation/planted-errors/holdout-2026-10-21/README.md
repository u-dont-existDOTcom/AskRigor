# Held-out planted-error cases (VALIDATION only)

Six cases (four planted errors: a flattened table, a harms table, a supplement and a figure sent as an image; two
controls) written on 21 Oct 2026 before any result of the first set (`../2026-10-21/`) was read, so they carry none
of its failure modes. Use them once, to confirm a fix for tables, supplements or figures (owner answer 131c); never
open them while building or tuning one.

- `holdout.tar.gz.enc`: the cases, their answer key and the scripts that made them, AES-256-CBC (PBKDF2, 200,000
  iterations) under a random passphrase.
- `passfile.wrapped`: that passphrase, encrypted to `laptop-pub.pem` (RSA-OAEP, SHA-256). The matching private key is
  only on the owner's laptop, at `/home/joel/askrigor-releases/holdout-planted-20261021.key.pem`.
- `plaintext-manifest.sha256`: SHA-256 of every file inside, so their bytes can be checked after decryption.

To open on the laptop:

```bash
openssl pkeyutl -decrypt -inkey /home/joel/askrigor-releases/holdout-planted-20261021.key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in passfile.wrapped -out /tmp/holdout.pass
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:/tmp/holdout.pass -in holdout.tar.gz.enc | tar xzf -
rm /tmp/holdout.pass
```
