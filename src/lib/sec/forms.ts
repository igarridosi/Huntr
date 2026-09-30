/**
 * The forms whose figures the app accepts: reviewed statements. One list,
 * read by the app's selection and by the ingest pipeline's filter, and
 * checked against the CHECK constraint on sec_company_facts.form by a test.
 */
export const REVIEWED_FORMS = ["10-K", "10-Q", "10-K/A", "10-Q/A", "20-F", "40-F"] as const;

export type ReviewedForm = (typeof REVIEWED_FORMS)[number];

export function isReviewedForm(form: string): form is ReviewedForm {
  return (REVIEWED_FORMS as readonly string[]).includes(form);
}
