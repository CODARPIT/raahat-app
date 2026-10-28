import { CheckForm } from "@/components/CheckForm";
import { InfoPage } from "@/components/InfoPage";
import { getI18n } from "@/lib/locale";
import { telegram } from "@/lib/telegram";

export const metadata = {
  title: "Check a viral photo",
  description: "Saw a disaster photo or reel on social media? Check whether Raahat's control room verified it, or whether it's an old photo.",
};

export default async function CheckPage() {
  const { locale, t: { check: t } } = await getI18n();
  return (
    <InfoPage title={t.title} titleHi={locale === "en" ? "वायरल फ़ोटो की जाँच करें" : undefined} translated>
      <p className="lead">{t.lead}</p>
      <CheckForm />
      <h2>{t.meaning}</h2>
      <ul>
        <li><strong>{t.m1T}</strong> {t.m1}</li>
        <li><strong>{t.m2T}</strong> {t.m2}</li>
        <li><strong>{t.m3T}</strong> {t.m3}</li>
        <li><strong>{t.m4T}</strong> {t.m4}</li>
        <li><strong>{t.m5T}</strong> {t.m5}</li>
      </ul>
      <p className="hint">
        {t.video}
        {telegram.username && <> {t.forward} <a href={`https://t.me/${telegram.username}`}>@{telegram.username}</a></>}
      </p>
    </InfoPage>
  );
}
