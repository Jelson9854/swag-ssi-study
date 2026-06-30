# SWAG Student Activity Report by Email Domain

**Database snapshot:** May 11, 2026, 4:52 PM ET  
**Groups compared:** `gmu.edu` and `vt.edu` students  
**Cohort definition:** sessions with `student_sessions.started_at` on or after April 29, 2026  
**Primary unit of analysis:** unique student email within the cohort, unless otherwise noted  
**Submission length method:** latest submission per session, extracting BlockNote `text` fields and counting whitespace-delimited words

## Summary

This report focuses only on students whose sessions started on or after April 29, 2026. Under this cohort definition, there were 99 students/sessions across GMU and VT. GMU represents the larger group, while both domains show high signup completion and submission rates.

| Domain | Unique Students | Started Sessions | Signed-up Students | Students Submitted | Submission Rate |
|---|---:|---:|---:|---:|---:|
| `gmu.edu` | 72 | 72 | 72 | 70 | 97.2% |
| `vt.edu` | 27 | 27 | 27 | 26 | 96.3% |

Both domains had a 100% signup completion rate among sessions in this cohort. In this filtered cohort, unique students and sessions are equal for both domains.

## Session Start Distribution

| Session Start Date | GMU Sessions | VT Sessions | Total Sessions |
|---|---:|---:|---:|
| 2026-04-29 | 1 | 0 | 1 |
| 2026-04-30 | 9 | 6 | 15 |
| 2026-05-01 | 5 | 3 | 8 |
| 2026-05-02 | 5 | 6 | 11 |
| 2026-05-03 | 10 | 2 | 12 |
| 2026-05-04 | 26 | 7 | 33 |
| 2026-05-05 | 16 | 3 | 19 |

The largest session-start day was May 4, 2026, with 33 total sessions. GMU accounted for most of that peak, with 26 sessions on that date.

## Assignment Coverage

| Domain | Assignments Represented | Avg. Students per Assignment | Largest Assignment |
|---|---:|---:|---:|
| `gmu.edu` | 2 | 36.0 | 37 |
| `vt.edu` | 1 | 27.0 | 27 |

GMU activity spans two assignments in this cohort, while VT activity comes from one assignment.

## Chat Usage

| Domain | User Chat Messages | Assistant Messages | Students Using Chat | Avg. User Messages per Student | Median | Max |
|---|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 375 | 375 | 65 / 72, 90.3% | 5.21 | 3 | 32 |
| `vt.edu` | 123 | 123 | 20 / 27, 74.1% | 4.56 | 3 | 19 |

GMU students were more likely to use chat at least once. Median chat use is the same across domains, but GMU has a slightly higher average and more total chat volume because of its larger cohort.

| Domain | 0 Messages | 1-3 Messages | 4-10 Messages | 11+ Messages | P75 | P90 |
|---|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 7 | 30 | 26 | 9 | 6 | 11 |
| `vt.edu` | 7 | 8 | 8 | 4 | 6 | 11.8 |

Most students used chat lightly or moderately. A smaller subset in each domain used chat heavily.

## Submission Behavior

| Domain | Submitted Sessions | Submission Events | Sessions with Resubmission | Median Time to First Submission | Avg. Time to First Submission | P75 Time |
|---|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 70 | 74 | 4 | 31.1 min | 78.5 min | 68.4 min |
| `vt.edu` | 26 | 31 | 4 | 44.0 min | 534.7 min | 182.8 min |

VT's average time to first submission is strongly affected by delayed submissions. Three VT sessions submitted more than 24 hours after starting, with the longest delay around 94.6 hours. The median is therefore a better measure for comparing typical behavior.

| Domain | Min Hours | Median Hours | P90 Hours | Max Hours | Sessions Over 12h | Sessions Over 24h |
|---|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 0.04 | 0.52 | 3.89 | 11.85 | 0 | 0 |
| `vt.edu` | 0.10 | 0.73 | 27.72 | 94.57 | 3 | 3 |

## Submission Length

Submission length is measurable because each submission stores the BlockNote document JSON. The table below uses the latest submission in each submitted session.

| Domain | Latest Submitted Sessions | Total Latest Submission Words | Avg. Words | Median Words | P25 | P75 | Min | Max | Total Characters |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 70 | 64,308 | 918.7 | 849 | 718.5 | 1,071 | 172 | 2,700 | 370,200 |
| `vt.edu` | 26 | 27,728 | 1,066.5 | 862 | 570 | 1,421.5 | 356 | 2,468 | 161,946 |

VT submissions are longer on average, though median lengths are close: 862 words for VT and 849 words for GMU. VT also has a higher upper quartile, suggesting more variation in final submission length.

Including all submission events, not just the latest submission per session:

| Domain | All Submission Events | Total Words Across Submission Events | Avg. Words per Submission Event |
|---|---:|---:|---:|
| `gmu.edu` | 74 | 68,622 | 927.3 |
| `vt.edu` | 31 | 34,532 | 1,113.9 |

## Editing and Paste Activity

| Domain | Avg. Typing Ops per Student | Median Typing Ops | Avg. Snapshots per Student | Students with External Paste | External Paste Events | Students with Internal Paste |
|---|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 2,871.5 | 2,753.5 | 96.8 | 27 / 72, 37.5% | 104 | 58 |
| `vt.edu` | 3,867.4 | 2,856.0 | 106.7 | 9 / 27, 33.3% | 28 | 20 |

External paste activity occurred in about one-third of students in both groups. VT shows higher average typing operations per student, while GMU has more total paste activity because of its larger sample.

## Internal Paste Activity

Internal paste refers to paste events detected as coming from within the SWAG environment, such as chat, editor text, or assignment instructions.

| Domain | Internal Paste Events | Students with Internal Paste | Percent of Students | Avg. Events per Student | Median Events | Max Events by One Student | Internal Paste Words |
|---|---:|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 412 | 58 / 72 | 80.6% | 5.72 | 3 | 48 | 47,199 |
| `vt.edu` | 137 | 20 / 27 | 74.1% | 5.07 | 2 | 23 | 16,996 |

Internal paste behavior is common in both domains. GMU has a slightly higher internal paste participation rate and median, but the broad pattern is similar across groups.

The most common internal paste flows were:

| Domain | Source -> Target | Match Method | Events |
|---|---|---|---:|
| `gmu.edu` | chat -> editor | copy buffer | 176 |
| `gmu.edu` | editor -> chat | copy buffer | 125 |
| `gmu.edu` | instruction -> chat | copy buffer | 61 |
| `vt.edu` | chat -> editor | copy buffer | 41 |
| `vt.edu` | editor -> chat | copy buffer | 40 |
| `vt.edu` | instruction -> chat | copy buffer | 26 |

The dominant pattern in both domains is moving content from chat into the editor, followed by moving editor text into chat. This suggests an iterative writing workflow where students move between drafting and prompting.

## Key Takeaways

- The April 29-and-later cohort includes 72 GMU students and 27 VT students.
- Both domains had 100% signup completion and submission rates above 96%.
- GMU had higher chat participation, while median chat volume was the same across domains.
- VT latest submissions were longer on average, but median submission lengths were similar.
- VT time-to-submission averages were distorted by a few long-delay sessions.
- Internal paste was common in both groups, especially chat-to-editor and editor-to-chat movement.
