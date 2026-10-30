# Reporting under pressure

The primary reporting path is **add a photo → send**. There is no required description, hazard choice or GPS fix. Native camera/file selection may involve additional device controls. The homepage, mobile navigation and a bottom action bar provide direct access to reporting; the homepage still opens its live map automatically.

The phone reporting screen keeps Send report and Call 112 within reach. The call action opens the device's dialler only when selected. Taking or choosing a photo does not file it automatically: the citizen still explicitly sends or saves the report. Optional one-tap flood, fire, injured/trapped and blocked-road descriptions can be selected without typing. The extra-details section retains a landmark field, free text, GPS retry and manual map pinning.

Location is requested in the background, with an eight-second timeout. A denied or outstanding request never blocks sending. A user can skip location or manually pin it; late GPS callbacks do not overwrite that choice. A report sent before a location is available remains unlocated for control-room follow-up.

When offline, the action says Save report on this phone. The existing IndexedDB outbox retains the photo, chosen descriptions and location, and sends when the connection returns while the app is open or reopened. The screen distinguishes saved locally from received by the server. Server upload errors remain visible and can be retried; they are not presented as offline success. A submission guard prevents repeated taps from filing twice, and a completed upload is reused during offline delivery retries.

The existing initial triage, incident grouping and delayed Gemini assessment remain in place. Simplifying the form does not turn a citizen report or a model assessment into a verified emergency or a guarantee of dispatch. Call 112 remains available for immediate danger.

Local Chromium validation covers photo-only reporting, denied/pending GPS, optional hazard buttons and details, late GPS after skipping, offline save/reconnect, upload errors, repeated taps, the automatic homepage map, translated mobile screens and the delayed assessment/acceptance flow. External upload and model responses are fixtures; live credentials are required for real end-to-end service verification.
