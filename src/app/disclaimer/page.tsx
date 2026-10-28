import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Disclaimer", description: "Raahat is a hackathon project, not an official government service. In an emergency, call 112." };

export default function DisclaimerPage() {
  return (
    <InfoPage title="Disclaimer" titleHi="अस्वीकरण">
      <div className="notice-box" role="note">
        <strong>Raahat is not an official government service.</strong> It is a project built by a student team for Hacktober
        HackDays 2026 (Tech for Social Good). If anyone&rsquo;s life is in danger, call <a href="tel:112">112</a>.
      </div>

      <h2>Emergency numbers</h2>
      <p>
        The helpline numbers shown on this site (112, 1078, 1070, 108) are public emergency numbers in India. Raahat is not connected
        to them and does not pass reports to them automatically.
      </p>

      <h2>Accuracy</h2>
      <p>
        Priorities and summaries are produced by Cloudinary AI and a simple scoring formula. They can be wrong. Raahat ranks
        reports for attention; it never deletes them, and every report remains visible to a person in the control room.
      </p>

      <h2>Maps and places</h2>
      <p>
        Maps are from OpenStreetMap contributors. Suggested locations for reports without a location come from OpenStreetMap
        Nominatim and are only suggestions; a person confirms every pin.
      </p>

      <h2>Design</h2>
      <p>
        Raahat&rsquo;s seal is an original design. The site follows the accessibility and layout patterns of Indian government
        websites so that it feels familiar, but it does not use the State Emblem of India or any official insignia.
      </p>
    </InfoPage>
  );
}
