/**
 * Drops a trailing parenthetical on small screens.
 *
 * Company names arrive from the API carrying qualifiers — "Alphabet Inc.
 * (Class A)", "Taiwan Semiconductor Manufacturing (ADR)" — which are the first
 * thing to overflow a phone-width row while adding the least information. The
 * text stays in the DOM so it is still read out and still searchable; only its
 * display is dropped below `sm`.
 */
export function CompactLabel({ text }: { text: string }) {
  const match = text.match(/^(.*\S)\s*(\([^()]*\))\s*$/);

  if (!match) return <>{text}</>;

  const [, head, parenthetical] = match;

  return (
    <>
      {head}
      <span className="hidden sm:inline"> {parenthetical}</span>
    </>
  );
}
