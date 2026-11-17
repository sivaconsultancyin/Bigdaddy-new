import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

export async function initAndroidNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#050608' });
  } catch {
    // Ignore on platforms where StatusBar API is restricted
  }
}

export function registerAndroidBackHandler(onBack: () => boolean) {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  let removed = false;
  let handleRef: { remove: () => Promise<void> } | null = null;

  void CapApp.addListener('backButton', ({ canGoBack }) => {
    const handled = onBack();
    if (handled) return;
    if (canGoBack) {
      window.history.back();
      return;
    }
    void CapApp.minimizeApp();
  }).then((handle) => {
    if (removed) {
      void handle.remove();
    } else {
      handleRef = handle;
    }
  });

  return () => {
    removed = true;
    if (handleRef) {
      void handleRef.remove();
      handleRef = null;
    }
  };
}
