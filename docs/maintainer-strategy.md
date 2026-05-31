# Maintainer Strategy

DPI TRS Tracker is part of a broader open-source effort to build practical software for pharmaceutical manufacturing operations.

## Maintainer background

The project is maintained by Omar Maghraoui, a pharmacist, pharmaceutical production manager, and AI-assisted software builder.

This combination matters because the project is not starting from an abstract software idea. It starts from real operational questions that production teams face every day:

- Where are we losing time?
- Which line, shift, product, or batch is driving the loss?
- Is the issue availability, performance, quality, or planning?
- What should be reviewed in the daily meeting?
- What needs QA, maintenance, or operational excellence follow-up?

## Why open source for pharma operations

Many pharmaceutical production teams rely on spreadsheets, paper records, and disconnected tools for daily performance review. Enterprise manufacturing systems can be expensive, slow to adapt, and difficult for small teams to experiment with.

Open source can help by providing:

- Transparent TRS/OEE formulas
- Reusable production workflow examples
- Safe fictional demo data
- Contributor-reviewed calculation logic
- Documentation that production and software teams can both understand
- A learning space for people crossing from operations into software engineering

## Project family direction

This repository focuses on TRS/OEE tracking and production performance.

Related project directions include:

- Batch tracking workflows
- Shift handover support
- GMP workflow checklists
- Downtime and quality-loss analytics
- AI-assisted draft production summaries
- Open-source industrial reporting tools

Supporting repositories in the same public GitHub profile include:

- `batchtracker-gmp` for batch tracking workflow experiments
- `pharmatrack-performance-hub` for performance dashboard direction
- `trs-compteur` for continuous TRS counter concepts

## Contribution priorities

The highest-value contributions are:

1. Tests for calculation logic and edge cases
2. Documentation that makes formulas easy to audit
3. Safe fictional datasets for demos and screenshots
4. UI improvements for operator and supervisor workflows
5. API validation improvements
6. Deployment documentation
7. GMP/data-integrity review notes

## How AI and Codex can support maintenance

AI assistance should improve maintainability, not replace human review.

Useful Codex/OpenAI-assisted workflows include:

- Drafting tests from documented calculation rules
- Reviewing code for edge cases and maintainability
- Drafting release notes
- Improving documentation clarity
- Summarizing issues for maintainer triage
- Generating fictional demo data
- Drafting production-review text from demo data

AI-generated operational or GMP-related content must remain draft decision support until reviewed by authorized people.

## Responsible GMP boundaries

This project is not validated GMP software by default.

The public repository must avoid:

- Real batch identifiers
- Real product names
- Real supplier names
- Employee names
- Patient data
- Confidential production data
- Site-specific release decisions

Regulated use would require site-specific validation, QA approval, access control, audit trail review, controlled master data, training, and change control.

## Near-term maintainer commitments

The near-term commitment is to keep the project visibly maintained by:

- Keeping issues public and actionable
- Closing issues with traceable commits
- Adding tests before expanding calculation behavior
- Keeping documentation aligned with code
- Using fictional demo data only
- Making small, understandable releases

This is a long-term learning and open-source building effort from a real pharmaceutical production background.
