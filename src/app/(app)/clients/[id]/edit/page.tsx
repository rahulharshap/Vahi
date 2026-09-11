import Link from "next/link";
import { notFound } from "next/navigation";
import ClientForm from "@/components/ClientForm";
import { getClient } from "@/lib/store";
import { updateClientAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function EditClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getClient(id);
  if (!c) notFound();
  const action = updateClientAction.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <Link href={"/clients/" + id} className="text-[12px] font-semibold text-ink-3 hover:text-ink">
          ← {c.name}
        </Link>
        <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-ink md:text-[26px]">
          Edit client
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Changing a registration flag regenerates the calendar. Existing progress is preserved.
        </p>
      </header>
      <ClientForm action={action} client={c} submitLabel="Save and re-sync calendar" />
    </div>
  );
}
