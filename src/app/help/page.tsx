import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Get help now", description: "What to do if someone is blackmailing you with a morphed photo: helplines, how to report, and how to get it removed." };

const HELPLINES = [
  { number: "1930", name: "National cyber crime helpline", when: "Report blackmail, extortion or money already paid. Open 24 hours." },
  { number: "181", name: "Women helpline", when: "Someone to talk to, counselling and local support." },
  { number: "7827170170", name: "National Commission for Women", when: "WhatsApp complaints about harassment of women." },
  { number: "112", name: "Emergency", when: "If you feel unsafe or are thinking of harming yourself." },
];

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Should I pay so they go away?",
    a: <>No. Paying almost always leads to more demands. Stop replying, keep the evidence, and report it. If you have already paid, call <a href="tel:1930">1930</a> quickly: banks can sometimes hold the money.</>,
  },
  {
    q: "Should I delete the chats or block them?",
    a: <>Not yet. First take screenshots of the messages, their username or number, any payment details and the link to the image. Then you can block and report the account.</>,
  },
  {
    q: "How do I report it to the police?",
    a: (
      <>
        Go to <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">cybercrime.gov.in</a> and choose &ldquo;Report
        women/child related crime&rdquo;. You can report anonymously. The <Link href="/case#pack">evidence pack</Link> gives you the
        complaint text and file fingerprints to attach. You can also visit any police station; they must register your complaint.
      </>
    ),
  },
  {
    q: "How do I get the image taken down?",
    a: (
      <>
        Report the post on the platform as non-consensual intimate imagery and send their grievance officer the takedown text from
        your evidence pack. Under the IT Rules 2021, platforms must remove artificially morphed intimate images within 24 hours of
        your complaint. <a href="https://stopncii.org" target="_blank" rel="noreferrer">StopNCII.org</a> can stop re-uploads on
        many platforms without you sharing the image.
      </>
    ),
  },
  {
    q: "I am under 18. What should I do?",
    a: <>Tell a parent, teacher or another adult you trust today, and call <a href="tel:1930">1930</a> or <a href="tel:1098">1098</a> (Childline). Reports involving children are handled under POCSO and taken very seriously. <a href="https://takeitdown.ncmec.org" target="_blank" rel="noreferrer">Take It Down</a> can help remove images of minors.</>,
  },
  {
    q: "Is my case private here?",
    a: <>Yes. Nothing is published, you need no account, the fake image is blurred on screen, and <strong>Delete my case</strong> removes everything. See the <Link href="/privacy">privacy policy</Link>.</>,
  },
];

export default function HelpPage() {
  return (
    <InfoPage title="Get help now" titleHi="अभी मदद पाएँ">
      <p className="lead">You are not at fault, and you are not alone. These people can help today.</p>
      <ul className="helpline-cards">
        {HELPLINES.map((h) => (
          <li key={h.number}>
            <a href={`tel:${h.number}`} className="num">{h.number}</a>
            <strong>{h.name}</strong>
            <span>{h.when}</span>
          </li>
        ))}
      </ul>
      <h2>Common questions</h2>
      <div className="faq">
        {FAQS.map((f, i) => (
          <details key={i} open={i === 0}>
            <summary><span>{f.q}</span></summary>
            <div className="faq-a">{f.a}</div>
          </details>
        ))}
      </div>
    </InfoPage>
  );
}
