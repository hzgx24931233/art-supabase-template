import { addAPIProvider } from '@iconify/vue'

/**
 * Keep on-demand icon requests on the canonical Iconify endpoint.
 *
 * Iconify otherwise retries through SimpleSVG and UniSVG. Those fallback
 * endpoints are not consistently reachable in the deployed network and can
 * leave stale requests running while a route is being torn down.
 */
export function setupIconify(): void {
  addAPIProvider('', {
    resources: ['https://api.iconify.design']
  })
}
