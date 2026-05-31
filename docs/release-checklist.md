# Release Checklist

Use this checklist before publishing a public release or tagging a milestone.

## Code quality

- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes or known exceptions are documented
- [ ] Calculation changes include tests
- [ ] API/schema changes are documented

## TRS/OEE calculation review

- [ ] Formula behavior is documented
- [ ] Edge cases are covered or explicitly deferred
- [ ] Rounding behavior is clear
- [ ] Demo examples use fictional values only
- [ ] Any impossible values are either rejected or documented as anomalies

## GMP and data-integrity review

- [ ] No real product names are included
- [ ] No real batch identifiers are included
- [ ] No supplier, employee, patient, or confidential site data is included
- [ ] Decision-support status is clear
- [ ] Validation limitations are documented
- [ ] AI-generated content is clearly marked as draft if present

## Documentation

- [ ] README reflects current capabilities
- [ ] Roadmap reflects current direction
- [ ] Changelog is updated
- [ ] Contributing guide still matches workflow
- [ ] Security policy contact path is still valid

## Release notes

Include:

- What changed
- Why it matters for production workflows
- Test or validation evidence
- Known limitations
- Next planned work

## Post-release

- [ ] Create or update GitHub issues for follow-up work
- [ ] Close completed issues with links to commits
- [ ] Add screenshots or demo notes when useful
- [ ] Keep public communication honest about GMP validation status
