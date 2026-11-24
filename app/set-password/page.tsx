import { SetPasswordForm } from "./set-password-form";

// Manager password setup / reset (apex). Reached from the emailed setup link
// (?token=...). The token is validated on submit, not here, so an invalid link
// still renders the form and shows a clear error on attempt.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: "var(--accent-700)" }}>UpfitOutreach</span>
        <h1 style={{ fontSize: 34, fontWeight: 600, margin: "24px 0 4px" }}>Set your password</h1>
        <p style={{ fontSize: 14, color: "var(--neutral-600)", marginTop: 0 }}>
          Choose a password to finish setting up your account.
        </p>

        <SetPasswordForm token={token ?? ""} />
      </div>
    </main>
  );
}
