import { redirect } from "next/navigation";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { getDeviceCatalog, listTechnicians } from "@/modules/repairs/application/catalog";
import { IntakeForm } from "@/modules/repairs/ui/intake-form";

export default async function NewRepairPage() {
  const user = await requirePageUser();
  if (!can(user.role, "repair.create")) redirect("/reparaciones");

  const [catalog, technicians] = await Promise.all([getDeviceCatalog(), listTechnicians()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recibir equipo</h1>
        <p className="text-muted-foreground text-sm">
          Empezá por el teléfono del cliente. El resto es opcional salvo marca, modelo y falla.
        </p>
      </div>

      <IntakeForm catalog={catalog} technicians={technicians} />
    </div>
  );
}
