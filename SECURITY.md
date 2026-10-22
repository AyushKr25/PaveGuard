# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly:

### Private Disclosure

**DO NOT** create a public issue for security vulnerabilities.

Instead, please email: **security@smartpothole.ai**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will:
- Acknowledge receipt within 48 hours
- Provide timeline for fix
- Credit you in the security advisory (if desired)

## Security Measures

### Authentication & Authorization
- Supabase Auth with JWT tokens
- Row Level Security (RLS) on all tables
- Role-based access control (USER/ADMIN)
- Automatic token refresh
- Secure password reset flow

### Data Protection
- HTTPS enforced everywhere (Vercel + Supabase)
- Signed URLs for private storage access
- Input validation on all endpoints
- File upload validation (type, size, MIME)
- No sensitive data in client bundle

### API Security
- CORS configured for specific origins
- API secret for AI service endpoints
- Rate limiting (planned)
- Request size limits
- Structured error responses (no stack traces)

### Infrastructure
- Non-root Docker containers
- Health/readiness probes
- Secrets management via environment variables
- Regular dependency updates

## Known Limitations

### Current
- Rate limiting not yet implemented on AI service
- No WAF in front of AI service
- Demo mode may expose mock detection logic

### Planned
- API rate limiting per user
- Request/response logging for audit
- Automated security scanning in CI
- Dependency vulnerability scanning

## Best Practices for Users

1. **Use strong passwords** and enable 2FA when available
2. **Keep API secrets secure** - never commit to git
3. **Use HTTPS** - never expose services over HTTP
4. **Review permissions** - only grant necessary access
5. **Monitor usage** - check for unusual activity
6. **Update regularly** - pull latest security patches

## Compliance

- GDPR: Data export/deletion endpoints available
- Data minimization: Only collect necessary data
- Privacy by design: Camera/location require explicit consent
- No tracking cookies by default

## Security Contacts

- **Security Team**: security@smartpothole.ai
- **Maintainers**: maintainers@smartpothole.ai
- **PGP Key**: Available on request

## Acknowledgments

We thank the security researchers who help keep SmartPothole AI secure.

---

*Last updated: 2024-01-01*
*Policy version: 1.0*