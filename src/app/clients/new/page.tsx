import Link from "next/link";
import ClientForm from "@/components/ClientForm";
import { createClientAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function NewClient() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <Link href="/clients" className="text-[12px] font-semibold text-ink-3 hover:text-ink">
          ← Clients
        </Link>
        <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
          Add a client
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Answer the registration questions once. Every deadline for the next year is generated on save.
        </p>
      </header>
      <ClientForm action={createClientAction} submitLabel="Create and build calendar" />
    </div>
  );
}
