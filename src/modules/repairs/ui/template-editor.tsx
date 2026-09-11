"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateTemplateAction } from "../actions";

/**
 * Editing what the shop says to its customers.
 *
 * The placeholders are listed above the box rather than hidden in a manual,
 * because a template that silently prints "{{cliente}}" to a real customer is
 * worse than no template at all.
 */
export function TemplateEditor({
  templateKey,
  label,
  body,
}: {
  templateKey: string;
  label: string;
  body: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ label, body });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateTemplateAction({ key: templateKey, ...form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Plantilla guardada");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`label-${templateKey}`}>Nombre del botón</Label>
        <Input
          id={`label-${templateKey}`}
          value={form.label}
          onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`body-${templateKey}`}>Mensaje</Label>
        <Textarea
          id={`body-${templateKey}`}
          rows={3}
          value={form.body}
          onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
        />
      </div>

      <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
