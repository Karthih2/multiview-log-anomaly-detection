

BGL - Lig entry from a supercomputer (BlueGene/L at Lawrence Livermore National Laboratory)

| Field                        | Value                                      | Note                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Label**                    | `-`                                        | Missing → means `-` (normal). BGL rows for real alerts have an alert-type label as the first field instead of `-`. Your 6 sample lines are all normal (`-`) entries. |
| **Timestamp (unix)**         | `1117838570`                               | Seconds since epoch                                                                                                                                                  |
| **Date**                     | `2005.06.03`                               | Redundant with Time, kept for legacy format reasons                                                                                                                  |
| **Node**                     | `R02-M1-N0-C:J12-U11`                      | Which physical node emitted this                                                                                                                                     |
| **Time (full, with micros)** | `2005-06-03-15.42.50.363779`               | Real ordering key                                                                                                                                                    |
| **NodeRepeat**               | `R02-M1-N0-C:J12-U11`                      | Repeated node ID                                                                                                                                                     |
| **Type**                     | `RAS`                                      | Subsystem category                                                                                                                                                   |
| **Component**                | `KERNEL`                                   | Which component                                                                                                                                                      |
| **Level**                    | `INFO`                                     | Severity as logged by the system itself                                                                                                                              |
| **Content**                  | `instruction cache parity error corrected` | Free text → goes to Drain3                                                                                                                                           |


Total Columun: 10

Why parquet, not CSV, a quick note: at 4.7M rows, CSV is slow to read back and bloats file size since it re-stringifies every number/date on save and re-parses them on load. Parquet keeps your time column as a real datetime64 and timestamp as numeric


"~64% of templates are singletons, mostly high-entropy register dumps that resist template merging — expected, and mitigated by the multi-view design."