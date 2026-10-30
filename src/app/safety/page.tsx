import { InfoPage } from "@/components/InfoPage";

export const metadata = {
  title: "Safety advisories",
  description: "What to do before, during and after floods, earthquakes, cyclones and fires. Hindi and English.",
};

interface Hazard {
  id: string;
  title: string;
  titleHi: string;
  phases: { name: string; nameHi: string; dos: string[]; donts?: string[] }[];
}

// General public guidance, adapted from India's National Disaster Management Authority (NDMA).
const HAZARDS: Hazard[] = [
  {
    id: "flood",
    title: "Floods",
    titleHi: "बाढ़",
    phases: [
      {
        name: "Before",
        nameHi: "पहले",
        dos: [
          "Keep an emergency kit ready: torch, spare batteries, radio, medicines, drinking water, dry food and a whistle.",
          "Keep important documents and phones in a waterproof bag.",
          "Know the way to the nearest high ground or relief camp.",
          "Follow weather warnings from IMD and your district administration.",
        ],
      },
      {
        name: "During",
        nameHi: "दौरान",
        dos: [
          "Move to higher ground or an upper floor at once.",
          "Switch off electricity and gas at the main supply if it is safe to do so.",
          "Drink only boiled or chlorinated water.",
          "Send a photo to Raahat and call 112 if anyone is trapped.",
        ],
        donts: [
          "Don't walk or drive through moving water; even knee-deep water can sweep a person or a car away.",
          "Don't go near electric poles, fallen wires or transformers.",
          "Don't let children play in or near floodwater.",
        ],
      },
      {
        name: "After",
        nameHi: "बाद में",
        dos: [
          "Return home only when the authorities say it is safe.",
          "Check walls and roofs for damage before going inside.",
          "Watch out for snakes and broken glass in debris.",
          "Have wet electrical appliances checked before using them.",
        ],
      },
    ],
  },
  {
    id: "earthquake",
    title: "Earthquakes",
    titleHi: "भूकंप",
    phases: [
      {
        name: "During",
        nameHi: "दौरान",
        dos: [
          "Drop, cover and hold on: get under a sturdy table and hold it until the shaking stops.",
          "Stay away from windows, glass and heavy furniture.",
          "If you are outside, move to an open area away from buildings, trees and wires.",
        ],
        donts: ["Don't use lifts.", "Don't run outside while the building is shaking."],
      },
      {
        name: "After",
        nameHi: "बाद में",
        dos: [
          "Expect aftershocks.",
          "Leave damaged buildings carefully and do not go back in.",
          "Report collapsed buildings and trapped people to Raahat and call 112.",
        ],
      },
    ],
  },
  {
    id: "cyclone",
    title: "Cyclones and storms",
    titleHi: "चक्रवात और तूफ़ान",
    phases: [
      {
        name: "Before",
        nameHi: "पहले",
        dos: [
          "Follow cyclone warnings on radio, TV and official alerts.",
          "Tie down or bring in loose objects that could fly in strong wind.",
          "Move to a cyclone shelter if the administration asks you to.",
        ],
      },
      {
        name: "During",
        nameHi: "दौरान",
        dos: ["Stay indoors, away from windows.", "Keep your emergency kit and phone with you."],
        donts: ["Don't go out when the wind suddenly calms; it may be the eye of the storm, and strong winds will return."],
      },
    ],
  },
  {
    id: "fire",
    title: "Fire",
    titleHi: "आग",
    phases: [
      {
        name: "During",
        nameHi: "दौरान",
        dos: [
          "Get everyone out and call 101 (fire) or 112.",
          "Stay low under smoke and cover your nose and mouth with a wet cloth.",
          "Feel doors before opening them; if a door is hot, use another way out.",
        ],
        donts: ["Don't use lifts.", "Don't go back inside for belongings."],
      },
    ],
  },
];

export default function SafetyPage() {
  return (
    <InfoPage title="Safety advisories" titleHi="सुरक्षा सलाह">
      <p className="lead">
        What to do before, during and after a disaster. If anyone&rsquo;s life is in danger, call <a href="tel:112">112</a> first.
      </p>
      <nav className="hazard-nav" aria-label="Hazards">
        {HAZARDS.map((h) => (
          <a key={h.id} href={`#${h.id}`}>
            {h.title} <span lang="hi">{h.titleHi}</span>
          </a>
        ))}
      </nav>
      {HAZARDS.map((h) => (
        <section key={h.id} id={h.id} className="hazard" aria-labelledby={`${h.id}-h`}>
          <h2 id={`${h.id}-h`}>
            {h.title} <span lang="hi">· {h.titleHi}</span>
          </h2>
          <div className="phases">
            {h.phases.map((p) => (
              <div key={p.name} className="phase">
                <h3>
                  {p.name} <span lang="hi">· {p.nameHi}</span>
                </h3>
                <ul className="dos">
                  {p.dos.map((d) => <li key={d}>{d}</li>)}
                </ul>
                {p.donts && (
                  <ul className="donts">
                    {p.donts.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="hint">
        General guidance adapted from the National Disaster Management Authority (NDMA). Always follow instructions from your local
        administration. More: <a href="https://ndma.gov.in" target="_blank" rel="noreferrer">ndma.gov.in</a>.
      </p>
    </InfoPage>
  );
}
