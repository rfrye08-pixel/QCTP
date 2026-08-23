export const SCHEDULE_NOTIFICATION_COPY = Object.freeze({
  title: "QCTP practice ready",
  body: "A scheduled QCTP practice is ready. Open QCTP to continue.",
});

export async function showBestEffortLocalNotification(
  title: string,
  body: string,
  tag: string,
): Promise<boolean> {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return false;
  const options: NotificationOptions = { body, tag };
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      }
    } catch {
      // A durable in-app record remains authoritative when delivery fails.
    }
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
