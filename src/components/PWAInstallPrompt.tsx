import { useEffect, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

const DISMISSED_KEY = 'uflmb.pwa-install-dismissed.v2'

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) {
      setInstalled(true)
      return
    }

    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === '1') return
    } catch {
      // The install prompt can still work when storage is unavailable.
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      try { window.localStorage.removeItem(DISMISSED_KEY) } catch { /* Ignore storage restrictions. */ }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISSED_KEY, '1') } catch { /* Ignore storage restrictions. */ }
    setInstallPrompt(null)
  }

  const install = async () => {
    if (!installPrompt) return
    const prompt = installPrompt
    setInstallPrompt(null)
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstalled(true)
    } else {
      try { window.localStorage.setItem(DISMISSED_KEY, '1') } catch { /* Ignore storage restrictions. */ }
    }
  }

  if (!installPrompt || installed) return null

  return (
    <aside className="pwa-install-prompt" role="status" aria-label="Install UFLMB">
      <img src={`${import.meta.env.BASE_URL}app-icon.svg`} alt="" width="42" height="42" />
      <div className="pwa-install-copy">
        <strong>Install UFLMB</strong>
        <span>Add the database to your home screen.</span>
      </div>
      <button className="pwa-install-action" type="button" onClick={() => void install()}>Install</button>
      <button className="pwa-install-dismiss" type="button" aria-label="Not now" onClick={dismiss}>×</button>
    </aside>
  )
}
