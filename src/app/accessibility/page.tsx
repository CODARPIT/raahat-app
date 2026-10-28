import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Accessibility statement", description: "How Raahat supports screen readers, keyboard use, large text, high contrast and slow networks." };

export default function AccessibilityPage() {
  return (
    <InfoPage title="Accessibility statement" titleHi="सुगम्यता विवरण">
      <p className="lead">
        Raahat is meant to be usable by everyone, including people using screen readers, people with low vision, and people on
        old phones or weak networks during a disaster. We follow the Guidelines for Indian Government Websites (GIGW) and aim
        for WCAG 2.1 level AA.
      </p>

      <h2>What you can do on this site</h2>
      <ul>
        <li><strong>Skip to main content</strong> from the top of every page.</li>
        <li><strong>Change the text size</strong> with A− / A / A+ in the top bar. Your choice is remembered on this device.</li>
        <li><strong>Switch to high contrast</strong> or dark mode from the top bar.</li>
        <li><strong>Use the keyboard only:</strong> every control can be reached with Tab and shows a visible focus ring. The control room has single-key shortcuts (press <kbd>?</kbd>).</li>
        <li><strong>Read in Hindi or English</strong> on the report page; key headings are bilingual throughout.</li>
        <li><strong>Use a weak network:</strong> photos shrink on the phone before upload, the control room has a 2G mode, and reports are saved on the phone when there is no signal.</li>
        <li><strong>Reduced motion:</strong> animations are switched off if your device asks for less motion.</li>
      </ul>

      <h2>Screen readers</h2>
      <p>
        Pages use headings, landmarks (header, navigation, main, footer) and labelled controls, and severity is always written
        in words as well as shown in colour, so the site works with the free screen readers below. Full testing with each of
        them is still on our list; please tell us if anything doesn&rsquo;t read well.
      </p>
      <table className="info-table">
        <thead><tr><th scope="col">Screen reader</th><th scope="col">Platform</th><th scope="col">Cost</th></tr></thead>
        <tbody>
          <tr><td>NVDA</td><td>Windows</td><td>Free</td></tr>
          <tr><td>TalkBack</td><td>Android (built in)</td><td>Free</td></tr>
          <tr><td>VoiceOver</td><td>iPhone, Mac (built in)</td><td>Free</td></tr>
        </tbody>
      </table>

      <h2>Known limitations</h2>
      <ul>
        <li>The map itself is visual. Every report on the map is also listed as text in the queue next to it.</li>
        <li>Photos are described by an AI summary, which can be wrong; a person in the control room checks each report.</li>
      </ul>

      <h2>Tell us about a problem</h2>
      <p>If something on Raahat is hard to use, please open an issue on the project&rsquo;s GitHub repository so the team can fix it.</p>
    </InfoPage>
  );
}
