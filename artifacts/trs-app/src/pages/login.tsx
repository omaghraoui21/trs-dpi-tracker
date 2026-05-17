import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Activity, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Remember last email
  useEffect(() => {
    const saved = localStorage.getItem("dpi_last_email");
    if (saved) setEmail(saved);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Read actual DOM values — iOS Safari autofill may not trigger onChange,
    // so React state can be stale while the field visually shows a value.
    const fd = new FormData(formRef.current!);
    const emailVal = (fd.get("email") as string | null) ?? email;
    const passwordVal = (fd.get("password") as string | null) ?? password;
    setError(null);
    setSubmitting(true);
    try {
      localStorage.setItem("dpi_last_email", emailVal);
      await login({ email: emailVal.trim().toLowerCase(), password: passwordVal });
      setLocation("/");
    } catch {
      setError("Email ou mot de passe incorrect. Vérifiez vos identifiants.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20">
            <Activity className="h-8 w-8 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">DPI TRS Tracker</h1>
            <p className="text-sm text-slate-400 mt-1">Suivi OEE — Production pharmaceutique</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-base font-semibold text-white mb-5">Connexion</h2>

          {/* Error banner */}
          {error && (
            <div className="mb-4 flex items-start gap-3 border border-red-500/30 bg-red-500/10 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300 text-sm">
                Email professionnel
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                placeholder="prenom.nom@dpi.local"
                required
                autoFocus={!email}
                autoComplete="email"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-sky-500 h-12 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300 text-sm">
                Mot de passe
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  placeholder="••••••••"
                  required
                  autoFocus={!!email}
                  autoComplete="current-password"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-sky-500 h-12 text-base pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-semibold h-12 text-base mt-2 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connexion...
                </span>
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>
        </div>

        <div className="text-center space-y-1">
          <p className="text-xs text-slate-600">Accès réservé au personnel autorisé DPI</p>
          <p className="text-xs text-slate-700">En cas de problème, contactez votre superviseur</p>
        </div>
      </div>
    </div>
  );
}
