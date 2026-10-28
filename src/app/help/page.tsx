import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Help & FAQs", description: "How to report a disaster with Raahat, what happens to your photo, and how your privacy is protected." };

const FAQS: { q: string; qHi: string; a: React.ReactNode }[] = [
  {
    q: "How do I report a disaster?",
    qHi: "आपदा की रिपोर्ट कैसे करें?",
    a: (
      <>
        Open <Link href="/report">Report an incident</Link>, tap <strong>Take a photo</strong>, allow your location (or tap the map,
        or choose &ldquo;I don&rsquo;t know&rdquo; and describe the place), add a short note if you can, and tap <strong>Send report</strong>.
        It takes about a minute and works in Hindi or English.
      </>
    ),
  },
  {
    q: "Should I call 112 as well?",
    qHi: "क्या मुझे 112 पर भी कॉल करना चाहिए?",
    a: <>Yes. If anyone&rsquo;s life is in danger, call <a href="tel:112">112</a> first. Raahat helps control rooms decide where to send help; it does not replace emergency services.</>,
  },
  {
    q: "What if I have no signal?",
    qHi: "अगर नेटवर्क न हो तो?",
    a: <>Fill in the report anyway. Raahat saves it on your phone and sends it automatically as soon as the connection returns. You can close the page and open it again later.</>,
  },
  {
    q: "What if I don't know my exact location?",
    qHi: "अगर मुझे अपनी सही जगह न पता हो?",
    a: <>Choose &ldquo;I don&rsquo;t know&rdquo; and describe the place: the nearest school, temple, road or village. Your report is never dropped; the control room places it on the map.</>,
  },
  {
    q: "What happens to my photo?",
    qHi: "मेरी फ़ोटो का क्या होता है?",
    a: (
      <>
        Cloudinary AI reads it to work out the type of danger, how many people are visible and how deep the water is. The same photo
        forwarded many times is merged into one report, and different photos of the same incident raise its priority. A person in
        the control room sees every report; nothing is deleted by the AI.
      </>
    ),
  },
  {
    q: "Who can see my report?",
    qHi: "मेरी रिपोर्ट कौन देख सकता है?",
    a: (
      <>
        Control-room staff see the exact location, your note and the photo. On the public <Link href="/map">live map</Link>, faces are
        pixelated, the location is rounded to about 110 m, and your note is hidden. See the <Link href="/privacy">privacy policy</Link>.
      </>
    ),
  },
  {
    q: "How is the priority decided?",
    qHi: "प्राथमिकता कैसे तय होती है?",
    a: <>A simple, visible score: danger to life first, then how fast the hazard spreads, then whether help can reach the spot. Control rooms can see every point that went into each score.</>,
  },
  {
    q: "Can I report on WhatsApp?",
    qHi: "क्या मैं व्हाट्सऐप पर रिपोर्ट कर सकता हूँ?",
    a: <>Yes, when WhatsApp reporting is switched on: send a photo and your location pin to the Raahat number shown on the <Link href="/#whatsapp">home page</Link>, in either order.</>,
  },
];

export default function HelpPage() {
  return (
    <InfoPage title="Help & FAQs" titleHi="सहायता एवं प्रश्न">
      <p className="lead">Answers for citizens reporting a disaster. Control-room staff: press <kbd>?</kbd> in the control room for keyboard shortcuts.</p>
      <div className="faq">
        {FAQS.map((f, i) => (
          <details key={i} open={i === 0}>
            <summary>
              <span>{f.q}</span>
              <span className="faq-hi" lang="hi">{f.qHi}</span>
            </summary>
            <div className="faq-a">{f.a}</div>
          </details>
        ))}
      </div>
    </InfoPage>
  );
}
