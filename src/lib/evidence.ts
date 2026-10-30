// Evidence helpers shared by the case page: file fingerprints and the complaint and
// takedown texts. Pure functions (except sha256File), so they are easy to test.

export interface EvidenceFile {
  role: "fake" | "original" | "chat";
  name: string;
  bytes: number;
  type: string;
  sha256: string;
  addedAt: string; // ISO time the file was added on this device
}

export interface CaseDetails {
  platform: string;
  whereUrl: string;
  suspect: string;
  firstContact: string; // yyyy-mm-dd
  demand: string;
  originalPostUrl: string;
  originalPostDate: string; // yyyy-mm-dd
  story: string;
}

export const EMPTY_DETAILS: CaseDetails = {
  platform: "Instagram",
  whereUrl: "",
  suspect: "",
  firstContact: "",
  demand: "",
  originalPostUrl: "",
  originalPostDate: "",
  story: "",
};

export const PLATFORMS = ["Instagram", "WhatsApp", "Telegram", "Facebook", "X (Twitter)", "Snapchat", "Other"] as const;

// Sections a cyber cell commonly registers for morphed-image blackmail. Shown as
// suggestions only; the complaint says so.
export const LAW_SECTIONS = [
  "IT Act 2000, s. 66E (violation of privacy)",
  "IT Act 2000, s. 67 and 67A (publishing obscene / sexually explicit material)",
  "IT Act 2000, s. 66C and 66D (identity theft; cheating by personation)",
  "Bharatiya Nyaya Sanhita 2023, s. 308 (extortion)",
  "Bharatiya Nyaya Sanhita 2023, s. 351 (criminal intimidation)",
  "Bharatiya Nyaya Sanhita 2023, s. 79 (insulting the modesty of a woman)",
  "Bharatiya Nyaya Sanhita 2023, s. 356 (defamation)",
];

/** SHA-256 of a file as lowercase hex, computed on this device. */
export async function sha256File(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const ROLE_LABEL: Record<EvidenceFile["role"], string> = {
  fake: "Morphed (fake) image",
  original: "My original photo",
  chat: "Screenshot of messages",
};

/** "30 Oct 2026, 14:05 IST" */
export function istTime(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " IST"
  );
}

const or = (value: string, fallback: string) => value.trim() || fallback;

export function fileList(files: EvidenceFile[]): string {
  return files
    .map((f, i) => `${i + 1}. ${ROLE_LABEL[f.role]}: ${f.name} (${Math.round(f.bytes / 1024)} KB), added ${istTime(f.addedAt)}\n   SHA-256: ${f.sha256}`)
    .join("\n");
}

export function complaintText(d: CaseDetails, files: EvidenceFile[]): string {
  return [
    "Subject: Complaint of blackmail using a morphed (fake) image of me",
    "",
    "I am filing this complaint because someone has created a morphed image using my face and is threatening to share it unless I pay.",
    "",
    "What happened",
    `- Platform: ${d.platform}`,
    `- Where the image was sent or posted: ${or(d.whereUrl, "[link or chat name]")}`,
    `- Suspect's username / phone number / UPI ID: ${or(d.suspect, "[not known]")}`,
    `- First contacted on: ${or(d.firstContact, "[date]")}`,
    `- Demand: ${or(d.demand, "[amount or other demand]")}`,
    d.story.trim() ? `- In my words: ${d.story.trim()}` : "",
    "",
    "Why the image is fake",
    `The face in the morphed image was copied from my own photo${d.originalPostDate ? ` posted on ${d.originalPostDate}` : ""}${d.originalPostUrl ? ` (${d.originalPostUrl})` : ""}. A side-by-side comparison is attached.`,
    "",
    "Evidence attached (SHA-256 fingerprints computed when each file was added)",
    fileList(files) || "[add files on the case page]",
    "",
    "Sections that may apply (for the investigating officer to confirm)",
    ...LAW_SECTIONS.map((s) => `- ${s}`),
    "",
    "I request that the image be removed from all platforms, the account(s) be traced and blocked, and action be taken against the person responsible.",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

export function takedownText(d: CaseDetails): string {
  return [
    `To the ${d.platform} Grievance Officer`,
    "",
    "I am the person shown in the content at the link below. It is an artificially morphed image of me, created and shared without my consent, and it is being used to blackmail me.",
    "",
    `Link / account: ${or(d.whereUrl, "[link]")}`,
    `Account responsible: ${or(d.suspect, "[username]")}`,
    "",
    "Under Rule 3(2)(b) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, please remove or disable access to this content within 24 hours and preserve the account records for the police investigation.",
    "",
    "I have also reported this at cybercrime.gov.in.",
  ].join("\n");
}
