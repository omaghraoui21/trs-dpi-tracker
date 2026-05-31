# TRS/OEE Calculation Examples

This page documents fictional examples for understanding TRS/OEE calculations in a pharmaceutical manufacturing context.

No real product, batch, supplier, employee, or site data is used.

## Core terms

- Opening time: total observed production window.
- Planned stops: planned events such as cleaning, line clearance, planned break, or planned changeover.
- Required time: opening time minus planned stops.
- Operating time: required time minus unplanned downtime.
- Theoretical output: what the line should produce at standard cadence during operating time.
- Good output: conforming units accepted for the calculation.

## Example 1: Lot-level calculation

Fictional input:

| Field | Value |
|---|---:|
| Opening time | 480 min |
| Planned stops | 90 min |
| Required time | 390 min |
| Unplanned downtime | 45 min |
| Operating time | 345 min |
| Standard cadence | 1,000 units/hour |
| Produced quantity | 5,500 units |
| Conforming quantity | 5,390 units |

Calculation:

```text
Availability = operating time / required time
Availability = 345 / 390 = 88.46%

Theoretical output during operating time = 345 / 60 * 1,000 = 5,750 units
Performance = produced quantity / theoretical output
Performance = 5,500 / 5,750 = 95.65%

Quality = conforming quantity / produced quantity
Quality = 5,390 / 5,500 = 98.00%

TRS/OEE = Availability x Performance x Quality
TRS/OEE = 88.46% x 95.65% x 98.00% = 82.91%
```

## Example 2: Daily review interpretation

If the day result is 82.91%, the daily review should not stop at the final percentage. The useful operational review asks:

- Was the largest loss availability, performance, or quality?
- Which downtime category explains the biggest loss?
- Was the loss linked to one batch, one product, one line, or one shift?
- Is a deviation, maintenance action, or improvement action required by site procedure?

## Rounding rule

Display percentages with one or two decimals in the UI, but keep internal calculations unrounded until the final display step.

## GMP note

This calculation documentation is decision support only. Regulated use requires approved site procedures, validated calculations, controlled master data, access control, audit trails, and QA-approved review rules.
