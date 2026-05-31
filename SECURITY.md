# Security Policy

DPI TRS Tracker is open-source decision-support software for pharmaceutical manufacturing performance tracking.

## Supported scope

Security reports may concern:

- Authentication and session handling
- Access control and role boundaries
- API validation
- Audit and event logging behavior
- Data exposure risks
- Dependency vulnerabilities
- Unsafe handling of uploaded or imported files
- Risks that could expose confidential production data

## Responsible disclosure

Please do not open a public issue for vulnerabilities that could expose sensitive data or compromise a deployment.

Use a private contact channel when available. Until a project domain is configured, contact the maintainer through the GitHub profile or repository discussion path.

When reporting, include:

- A short summary
- Affected area or file path
- Reproduction steps
- Expected impact
- Suggested fix if known

## Sensitive data rule

Do not include real pharmaceutical production data in reports, issues, commits, screenshots, or demo files.

Avoid sharing:

- Real batch identifiers
- Real product names
- Supplier names
- Employee names
- Patient data
- Confidential production metrics
- Site-specific quality decisions

Use fictional examples instead.

## GMP and validation note

This project is not validated GMP software by default. Security fixes may improve the open-source project, but regulated use still requires site-specific validation, QA approval, access control review, audit trail review, and formal change control.

## Maintainer response goal

The maintainer will aim to acknowledge security reports, triage severity, and document the resolution path when appropriate. Response timing may vary because this is an early open-source project maintained alongside production-management responsibilities.
