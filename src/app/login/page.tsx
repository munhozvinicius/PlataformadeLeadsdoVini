"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sessionUser = session?.user;

  useEffect(() => {
    // if (status === "authenticated" && sessionUser) {
    //   router.replace("/");
    // }
  }, [status, sessionUser, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError("Login inválido. Confira e-mail e senha.");
    } else {
      router.replace("/");
    }
  }

  return (
    <div className="min-h-screen bg-pic-dark bg-[url('/grid.svg')] flex items-center justify-center p-6 relative">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-pic-dark/90 to-neon-pink/10 pointer-events-none"></div>

      <div className="w-full max-w-md bg-pic-card border-4 border-neon-pink shadow-[0_0_50px_rgba(255,0,153,0.4)] p-8 space-y-8 relative overflow-hidden backdrop-blur-sm">
        {/* Vector Element Decor */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-neon-green/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-neon-blue/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.2em] text-neon-green font-bold mb-2">PIC System</p>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
            Acessar<br />Plataforma
          </h1>
          <p className="text-sm text-slate-400 mt-4 font-mono border-l-2 border-neon-green pl-3">
            Identifique-se para acessar o painel de inteligência.
          </p>
        </div>
        <form className="space-y-6 relative z-10" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-neon-pink tracking-wider">Email</label>
            <input
              type="email"
              autoComplete="email"
              className="w-full bg-black/50 border-2 border-pic-zinc text-white px-4 py-3 text-sm focus:outline-none focus:border-neon-green focus:shadow-[0_0_15px_rgba(204,255,0,0.3)] transition-all font-mono placeholder:text-slate-700"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-neon-pink tracking-wider">Senha</label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full bg-black/50 border-2 border-pic-zinc text-white px-4 py-3 text-sm focus:outline-none focus:border-neon-green focus:shadow-[0_0_15px_rgba(204,255,0,0.3)] transition-all font-mono placeholder:text-slate-700"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? (
            <div className="bg-red-900/20 border border-red-500/50 p-3">
              <p className="text-sm text-red-400 font-mono">Erro: {error}</p>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neon-pink text-black py-4 text-base font-black uppercase tracking-widest hover:bg-white hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Carregando..." : "Entrar No Sistema"}
          </button>
        </form>
      </div>
    </div>
  );
}
