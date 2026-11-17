import { useEffect, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [installRequested, setInstallRequested] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) {
      setInstalled(true)
      return
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setShowBanner(true)
      setInstallRequested(false)
    }
    const handleInstalled = () => {
      setInstalled(true)
      setShowBanner(false)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    // Dismiss only this display; never persist the choice across visits.
    setShowBanner(false)
  }

  const install = async () => {
    if (!installPrompt || installRequested) return
    const prompt = installPrompt
    setInstallPrompt(null)
    setInstallRequested(true)
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'dismissed') {
      // The browser prompt was declined, not installed. Keep the banner visible.
      setInstallRequested(false)
    }
    // Only the appinstalled event (or standalone mode on the next launch)
    // is allowed to mark the app as installed and remove the banner.
  }

  if (installed || !showBanner) return null

  return (
    <aside className="pwa-install-prompt" role="status" aria-label="Install UFLMB">
      <img src={`${import.meta.env.BASE_URL}app-banner-icon.svg`} alt="" width="42" height="42" />
      <div className="pwa-install-copy">
        <strong>Install UFLMB</strong>
        <span>Add the database to your home screen.</span>
      </div>
      <button className="pwa-install-action" type="button" onClick={() => void install()} disabled={!installPrompt || installRequested}>
        {installRequested ? 'Waiting…' : installPrompt ? 'Install' : 'Refresh to try again'}
      </button>
      <button className="pwa-install-dismiss" type="button" aria-label="Not now" onClick={dismiss}>×</button>
    </aside>
  )
}
