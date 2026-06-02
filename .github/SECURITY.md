# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability, please follow these steps:

1. **Do NOT** open a public issue
2. Email security details to: [security@ziprobot.dev] (or create a private security advisory on GitHub)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Report

Please report:
- Authentication or authorization bypasses
- Remote code execution vulnerabilities
- SQL injection or other injection attacks
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Sensitive data exposure
- API key or credential leaks
- Denial of service vulnerabilities

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity (typically 30-90 days)

## Security Best Practices

### For Users

1. **Keep dependencies updated**: Regularly run `npm audit` and update packages
2. **Protect API keys**: Never commit `.env` files or expose API keys
3. **Use HTTPS**: Always use HTTPS in production
4. **Rate limiting**: Be aware of rate limits on API endpoints
5. **Input validation**: Always validate user inputs

### For Developers

1. **Input Validation**: All inputs must be validated with Zod schemas
2. **URL Sanitization**: Reject unsafe protocols (e.g., `javascript:`, `data:`)
3. **Timeouts**: Set timeouts for all external API calls
4. **Rate Limiting**: Implement rate limiting on all API routes
5. **Audit Logging**: Log all tool executions for security auditing
6. **Permission Tiers**: Use appropriate permission tiers (READ/WRITE/ACT/ADMIN)
7. **No Client-Side Secrets**: Never expose API keys or secrets to client-side code
8. **SQL Injection Prevention**: Use parameterized queries (SQLite with better-sqlite3)
9. **XSS Prevention**: Sanitize user inputs and use React's built-in XSS protection
10. **CSRF Protection**: Use CSRF tokens for state-changing operations

### Security Features

The ZIP Robot project includes:

- ✅ **Input Validation**: Zod schemas for all inputs
- ✅ **Rate Limiting**: In-memory rate limiter (100 req/min per IP)
- ✅ **Permission System**: Tiered permission model (READ/WRITE/ACT/ADMIN)
- ✅ **Audit Logging**: All tool executions logged to `./data/audit.log`
- ✅ **Request Tracing**: Request-scoped tracing for debugging
- ✅ **URL Sanitization**: Protocol whitelist for URLs
- ✅ **Timeout Protection**: Timeouts on external API calls
- ✅ **Server-Side API Keys**: All OpenAI API calls are server-side

## Known Security Considerations

### Robot Control

- Robot control tools require ACT-tier permissions
- User confirmation required for physical actions
- Emergency stop functionality available

### 3D Printer Control

- Printer tools require ACT-tier permissions
- Network access to printer API (ensure printer is on secure network)
- Temperature and motion controls require confirmation

### Web Tools

- URL sanitization prevents unsafe protocols
- Timeouts prevent hanging requests
- Rate limiting prevents abuse

### Document Intelligence

- PDF parsing is sandboxed
- Vector search uses embeddings (no raw document storage)
- Document ingestion requires WRITE permission

## Security Updates

Security updates will be:
- Released as patch versions (e.g., 0.1.0 → 0.1.1)
- Documented in CHANGELOG.md
- Tagged with security labels in releases

## Disclosure Policy

- Vulnerabilities will be disclosed after a fix is available
- Credit will be given to reporters (if desired)
- CVEs will be assigned for significant vulnerabilities

---

**Last Updated**: 2025-01-18
