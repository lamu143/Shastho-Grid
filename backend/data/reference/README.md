# Reference data provenance

## WHO AWaRe antibiotic classification, 2025

`who_aware_2025.csv` is a local CSV extraction of the WHO workbook, “The
selection and use of essential medicines, 2025: WHO AWaRe (Access, Watch,
Reserve) classification of antibiotics for evaluation and monitoring of use”
(WHO reference B09489). Downloaded 26 November 2026 from the WHO publication
page: <https://www.who.int/southeastasia/publications/i/item/B09489>.

The CSV contains the antibiotic name, class, ATC code, AWaRe category, whether
it appears on the 2025 WHO Model List of Essential Medicines, and source notes.
It is a stewardship classification reference. It does not establish Bangladesh
registration, a locally marketed formulation, a patient-specific prescription,
or local stock availability. The WHO publication itself says AWaRe is not a
model for national essential-medicines-list inclusion.

## Bangladesh national antimicrobial treatment guidance

The Department of Health Services (DGHS), Ministry of Health and Family
Welfare publishes the *Standard Treatment Guidelines (STG) on Antibiotic Use in
Common Infectious Diseases of Bangladesh*, version 1.0, dated 1 December 2021:
<https://dghs.gov.bd/pages/static-pages/6922de08933eb65569e17b27>.

The existing `backend/app/db/seed.py` treatment rules are application seed
content; they have not been reconciled line-by-line with that national STG.
They must not be presented as a fully implemented or current copy of the
national guidance without clinical review and a versioned mapping.

## Bangladesh facility directory

The DGHS Facility Registry is the public source for facility identifiers,
names, facility types, ownership, and administrative locations:
<https://hrm.dghs.gov.bd/public/facility-registry>.
The four coordinates marked verified in the demo facility directory were
refreshed from the DGHS profiles for [Dhaka Medical College Hospital](https://hrm.dghs.gov.bd/public/facility-registry/facilities/31/profile?tab=detailed-information),
[Mugda Medical College Hospital](https://hrm.dghs.gov.bd/public/facility-registry/facilities/13562/profile?tab=detailed-information),
[National Institute of Neuro Sciences & Hospital](https://hrm.dghs.gov.bd/public/facility-registry/facilities/16775/profile?tab=detailed-information),
and [Kurmitola Multicare Specialized Hospital](https://hrm.dghs.gov.bd/public/facility-registry/facilities/16774/profile?tab=detailed-information), checked 26 November 2026.
The public directory does not provide verified live ICU/ventilator counts,
blood-unit availability, or pharmacy inventory. Those values must come from
authorized facility feeds or staff updates with timestamps; the CareMatch
values in `backend/app/db/seed_critical_care.py` are demo-only.

## Data that must come from authorized operational systems

Do not scrape or fabricate patient records, user identities, prescriptions,
pharmacy lots, or current hospital/blood-bank capacity. Patient and encounter
data require authorized access and the relevant consent and governance process.
Live facility resources and medicine inventory require an authorized API or
verified staff updates. Until those feeds are configured, seeded records and
availability figures must remain clearly identified as simulated demo data.
