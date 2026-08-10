# Security and responsible disclosure

FusionDigital is a public research website. Do not report sensitive device, employee, partner or credential information through a public issue.

For security concerns, accidental secret exposure, access-control problems or sensitive fusion-device information, contact `tianshao1992@gmail.com` privately and include only the minimum information needed to reproduce the problem.

## Never commit

- API keys, Sites source credentials, cookies or personal access tokens
- internal-only URLs, credentials or unredacted operational logs
- restricted device parameters, experiment data, CAD or commercial solver models
- personal data that is not already approved for publication

If a secret is committed, removing the file in a later commit is not sufficient. Revoke or rotate the credential first, then coordinate history cleanup with the repository owner.

The website and its AI-native content are not safety-critical control software. Vulnerability reports should not assume that a research catalog has authority over a fusion device or plant system.
