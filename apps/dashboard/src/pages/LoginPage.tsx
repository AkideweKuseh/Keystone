import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { connectSocket } from '@/lib/socket';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; role: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
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
    <div
      className="flex min-h-dvh items-center justify-center p-[clamp(0.75rem,2.5vmin,2.5rem)] text-zinc-900 lg:h-dvh"
      style={{
        background:
          'radial-gradient(90rem 50rem at 50% -20%, #ffffff 0%, transparent 60%),' +
          'radial-gradient(60rem 40rem at 100% 100%, #dbeafe 0%, transparent 55%),' +
          'radial-gradient(50rem 40rem at 0% 90%, #bfdbfe 0%, transparent 55%),' +
          'linear-gradient(160deg, #e8f0fc 0%, #dce9fa 45%, #eef4fd 100%)',
      }}
    >
      {/* ─── Floating window ────────────────────────────────────────── */}
      <div className="grid w-full max-w-[70rem] grid-cols-1 gap-[0.75em] rounded-[2rem] bg-white/60 p-[0.75em] shadow-[0_2.5em_5.5em_-2em_rgba(30,64,175,0.3),0_0_0_1px_rgba(255,255,255,0.65)_inset] backdrop-blur-xl lg:max-h-full lg:grid-cols-[1.08fr_1fr]">
        {/* ─── Artwork panel ──────────────────────────────────────── */}
        <aside
          className="relative hidden overflow-hidden rounded-[1.5rem] lg:flex lg:min-h-0 lg:flex-col lg:justify-between"
          style={{
            background:
              'radial-gradient(55% 60% at 72% 16%, rgba(255,255,255,0.9) 0%, transparent 60%),' +
              'radial-gradient(60% 55% at 14% 28%, rgba(59,130,246,0.7) 0%, transparent 62%),' +
              'radial-gradient(55% 55% at 62% 74%, rgba(96,165,250,0.5) 0%, transparent 62%),' +
              'linear-gradient(150deg, #7fb0f7 0%, #a7c8f8 40%, #e2edfc 100%)',
          }}
        >
          {/* Oversized wordmark — the panel's one signature */}
          <div className="px-[clamp(1.5rem,3vw,2.5rem)] pt-[clamp(2rem,7vh,4rem)]">
            <p className="select-none text-[clamp(3rem,5.8vw,5.5rem)] font-extrabold leading-none tracking-[-0.04em] text-white">
              KEYSTONE
            </p>
            <p className="mt-[0.15em] select-none pl-[3em] text-[clamp(1.4rem,2.6vw,2.5rem)] font-bold uppercase leading-none tracking-[0.12em] text-white/50">
              Access OS
            </p>
          </div>

          {/* Grounding copy */}
          <div className="px-[clamp(1.5rem,3vw,2.5rem)] pb-[clamp(1.5rem,5vh,3rem)]">
            <h1 className="text-[clamp(1.375rem,2vw,1.875rem)] font-extrabold leading-tight tracking-tight text-zinc-900">
              One key to every door
            </h1>
            <p className="mt-[0.75em] max-w-[24rem] text-[0.9375rem] leading-relaxed text-zinc-700/85">
              Live event streams, fleet health, and reliable user provisioning across
              Hikvision and multi-vendor access-control devices.
            </p>
          </div>
        </aside>

        {/* ─── Form column ────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-[0.75em]">
          <main className="relative flex-1 overflow-hidden rounded-[1.5rem] bg-[#fbfdff] px-[clamp(1.25rem,3vw,2.5rem)] py-[clamp(1.25rem,3.5vh,2.5rem)]">
            {/* faint checker texture */}
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  'conic-gradient(rgba(59,130,246,0.05) 25%, transparent 25% 50%, rgba(59,130,246,0.05) 50% 75%, transparent 75%)',
                backgroundSize: '2rem 2rem',
                maskImage: 'linear-gradient(to bottom, black, transparent 55%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 55%)',
              }}
            />

            <div className="relative mx-auto flex h-full w-full max-w-[24rem] flex-col justify-center">
              <BrandChip />

              <h2 className="mt-[clamp(0.75rem,2vh,1.25rem)] text-[clamp(1.375rem,1.7vw,1.75rem)] font-extrabold tracking-tight text-zinc-900">
                Welcome back
              </h2>
              <p className="mt-[0.25em] text-sm text-zinc-500">
                Sign in to monitor and sync your fleet.
              </p>

              <form
                onSubmit={(e) => void handleSubmit(e)}
                className="mt-[clamp(1rem,2.8vh,1.75rem)] space-y-[clamp(0.7rem,1.8vh,1rem)]"
              >
                <Field label="Email">
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-transparent bg-[#eef4fc] px-4 py-[clamp(0.55rem,1.4vh,0.75rem)] text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-400/20"
                    placeholder="you@example.com"
                    autoComplete="username"
                    required
                    autoFocus
                  />
                </Field>

                <Field label="Password">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-transparent bg-[#eef4fc] py-[clamp(0.55rem,1.4vh,0.75rem)] pl-4 pr-11 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-400/20"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition hover:text-zinc-600"
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </Field>

                <div className="flex items-center justify-between pt-[0.125em]">
                  <label className="flex cursor-pointer select-none items-center gap-2 text-[0.8125rem] text-zinc-500">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="h-3.5 w-3.5 rounded border-zinc-300 accent-blue-600"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    className="text-[0.8125rem] font-semibold text-blue-600 transition hover:text-blue-700"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && (
                  <p className="animate-fade-in rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 py-[clamp(0.6rem,1.5vh,0.75rem)] text-sm font-semibold text-white shadow-[0_0.875em_1.875em_-0.625em_rgba(37,99,235,0.55)] transition hover:brightness-110 hover:shadow-[0_1em_2.25em_-0.625em_rgba(37,99,235,0.7)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>

              {import.meta.env.DEV && (
                <>
                  <div className="mt-[clamp(1rem,2.5vh,1.5rem)] flex items-center gap-3 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-zinc-400">
                    <span className="h-px flex-1 bg-zinc-200" />
                    Local development
                    <span className="h-px flex-1 bg-zinc-200" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('admin@localhost');
                      setPassword('changeme123');
                    }}
                    className="mt-[clamp(0.6rem,1.8vh,1rem)] flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white py-[clamp(0.55rem,1.4vh,0.75rem)] text-sm font-semibold text-zinc-700 transition hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    Fill dev credentials
                  </button>
                </>
              )}
            </div>
          </main>

          {/* Capability strip */}
          <div className="rounded-[1.5rem] bg-[#fbfdff] px-[clamp(1.25rem,2vw,1.5rem)] py-[clamp(0.6rem,1.6vh,1rem)] leading-tight">
            <p className="text-[0.8125rem] font-bold text-zinc-800">
              Live events · User sync · Door control
            </p>
            <p className="text-[0.6875rem] text-zinc-500">across every reader, in real time</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Blue keystone chip, local to the login page (the shared BrandTile is violet). */
function BrandChip() {
  return (
    <span className="relative inline-flex h-[clamp(2.5rem,5.5vh,3rem)] w-[clamp(2.5rem,5.5vh,3rem)] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 shadow-[0_0.375em_1.5em_-0.375em_rgba(37,99,235,0.6)]">
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
      <svg viewBox="0 0 24 24" fill="none" className="relative h-1/2 w-1/2" aria-hidden="true">
        <path d="M5 4h14l-2.4 15.2a1 1 0 0 1-1 .8H8.4a1 1 0 0 1-1-.8L5 4Z" fill="#ffffff" />
        <circle cx="12" cy="10.4" r="1.7" fill="#2563eb" />
        <path d="M12 11.6l.7 3.4h-1.4l.7-3.4Z" fill="#2563eb" />
      </svg>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-[0.375em] block text-[0.8125rem] font-semibold text-zinc-700">
        {label}
      </span>
      <div className="relative">{children}</div>
    </label>
  );
}
