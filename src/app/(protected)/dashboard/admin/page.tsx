import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page-authorization";

export default async function AdminPage() {
  await requireAdminPage();
  redirect("/dashboard/admin/fleet");
}
