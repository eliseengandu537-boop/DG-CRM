export async function playNotificationSound(): Promise<void> {
  if (typeof window === 'undefined') return;

  const audio = new Audio('/universfield-new-notification-021-370045.mp3');
  try {
    await audio.play();
    return;
  } catch {
    // Fallback beep when audio file cannot autoplay/load.
  }

  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    if (context.state === 'suspended') {
      await context.resume();
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  } catch {
    // Silent fallback keeps UI stable if audio is unavailable.
  }
}
