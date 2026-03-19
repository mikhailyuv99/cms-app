"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur de connexion");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erreur de connexion");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[var(--cms-bg)]">
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--cms-surface)] via-[var(--cms-bg)] to-[var(--cms-bg)]" />

      <div className="relative w-full max-w-[400px]">
        <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface)] p-8 shadow-2xl">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--cms-border)] text-[var(--cms-text-muted)] mb-6">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--cms-text)]">
              Accès à l’édition
            </h1>
            <p className="mt-2 text-sm text-[var(--cms-text-muted)]">
              Saisissez le mot de passe de votre projet pour continuer.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--cms-text-muted)] mb-2">
                Mot de passe du projet
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--cms-border)] bg-[var(--cms-bg)] px-4 py-3 text-[var(--cms-text)] placeholder:text-zinc-500 transition-colors focus:border-white focus:ring-2 focus:ring-white/20"
                placeholder="••••••••"
                required
                autoFocus
                disabled={loading}
              />
            </div>
            {error && (
              <p className="text-sm text-[var(--cms-error)] flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white px-4 py-3.5 font-semibold text-black transition-opacity hover:opacity-90 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[var(--cms-bg)] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connexion…
                </span>
              ) : (
                "Accéder au CMS"
              )}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-[var(--cms-text-muted)]">
          Outil d’édition de contenu — accès sécurisé par projet
        </p>
      </div>
    </div>
  );
}
