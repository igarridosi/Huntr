import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";

export default function LegacyPortfolioRoutePage() {
  redirect(ROUTES.APP_PORTFOLIOS);
}
