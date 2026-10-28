import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Privacy policy", description: "What Raahat collects when you report a disaster, who can see it, and how it is protected." };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy policy" titleHi="गोपनीयता नीति">
      <p className="lead">
        Disaster photos show people at their most vulnerable. Raahat collects only what responders need to reach them, and protects
        everyone in the photo.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>The photo or short video</strong> you send, stored with Cloudinary.</li>
        <li><strong>Your location</strong>, if you share it (phone GPS, a tap on the map, or a Telegram location), or a place you describe.</li>
        <li><strong>Your note</strong>, if you write one, and the language you used.</li>
        <li><strong>On Telegram:</strong> a scrambled code (a salted hash) made from your chat, so a photo and a location can be matched. Your Telegram name, username and number are never stored.</li>
        <li><strong>Photos you check</strong> on <Link href="/check">Check a viral photo</Link> are deleted as soon as they are compared. Nothing about you is kept.</li>
      </ul>
      <p>We do not ask for your name, and we do not use cookies to track you. The only cookie is the control-room sign-in, for staff.</p>

      <h2>Who can see it</h2>
      <table className="info-table">
        <thead><tr><th scope="col">Information</th><th scope="col">Control room</th><th scope="col">Public live map</th></tr></thead>
        <tbody>
          <tr><td>Photo</td><td>Yes (faces can be revealed when needed)</td><td>Faces pixelated</td></tr>
          <tr><td>Location</td><td>Exact</td><td>Rounded to about 110 m</td></tr>
          <tr><td>Your note</td><td>Yes</td><td>Never</td></tr>
          <tr><td>Reports under review or rejected</td><td>Yes</td><td>Not shown</td></tr>
          <tr><td>Fact-check page and card</td><td>Yes</td><td>Only after the control room verifies a report or marks it false: faces pixelated, location rounded, no note</td></tr>
        </tbody>
      </table>

      <h2>How it is used</h2>
      <p>
        Only to rank and route disaster reports to responders: Cloudinary AI reads each photo to estimate the danger, and the
        control room decides what to do. Your report is not sold, shared for advertising, or used for anything else.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Location is optional; you can describe the place instead.</li>
        <li>Notes are optional.</li>
        <li>Photos on this device are only kept until they are sent.</li>
      </ul>
    </InfoPage>
  );
}
