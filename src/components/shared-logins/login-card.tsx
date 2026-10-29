"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { currentCodeAction, revealPasswordAction } from "@/app/(app)/logins/actions";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STEP = 30;
const HIDE_AFTER_MS = 60_000;

function LiveCode({ id }: { id: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState(STEP);
  const [error, setError] = useState<string | null>(null);
  const expires = useRef(0);

  useEffect(() => {
    let dead = false;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await currentCodeAction(id);
        if (dead) return;
        if (r.ok) {
          expires.current = Date.now() + r.secondsLeft * 1000;
          setCode(r.code);
          setError(null);
        } else {
          expires.current = Date.now() + 5000;
          setError(r.error);
        }
      } catch {
        if (!dead) {
          expires.current = Date.now() + 5000;
          setError("Couldn't load the code. Retrying…");
        }
      } finally {
        busy = false;
      }
    };
    const tick = () => {
      const s = Math.ceil((expires.current - Date.now()) / 1000);
      if (s <= 0) void load();
      setLeft(Math.max(0, s));
    };
    void load();
    const t = setInterval(tick, 500);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [id]);

  if (error && !code) return <p role="alert" className="text-sm text-error">{error}</p>;
  if (!code) return <p className="text-sm text-muted">Loading code…</p>;
  return (
    <div className="space-y-1.5">
      <CopyField label="Authenticator code" value={code} />
      <div className="flex items-center gap-2" role="timer" aria-label={`Code changes in ${left} seconds`}>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-hover">
          <div className="h-full bg-foreground transition-[width] duration-500 ease-linear" style={{ width: `${(left / STEP) * 100}%` }} />
        </div>
        <span className="font-mono text-xs tabular-nums text-muted">{left}s</span>
      </div>
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
    </div>
  );
}

export function LoginCard({ id, label, email }: { id: string; label: string; email: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A revealed password hides itself again, so it isn't left on a screen someone walks away from.
  useEffect(() => {
    if (password === null) return;
    const t = setTimeout(() => setPassword(null), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [password]);

  const reveal = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await revealPasswordAction(id);
      if (r.ok) setPassword(r.password);
      else setError(r.error);
    } catch {
      setError("Couldn't load the password. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-base font-semibold">{label}</h2>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Email</p>
        <CopyField label={`${label} email`} value={email} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Password</p>
        {password === null ? (
          <Button type="button" variant="secondary" onClick={reveal} disabled={pending}>
            <Eye aria-hidden />
            {pending ? "Loading…" : "Reveal password"}
          </Button>
        ) : (
          <div className="space-y-1.5">
            <CopyField label={`${label} password`} value={password} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setPassword(null)}>
              <EyeOff aria-hidden />
              Hide
            </Button>
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Authenticator code</p>
        <LiveCode id={id} />
      </div>
    </Card>
  );
}
