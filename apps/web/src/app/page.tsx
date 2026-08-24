export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>GraphGuard</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Continuous evaluation and release-safety for AI agent graphs
      </p>
      <div
        style={{
          padding: "1.5rem",
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          maxWidth: "400px",
          width: "100%",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Dashboard</h2>
        <p style={{ color: "#888" }}>Phase 1 — Foundation complete. Dashboard coming in later phases.</p>
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.875rem", color: "#444" }}>
            ✅ API Health: <code>GET /health</code>
          </p>
          <p style={{ fontSize: "0.875rem", color: "#444" }}>
            ✅ API Ready: <code>GET /ready</code>
          </p>
        </div>
      </div>
    </main>
  );
}
