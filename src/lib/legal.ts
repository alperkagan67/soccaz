/** Angaben zum Betreiber kommen aus der Umgebung, damit nichts Erfundenes im Code steht. */
export function operator() {
  const name = process.env.OPERATOR_NAME?.trim();
  const address = process.env.OPERATOR_ADDRESS?.trim();
  const email = process.env.OPERATOR_EMAIL?.trim();
  return { name, address, email, complete: Boolean(name && address && email) };
}
