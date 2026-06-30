# SWAG Student Activity Report by Email Domain

**Database snapshot:** May 5, 2026, 9:21 AM ET  
**Groups compared:** `gmu.edu` and `vt.edu` students  
**Primary unit of analysis:** unique student email  
**Submission length method:** latest submission per session, extracting BlockNote text fields and counting whitespace-delimited words

## Summary

Students from both domains completed signup at a very high rate and submitted at rates above 90%. GMU has the larger sample, higher chat participation, and a slightly higher submission rate. VT has fewer students, a larger share of non-chat users, and a few delayed submissions that strongly increase the average time to first submission.

| Domain | Signed-up Students | Started Sessions | Students Submitted | Submission Rate |
|---|---:|---:|---:|---:|
| `gmu.edu` | 71 | 72 | 69 | 97.2% |
| `vt.edu` | 28 | 29 | 26 | 92.9% |

Both domains had a 100% signup completion rate among students who started sessions. Each domain has one more session than unique students, indicating a small amount of multi-session or multi-assignment participation.

## Chat Usage

| Domain | User Chat Messages | Students Using Chat | Avg. User Messages per Student | Median | Max |
|---|---:|---:|---:|---:|---:|
| `gmu.edu` | 362 | 65 / 71, 91.5% | 5.10 | 3 | 32 |
| `vt.edu` | 140 | 21 / 28, 75.0% | 5.00 | 3 | 19 |

Average chat volume is nearly identical across domains. The main difference is participation: GMU students were more likely to use chat at least once. Among students who did use chat, VT students were slightly more active on average.

| Domain | 0 Messages | 1-3 Messages | 4-10 Messages | 11+ Messages |
|---|---:|---:|---:|---:|
| `gmu.edu` | 6 | 30 | 27 | 8 |
| `vt.edu` | 7 | 8 | 8 | 5 |

## Submission Behavior

| Domain | Submitted Sessions | Submission Events | Sessions with Resubmission | Median Time to First Submission | Avg. Time to First Submission |
|---|---:|---:|---:|---:|---:|
| `gmu.edu` | 69 | 73 | 4 | 31.0 min | 78.1 min |
| `vt.edu` | 26 | 31 | 4 | 64.6 min | 536.3 min |

VT's average time to first submission is inflated by outliers. Three VT sessions submitted more than 24 hours after starting, with the longest delay around 94.6 hours. The median is therefore the better comparison point.

## Submission Length

Submission length is measurable because each submission stores the BlockNote document JSON. The table below uses the latest submission in each submitted session.

| Domain | Latest Submitted Sessions | Total Latest Submission Words | Avg. Words | Median Words | P25 | P75 | Min | Max | Total Characters |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 69 | 61,416 | 890.1 | 832 | 718 | 1,068 | 172 | 2,594 | 354,493 |
| `vt.edu` | 26 | 27,198 | 1,046.1 | 846 | 570 | 1,387 | 356 | 2,468 | 160,190 |

VT submissions are longer on average, although the medians are closer: 846 words for VT vs. 832 words for GMU. The upper quartile is also higher for VT, suggesting more variation and a larger long-submission tail.

Including all submission events, not just the latest submission per session:

| Domain | All Submission Events | Total Words Across Submission Events | Avg. Words per Submission Event |
|---|---:|---:|---:|
| `gmu.edu` | 73 | 65,730 | 900.4 |
| `vt.edu` | 31 | 34,002 | 1,096.8 |

## Editing and Paste Activity

| Domain | Avg. Typing Ops per Student | Median Typing Ops | Students with External Paste | External Paste Events | Students with Internal Paste |
|---|---:|---:|---:|---:|---:|
| `gmu.edu` | 2,752.5 | 2,670.0 | 27, 38.0% | 106 | 58 |
| `vt.edu` | 3,498.9 | 1,955.5 | 9, 32.1% | 27 | 22 |

External paste activity occurred in both groups at broadly similar rates, affecting about one-third of students.

## Internal Paste Activity

Internal paste refers to paste events detected as coming from within the SWAG environment, such as chat, editor text, or assignment instructions.

| Domain | Internal Paste Events | Students with Internal Paste | Percent of Students | Avg. Events per Student | Median Events | Max Events by One Student | Internal Paste Words |
|---|---:|---:|---:|---:|---:|---:|---:|
| `gmu.edu` | 404 | 58 / 71 | 81.7% | 5.69 | 3 | 48 | 45,976 |
| `vt.edu` | 153 | 22 / 28 | 78.6% | 5.46 | 3 | 23 | 18,473 |

Internal paste behavior is common in both groups. The per-student average and median are very similar, suggesting that domain-level differences are mostly due to sample size rather than fundamentally different internal paste behavior.

The most common internal paste flows were:

| Domain | Source -> Target | Match Method | Events |
|---|---|---|---:|
| `gmu.edu` | chat -> editor | copy buffer | 171 |
| `gmu.edu` | editor -> chat | copy buffer | 120 |
| `gmu.edu` | instruction -> chat | copy buffer | 61 |
| `vt.edu` | chat -> editor | copy buffer | 47 |
| `vt.edu` | editor -> chat | copy buffer | 41 |
| `vt.edu` | instruction -> chat | copy buffer | 26 |

The dominant pattern in both domains is moving content from chat into the editor, followed by moving editor text into chat. This is consistent with students using the assistant as part of an iterative writing workflow.

## Key Takeaways

- GMU has more students and a slightly higher submission rate.
- GMU students are more likely to use chat at least once.
- Average chat volume per student is almost identical across domains.
- VT latest submissions are longer on average, but the medians are close.
- VT time-to-submission averages are distorted by a few long-delay sessions.
- Internal paste is common in both domains, with similar per-student averages and medians.
- The most frequent internal paste flow is chat-to-editor, suggesting that students often transfer assistant output into their drafts.
