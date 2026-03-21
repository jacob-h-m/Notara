;(function () {
  const splash = document.getElementById('boot-splash')
  function hideSplash() {
    if (!splash) return
    splash.classList.add('is-hidden')
    setTimeout(function () {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash)
    }, 220)
  }

  try {
    window.addEventListener('notara:app-ready', hideSplash, { once: true } as EventListenerOptions)
  } catch {
    // ignore if options object isn't supported
    window.addEventListener('notara:app-ready', hideSplash)
  }

  // Fallback in case the ready event never fires
  setTimeout(hideSplash, 5000)
})()
