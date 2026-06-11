import { redirect } from "next/navigation";

// The Daily Brief at / is the dashboard. Keep /dashboard as an alias.
export default function DashboardAlias() {
  redirect("/");
}
