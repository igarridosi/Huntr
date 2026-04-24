import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";

export default function LegacyInsightsRoutePage() {
  redirect(ROUTES.APP_INSIGHTS);
}
