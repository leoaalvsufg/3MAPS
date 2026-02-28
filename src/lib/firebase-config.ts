/**
 * Firebase config check — lightweight, no Firebase SDK import.
 * Use this for isFirebaseConfigured() to avoid loading the SDK when Firebase is not used.
 */
export function isFirebaseConfigured(): boolean {
  return !!(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_APP_ID);
}
