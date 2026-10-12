import { checkoutHandler } from '../_shared/durableCheckout.ts';
Deno.serve(checkoutHandler('qrph'));
