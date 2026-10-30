# Severity-aware incident grouping

When the optional delayed Gemini image assessment raises a visual concern, that evidence leaves the derived incident until a responder accepts it after review. Its emergency score and status stay intact. Pending evidence cannot add corroboration votes. See [image-assessment.md](image-assessment.md).

A report remains an original Cloudinary asset with its own photo, status, location and audit history. An incident is a derived grouping of current reports; it does not delete or auto-verify evidence, require a new database, or change all member statuses together.

## Matching

An unflagged, located report with high/critical underlying severity can anchor an incident. The anchor stays fixed when supporting reports arrive. A new report joins only if it is within the current circle, within 12 hours of the anchor, and shares a primary hazard with the anchor's categories (or vice versa). Two unrelated primary hazards cannot join merely because both block a road.

Radius is a configurable-code heuristic based on the strongest active member's triage score, rounded to 25 metres:

| Score | Grouping radius |
| --- | --- |
| 45 (high) | 200 m |
| 58 (high) | 300 m |
| 70 (critical) | 400 m |
| 90 (critical) | 675 m |
| 100 (critical) | 800 m |

A stronger report admitted **inside the current circle** can expand it; a severe report outside cannot use its own severity to force admission. Lower-priority supporting reports can then join the expanded area. Reports match against the anchor rather than another member's position, preventing spatial chains. Overlapping groups use the nearest compatible anchor and deterministic tie breaking. Existing anchors are not automatically collapsed together.

When the strongest active member is resolved/rejected or otherwise no longer eligible, the radius shrinks to the remaining evidence. Members outside the smaller circle remain original standalone reports or belong to another eligible group. Unresolved critical evidence keeps priority high; quieter photos do not dilute it. Closing the anchor can yield another eligible anchor, and circles disappear when no severe anchor remains.

The circle is a **matching area**, not an estimated flood boundary, evacuation perimeter, or measure of physical damage. Public centres/locations are rounded; matching decisions use the original server-side coordinates first.

## Duplicate and review handling

Near-identical images within the current incident boundary/time can be linked as photo duplicates. They do not add independent corroboration votes or enlarge an incident. A previously seen image reported outside that area or time window is flagged for human review. Unlocated copies can be identified as the same image but cannot join a geographic incident. Pinning/moving rechecks the duplicate link; only a first location can add new corroboration votes.

## UI and updates

The homepage and situation/control-room maps display the same server-generated radius. Both poll every 5 seconds; status and pin edits also refresh the control room immediately. This is automatic polling, not a WebSocket service. Cloudinary Search indexing and the existing 10-second server cache can add delay across instances.

The queue groups incidents by default and uses the highest-priority original as the representative. A checkbox restores individual-report view. Selecting an incident lists its original evidence and fits the map to its circle. Status actions apply to the selected original report.

Groups are recalculated from the currently retrieved reports (the existing default list is 200 reports), so missing older evidence, edited locations, closed reports, and corrected severity can change group identities/membership. This avoids stale separately stored clusters but is not a replacement for a persistent, paginated incident service at larger scale. Existing per-report corroboration counters are not retroactively repaired when older evidence closes; current incident radii/group membership are recalculated from active evidence.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests cover geographic boundaries, hazard/time compatibility, overlap, no chaining, expansion/shrinkage, retained evidence, duplicate suppression, and the Cloudinary triage/status/pin pipeline with mocked external calls. Browser checks use synthetic API snapshots to verify radius changes without reloading, grouped and individual views, homepage circles, and mobile layout. Live Cloudinary credentials are required to validate a real upload against production services.
