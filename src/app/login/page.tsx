import Link from "next/link";
import { authConfigured } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const configured = authConfigured();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-[17px] font-black text-white"
        >
          व
        </span>
        <div>
          <div className="text-[17px] font-bold tracking-tight text-ink">Vahi</div>
          <div className="text-[11.5px] text-ink-3">Compliance command centre</div>
        </div>
      </div>

      {configured ? (
        <LoginForm next={sp.next ?? "/board"} initialMode={sp.mode === "signup" ? "signup" : "signin"} />
      ) : (
        <div className="card space-y-3 p-5">
          <h1 className="text-[16px] font-bold text-ink">Sign-in is not configured</h1>
          <p className="text-[13px] leading-relaxed text-ink-2">
            This deployment has no <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> or{" "}
            <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> set, so authentication is
            switched off and the app is open to anyone with the link.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-2">
            That is fine for a demo with sample data. It is not fine once this holds a real client list — see
            SETUP.md.
          </p>
          <Link href="/board" className="btn btn-primary">
            Continue to the demo
          </Link>
        </div>
      )}

      <p className="mt-6 text-center text-[11.5px] text-ink-3">
        <Link href="/landing" className="hover:text-ink">
          What is Vahi?
        </Link>
      </p>
    </div>
  );
}
