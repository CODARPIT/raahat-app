import { CheckForm } from "@/components/CheckForm";
import { InfoPage } from "@/components/InfoPage";
import { telegram } from "@/lib/telegram";

export const metadata = {
  title: "Check a viral photo",
  description: "Saw a disaster photo or reel on social media? Check whether Raahat's control room verified it, or whether it's an old photo.",
};

export default function CheckPage() {
  return (
    <InfoPage title="Check a viral photo" titleHi="वायरल फ़ोटो की जाँच करें">
      <p className="lead">
        Saw a flood, fire or collapse photo on Instagram, WhatsApp or X? Before you share it, check it here. Raahat
        compares it with every report citizens have sent and with a library of old disaster photos that keep coming back.
      </p>
      <CheckForm />
      <h2>What the answers mean</h2>
      <ul>
        <li><strong>Verified by the control room:</strong> a citizen reported it to Raahat and a responder confirmed it.</li>
        <li><strong>False or misleading:</strong> the control room checked it and found it isn&rsquo;t what it claims.</li>
        <li><strong>Not verified yet:</strong> Raahat has the report but no one has confirmed it yet.</li>
        <li><strong>Old photo:</strong> it matches a known photo from an earlier disaster.</li>
        <li><strong>No record:</strong> Raahat hasn&rsquo;t seen it. That&rsquo;s not proof either way.</li>
      </ul>
      <p className="hint">
        For a video or reel, take a screenshot of a clear frame and check that.
        {telegram.username && <> You can also forward the photo to <a href={`https://t.me/${telegram.username}`}>@{telegram.username}</a> on Telegram.</>}
      </p>
    </InfoPage>
  );
}
