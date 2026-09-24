/**
 * The brand name as a heading, with the part after the last "." in
 * Azerconnect leaf green (--leaf) -- "One." in the heading colour,
 * "Simple" in green -- echoing the two-tone wordmark in the header.
 *
 * --leaf is #356d1b in light mode and #9ab68d in dark mode. It is one of the
 * tokens the theme editor's contrast gate checks at 4.5:1 against the page
 * surfaces on every save, so a heading in it stays readable whatever an
 * admin picks.
 *
 * A name with no "." renders in one colour -- nothing is guessed.
 */
export function BrandTitle({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return <>{name}</>;
  return (
    <>
      {name.slice(0, dot + 1)}
      <span style={{ color: "var(--leaf)" }}>{name.slice(dot + 1)}</span>
    </>
  );
}
