# Security Policy

The **MediVault AI — Offline Clinical Intelligence Platform** blueprint does not include
production-grade security controls.

This repository is not secure by default and must not be used in production
without a comprehensive security review.

## Known Considerations

- **Flowise API key**: `FLOWISE_API_KEY` is loaded from `.env`.
  Never commit `.env` to version control. Leave blank only in local development.
- **Flowise authentication**: `FLOWISE_USERNAME` and `FLOWISE_PASSWORD` default to
  `admin` / `changeme`. Change these before any non-local deployment.
- **CORS**: The FastAPI backend defaults to permissive CORS in development. Restrict
  allowed origins in any non-local deployment.
- **ChromaDB exposure**: ChromaDB is exposed on host port `8100` with no authentication.
  Do not expose this port outside a trusted local network.
- **Ollama exposure**: Ollama runs on the host at port `11434` with no authentication.
  Restrict access at the network level in any shared or production environment.
- **Real patient data**: Never use real patient data in development, staging, or
  demonstration environments without full regulatory compliance measures in place.

## User Responsibilities

Users are responsible for implementing appropriate:

- Authentication and authorization mechanisms for the UI and API
- TLS termination via a reverse proxy for any non-localhost deployment
- Network-level access controls and firewall rules
- Encryption and secure data storage for any persisted clinical data
- Monitoring, logging, and auditing
- HIPAA, GDPR, and regulatory compliance safeguards relevant to their deployment environment

## Reporting a Vulnerability

If you discover a security vulnerability in this blueprint, please report it
privately to the Cloud2 Labs maintainers rather than opening a public issue.
