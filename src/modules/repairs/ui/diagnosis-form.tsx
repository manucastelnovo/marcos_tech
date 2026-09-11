"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateDiagnosisAction } from "../actions";

export function DiagnosisForm({
  repairId,
  technicalDiagnosis,
  workToPerform,
  partsNeeded,
}: {
  repairId: string;
  technicalDiagnosis: string | null;
  workToPerform: string | null;
  partsNeeded: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    technicalDiagnosis: technicalDiagnosis ?? "",
    workToPerform: workToPerform ?? "",
    partsNeeded: partsNeeded ?? "",
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateDiagnosisAction({ repairId, ...form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Diagnóstico guardado");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="technicalDiagnosis">Diagnóstico técnico</Label>
        <Textarea
          id="technicalDiagnosis"
          rows={3}
          value={form.technicalDiagnosis}
          onChange={(event) =>
            setForm((current) => ({ ...current, technicalDiagnosis: event.target.value }))
          }
          placeholder="Pin de carga sulfatado, batería al 71%"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workToPerform">Reparación realizada</Label>
        <Textarea
          id="workToPerform"
          rows={3}
          value={form.workToPerform}
          onChange={(event) =>
            setForm((current) => ({ ...current, workToPerform: event.target.value }))
          }
          placeholder="Cambio de pin de carga y limpieza de placa"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="partsNeeded">Repuestos utilizados</Label>
        <Textarea
          id="partsNeeded"
          rows={2}
          value={form.partsNeeded}
          onChange={(event) =>
            setForm((current) => ({ ...current, partsNeeded: event.target.value }))
          }
          placeholder="Pin de carga iPhone 13"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar diagnóstico"}
      </Button>
    </form>
  );
}
