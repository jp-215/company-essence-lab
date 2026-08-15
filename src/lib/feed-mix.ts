/** Alternate two ranked lists so a feed stays balanced between video and chatter. */
export function interleave<A, B>(a: A[], b: B[], total: number): Array<A | B> {
  const out: Array<A | B> = [];
  let i = 0;
  let j = 0;
  while (out.length < total && (i < a.length || j < b.length)) {
    if (i < a.length) out.push(a[i++]!);
    if (out.length < total && j < b.length) out.push(b[j++]!);
  }
  return out.slice(0, total);
}
