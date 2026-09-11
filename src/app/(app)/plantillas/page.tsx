import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { listWhatsAppTemplates } from "@/modules/repairs/application/catalog";
import { TEMPLATE_VARIABLES } from "@/modules/repairs/application/templates";
import { TemplateEditor } from "@/modules/repairs/ui/template-editor";

export default async function TemplatesPage() {
  const user = await requirePageUser();
  if (!can(user.role, "template.manage")) redirect("/");

  const templates = await listWhatsAppTemplates();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mensajes de WhatsApp</h1>
        <p className="text-muted-foreground text-sm">
          Estos textos aparecen como botones en la ficha de cada reparación. Se abren en
          WhatsApp ya escritos, y la persona sigue apretando enviar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos que se reemplazan solos</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {TEMPLATE_VARIABLES.map((variable) => (
              <li key={variable.token} className="flex items-baseline gap-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{variable.token}</code>
                <span className="text-muted-foreground text-xs">{variable.description}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {templates.map((template) => (
          <Card key={template.key}>
            <CardHeader>
              <CardTitle>{template.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <TemplateEditor
                templateKey={template.key}
                label={template.label}
                body={template.body}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
