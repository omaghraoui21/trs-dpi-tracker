# TRS/OEE Calculation Test Strategy

This document defines the first maintainer-facing test strategy for the TRS/OEE calculation engine.

The goal is to make the calculation logic transparent, reviewable, and safe for open-source contribution.

## Scope

The tests should cover calculation behavior only. They should not require real production data, real product names, real batch numbers, or site-specific master data.

Use fictional values only.

## Core formulas

```text
required_time = opening_time - planned_stop_time
operating_time = required_time - unplanned_downtime
availability = operating_time / required_time

theoretical_output = operating_time_hours * standard_cadence_per_hour
performance = produced_quantity / theoretical_output

quality = conforming_quantity / produced_quantity

trs_oee = availability * performance * quality
```

## Invariants

The calculation engine should protect these invariants:

- Required time cannot be negative.
- Operating time cannot be negative.
- Conforming quantity cannot exceed produced quantity.
- Produced quantity cannot be negative.
- Standard cadence must be greater than zero when performance is calculated.
- Display rounding must happen after calculation, not during intermediate steps.
- Percentages should be bounded or explicitly flagged when input data creates impossible values.

## Normal cases

Create tests for:

1. Perfect run: no downtime, produced quantity equals theoretical output, all units conforming.
2. Availability loss: downtime reduces operating time.
3. Performance loss: produced quantity is lower than theoretical output.
4. Quality loss: conforming quantity is lower than produced quantity.
5. Mixed losses: availability, performance, and quality all contribute to the final TRS/OEE.

## Boundary cases

Create tests for:

- Opening time equals planned stop time.
- Required time is zero.
- Unplanned downtime equals required time.
- Produced quantity is zero.
- Conforming quantity is zero.
- Very small decimal cadence or duration values.

## Invalid input cases

The engine should reject or explicitly flag:

- Negative opening time
- Negative planned stop time
- Negative downtime
- Negative produced quantity
- Negative conforming quantity
- Conforming quantity greater than produced quantity
- Standard cadence equal to zero or less
- Planned stops greater than opening time
- Downtime greater than required time

## Rounding expectation

Internal calculations should keep full precision. UI display can round to one or two decimals.

Recommended display:

```text
Availability: 88.46%
Performance: 95.65%
Quality: 98.00%
TRS/OEE: 82.91%
```

## GMP and data-integrity assumptions

These tests prove calculation behavior for open-source development only. They do not validate the system for regulated use.

A regulated deployment would require:

- Approved user requirements
- Controlled formula definitions
- Validation scripts and evidence
- Audit trail review
- Access control review
- QA approval
- Change control

## Suggested first test file

A future implementation can start with a file such as:

```text
packages/engine/src/trs.test.ts
```

The tests should use fictional examples from `demo-data/fictional-trs-oee-sample.csv` and the worked example in `docs/trs-calculation-examples.md`.
