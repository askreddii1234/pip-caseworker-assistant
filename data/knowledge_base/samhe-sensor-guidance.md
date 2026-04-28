---
doc_id: samhe-sensor
title: SAMHE — Reading classroom air quality sensor data
publisher: Schools' Air Quality Monitoring for Health and Education (SAMHE)
year: 2024
url: https://samhe.org.uk
applies_to: [air_quality_concern]
---

## What the sensor measures

A SAMHE-style classroom monitor reports six core measurements at minute or
sub-minute resolution:

- **CO2 (ppm)** — proxy for ventilation rate vs. occupant load
- **PM2.5 (µg/m³)** — fine particulate
- **PM10 (µg/m³)** — coarse particulate
- **TVOC (µg/m³)** — total volatile organic compounds (cleaning products,
  markers, furniture off-gassing)
- **Temperature (°C)**
- **Relative humidity (%)**

Some deployments add NO2 (where roadside infiltration is plausible) and
formaldehyde (where new furniture has been installed in the last 12 months).

## Reading the daily trace

A typical occupied classroom shows:

- A baseline overnight (CO2 ~400–500 ppm, low PM2.5)
- A morning rise as pupils arrive and the room fills
- Sustained elevated CO2 through the morning, with a partial drop at break
- A second rise after break, dropping at lunchtime when the room empties
- Return to baseline after the school day ends

Departures from this pattern that warrant investigation:

| Pattern | Likely cause |
|---------|-------------|
| CO2 rises and stays high all day, never dropping at break | Room not vented at break (windows kept closed) |
| CO2 elevated overnight or at weekends | Sensor in unoccupied space affected by adjacent room, or sensor fault |
| PM2.5 spike mid-morning during occupied period | Cleaning activity, craft activity, outdoor source (BBQ, fire) |
| TVOC spike following a period of closure | Off-gassing from materials or recent cleaning |
| Sustained TVOC above 500 µg/m³ | Investigate — solvent, marker, adhesive, off-gassing |

## Certainty of the reading

Sensor readings carry uncertainty. Factors that reduce confidence:

- **Sensor age** — calibration drift after 24 months
- **Building condition** — older buildings (pre-1965) often have draughts
  that distort low-CO2 readings near windows
- **Position** — too close to an opening window, radiator, or pupil
  workstation
- **Out-of-session data** — readings during holidays do not reflect the
  occupied case

A monitor in a building rated condition A (post-2010, well maintained) and
in-session can be considered **High** certainty. Buildings rated C/D
(1965–2000, partial maintenance) and out-of-session readings should be
considered **Low** certainty without corroborating evidence.

## Cross-referencing reports with sensor data

When a parent or staff member reports a symptom or smell, the most useful
sensor analysis is:

1. Look at the **same room** during the **time window** of the report
2. Compare against the same room's typical pattern over the previous 30 days
3. Compare against another room in the same school during the same window
4. Identify which measure (CO2, PM2.5, TVOC, etc.) corresponds to the
   reported symptom

A report of "stuffy / can't concentrate" with a corresponding CO2 spike is
strong corroboration. A report of "chemical smell" with a TVOC spike is
strong corroboration. A report with no measurable sensor signal still
warrants investigation — many irritants (e.g. very low VOC concentrations
detectable by smell) sit below sensor thresholds.

## When to escalate to the local authority

Persistent exceedance of any of the following thresholds across more than
two consecutive school weeks warrants notification to the local authority:

- CO2 daily average >1500 ppm
- PM2.5 24-hour mean >15 µg/m³
- NO2 daily mean >40 µg/m³
- TVOC sustained >500 µg/m³ during occupied periods
- Recurring complaints from the same room (3+ in 12 months)

The local authority public health team and education estates team should
both be notified.
