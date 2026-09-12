import type { ClientRow } from "@/lib/store";
import { ENTITY_LABEL, type EntityType, type GstScheme } from "@/lib/compliance";
import type { Channel } from "@/lib/store";

const ENTITIES: EntityType[] = ["PROPRIETOR", "PARTNERSHIP", "LLP", "PVT_LTD", "TRUST", "INDIVIDUAL"];
const SCHEMES: Array<{ v: GstScheme; l: string }> = [
  { v: "NONE", l: "Not registered" },
  { v: "MONTHLY", l: "Regular (monthly)" },
  { v: "QRMP", l: "QRMP (quarterly)" },
  { v: "COMPOSITION", l: "Composition" },
];
const STATES = ["Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu", "Maharashtra", "Other"];
const CHANNELS: Array<{ v: Channel; l: string; hint: string }> = [
  { v: "WHATSAPP", l: "WhatsApp", hint: "Chases go to the number below" },
  { v: "EMAIL", l: "Email", hint: "Replies with attachments file themselves" },
  { v: "BOTH", l: "Both", hint: "Sent on both channels" },
];

export default function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (fd: FormData) => void;
  client?: ClientRow;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <fieldset className="card space-y-4 p-4">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Identity</legend>
        <div>
          <label className="label" htmlFor="name">
            Client name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={client?.name}
            placeholder="Sri Lakshmi Traders"
            className="field"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="entityType">
              Entity type
            </label>
            <select id="entityType" name="entityType" defaultValue={client?.entity_type ?? "PROPRIETOR"} className="field">
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {ENTITY_LABEL[e]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="state">
              State
            </label>
            <select id="state" name="state" defaultValue={client?.state ?? "Telangana"} className="field">
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pan">
              PAN
            </label>
            <input id="pan" name="pan" defaultValue={client?.pan ?? ""} placeholder="AABPL1234C" className="field font-mono uppercase" />
          </div>
          <div>
            <label className="label" htmlFor="directorCount">
              Directors / partners
            </label>
            <input
              id="directorCount"
              name="directorCount"
              type="number"
              min={0}
              defaultValue={client?.director_count ?? 0}
              className="field tnum"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="card space-y-4 p-4">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
          Registrations
        </legend>
        <p className="text-[12.5px] leading-snug text-ink-3">
          These flags decide which statutory deadlines get generated. Nothing else needs to be entered.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="gstScheme">
              GST scheme
            </label>
            <select id="gstScheme" name="gstScheme" defaultValue={client?.gst_scheme ?? "NONE"} className="field">
              {SCHEMES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="gstin">
              GSTIN
            </label>
            <input
              id="gstin"
              name="gstin"
              defaultValue={client?.gstin ?? ""}
              placeholder="36AABPL1234C1ZP"
              className="field font-mono uppercase"
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle name="tdsDeductor" label="Deducts TDS" hint="Adds monthly deposit and 24Q/26Q returns" checked={!!client?.tds_deductor} />
          <Toggle name="hasEmployees" label="Has employees" hint="Adds PF, ESI and professional tax" checked={!!client?.has_employees} />
          <Toggle name="taxAudit" label="Tax audit case" hint="Adds 3CD and shifts the ITR date to 31 Oct" checked={!!client?.tax_audit} />
        </div>
      </fieldset>

      <fieldset className="card space-y-4 p-4">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
          Who we chase
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="contactName">
              Contact person
            </label>
            <input id="contactName" name="contactName" defaultValue={client?.contact_name ?? ""} placeholder="Ravi Kumar" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="contactPhone">
              WhatsApp number
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              defaultValue={client?.contact_phone ?? ""}
              placeholder="+919848012345"
              className="field font-mono"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={client?.email ?? ""}
              placeholder="ravi@srilakshmitraders.com"
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="channel">
              How they send documents
            </label>
            <select id="channel" name="channel" defaultValue={client?.channel ?? "WHATSAPP"} className="field">
              {CHANNELS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.l} — {c.hint}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Toggle({ name, label, hint, checked }: { name: string; label: string; hint: string; checked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3 transition-colors hover:border-line-strong">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-4 w-4 accent-[color:var(--brand)]" />
      <span>
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        <span className="block text-[11.5px] leading-snug text-ink-3">{hint}</span>
      </span>
    </label>
  );
}
