import { useEffect } from 'react'

/**
 * Cloudflare Web Analytics is optional until the site owner creates a site
 * in Cloudflare and supplies its public beacon token at build time.
 * The token is a public site identifier, not an API credential.
 */
export default function PrivacyAnalytics() {
  useEffect(() => {
    const token = import.meta.env.VITE_CF_WEB_ANALYTICS_TOKEN?.trim()
    if (!import.meta.env.PROD || !token) return

    const existing = document.querySelector<HTMLScriptElement>('script[data-uflmb-cloudflare-analytics]')
    if (existing) return

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.defer = true
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
    script.dataset.uflmbCloudflareAnalytics = 'true'
    script.dataset.cfBeacon = JSON.stringify({ token })
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
  }, [])

  return null
}
