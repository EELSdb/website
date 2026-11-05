// Forwards mail for info@eelsdb.eu to each address in the FORWARD_TO secret (comma-separated, so personal addresses
// stay out of the repo). Each must be a verified Email Routing destination address in the Cloudflare account.
export default {
  async email(message, env) {
    let delivered = 0;
    for (const to of (env.FORWARD_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      try {
        await message.forward(to);
        delivered++;
      } catch (e) {
        console.error(`Forward to ${to} failed:`, e instanceof Error ? e.message : e);
      }
    }
    // The sender gets a bounce rather than silence.
    if (!delivered) message.setReject("This address cannot take mail right now.");
  },
};
