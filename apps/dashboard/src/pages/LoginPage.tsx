import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, Radio, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { connectSocket } from '@/lib/socket';
import { BrandTile } from '@/components/ui/BrandMark';
import { LoginArtwork } from '@/components/ui/LoginArtwork';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; role: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@localhost');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
      auth.setTokens(data.access_token, data.refresh_token);
      connectSocket();
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { title?: string } } })?.response?.data?.title ??
        'Sign in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-ambient text-zinc-100">
      {/* ─── Brand / artwork panel ──────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#2e1065] via-[#4c1d95] to-[#0b0614] lg:flex lg:w-[56%] xl:w-[58%]">
        <LoginArtwork className="absolute inset-0 h-full w-full" />
        {/* legibility vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0614]/85 via-[#0b0614]/10 to-black/30" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_80%_10%,rgba(168,85,247,0.28),transparent_55%)]" />
        <div className="absolute inset-0 grain opacity-[0.06] mix-blend-soft-light" />
        {/* slow scan line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent [animation:scan_7s_linear_infinite]" />

        {/* Content */}
        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <BrandTile className="h-10 w-10 rounded-xl" />
            <div className="leading-tight">
              <p className="text-[15px] font-bold tracking-tight text-white">Keystone</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-violet-200/70">
                Monitoring &amp; Sync
              </p>
            </div>
          </div>

          <div className="max-w-lg animate-fade-up">
            <h1 className="text-balance text-4xl font-extrabold leading-[1.07] tracking-tight text-white xl:text-5xl">
              Monitor every device.
              <br />
              <span className="text-gradient">Sync every user.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-zinc-300/85">
              Keystone is the monitoring and sync layer for Hikvision and multi-vendor
              access-control fleets — live event streams, fleet health, and reliable user
              provisioning across every reader.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-zinc-300/80">
              <span className="inline-flex items-center gap-2">
                <Radio className="h-4 w-4 text-violet-300" /> Live event monitoring
              </span>
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-violet-300" /> Fleet-wide user sync
              </span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400/55">
            © {new Date().getFullYear()} Keystone · Monitoring &amp; sync for access-control fleets
          </p>
        </div>
      </aside>

      {/* ─── Form panel ─────────────────────────────────────────────── */}
      <main className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-hero-glow opacity-60 blur-2xl" />

        <div className="relative w-full max-w-sm animate-fade-up">
          {/* Mobile brand */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <BrandTile className="h-12 w-12 rounded-2xl" />
            <div className="text-center">
              <h1 className="text-lg font-bold tracking-tight text-zinc-50">Keystone</h1>
              <p className="text-sm text-zinc-500">Sign in to your account</p>
            </div>
          </div>

          {/* Desktop heading */}
          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-50">Welcome back</h2>
            <p className="mt-1 text-sm text-zinc-500">Sign in to monitor and sync your devices.</p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <Field label="Email">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-brand-violet focus:outline-none focus:ring-4 focus:ring-brand-violet/15"
                placeholder="you@company.com"
                autoComplete="username"
                required
                autoFocus
              />
            </Field>

            <Field label="Password">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-brand-violet focus:outline-none focus:ring-4 focus:ring-brand-violet/15"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition hover:text-zinc-300"
                tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </Field>

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-zinc-400">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-purple-500"
                />
                Remember me
              </label>
              <button type="button" className="text-[13px] font-semibold text-brand-violet hover:text-brand-fuchsia">
                Forgot password?
              </button>
            </div>

            {error && (
              <p className="animate-fade-in rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:shadow-[0_0_0_1px_rgba(168,85,247,0.6),0_12px_36px_-8px_rgba(168,85,247,0.7)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] text-zinc-600">
            Dev credentials · <span className="font-mono text-zinc-500">admin@localhost</span> /{' '}
            <span className="font-mono text-zinc-500">changeme123</span>
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <div className="relative">{children}</div>
    </label>
  );
}
