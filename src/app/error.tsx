"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[raahat] page error:", error);
  }, [error]);

  return (
    <main className="status-page">
      <p className="status-code">Something went wrong</p>
      <h1>This page didn&rsquo;t load</h1>
      <p className="hint">
        It may be a weak connection. Try again in a moment. If someone&rsquo;s life is in danger, call <a href="tel:112">112</a> now.
      </p>
      <div className="row-actions">
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <Link className="btn" href="/">Go to the home page</Link>
      </div>
    </main>
  );
}
