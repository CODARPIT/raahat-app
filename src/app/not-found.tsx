import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="status-page">
      <p className="status-code num">404</p>
      <h1>We couldn&rsquo;t find that page</h1>
      <p className="hint">The link may be old or mistyped. If someone&rsquo;s life is in danger, call <a href="tel:112">112</a> now.</p>
      <div className="row-actions">
        <Link className="btn btn-primary" href="/report">Report an incident</Link>
        <Link className="btn" href="/">Go to the home page</Link>
      </div>
    </main>
  );
}
