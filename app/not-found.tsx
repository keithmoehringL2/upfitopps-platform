import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 40, fontWeight: 600, margin: 0 }}>Not found</h1>
      <p style={{ color: "var(--neutral-600)", margin: 0 }}>
        This page doesn&rsquo;t exist.
      </p>
      <Link href="/" style={{ fontWeight: 600 }}>
        Go to UpfitOutreach
      </Link>
    </main>
  );
}
