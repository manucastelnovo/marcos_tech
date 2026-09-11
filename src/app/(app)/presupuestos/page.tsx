import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDate } from "@/shared/domain/datetime";
import { formatMoney } from "@/shared/ui/money-text";
import { listQuotes } from "@/modules/quotes/application/queries";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  isExpired,
  type QuoteStatus,
} from "@/modules/quotes/domain/quote";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "quote.view")) redirect("/");

  const params = await searchParams;
  const status = isQuoteStatus(params.estado) ? params.estado : undefined;
  const quotes = await listQuotes({ status, search: params.q });
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presupuestos</h1>
          <p className="text-muted-foreground text-sm">
            Precios para clientes que todavía no dejaron el equipo.
          </p>
        </div>
        {can(user.role, "quote.manage") ? (
          <Button render={<Link href="/presupuestos/nuevo" />}>Nuevo presupuesto</Button>
        ) : null}
      </div>

      <form className="flex gap-2" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Número, equipo, cliente o teléfono"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip href="/presupuestos" label="Todos" active={!params.estado} />
        {QUOTE_STATUSES.map((option) => (
          <Chip
            key={option}
            href={`/presupuestos?estado=${option}`}
            label={QUOTE_STATUS_LABEL[option]}
            active={params.estado === option}
          />
        ))}
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            No hay presupuestos que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {quotes.map((quote) => (
            <Link key={quote.id} href={`/presupuestos/${quote.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <span className="font-mono text-sm font-semibold">{quote.number}</span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {quote.brandName} {quote.modelName}
                    </div>
                    <div className="text-muted-foreground truncate text-sm">
                      {quote.customerLabel} · {formatDate(quote.createdAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {quote.status === "PENDING" && isExpired(quote.validUntil, now) ? (
                      <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700">
                        Vencido
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        QUOTE_STATUS_TONE[quote.status],
                      )}
                    >
                      {QUOTE_STATUS_LABEL[quote.status]}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(quote.total, quote.currency)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
}

function isQuoteStatus(value: string | undefined): value is QuoteStatus {
  return Boolean(value) && (QUOTE_STATUSES as readonly string[]).includes(value as string);
}
