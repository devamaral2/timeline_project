import React from "react";
import Link from "next/link";

export default function TimelinePage() {
  return (
    <main>
      <h1>All Tracker</h1>
      <nav>
        <Link href="/">Timeline</Link>
        <Link href="/daily">Daily Overview</Link>
      </nav>
    </main>
  );
}
