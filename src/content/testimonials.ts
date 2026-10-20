/**
 * Customer testimonials.
 *
 * BizManager is pre-launch: there are no confirmed customers, so this list is
 * intentionally EMPTY and the section renders nothing. Add an entry only when a
 * real customer has given written permission to publish their words and name.
 */
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  business: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [];
