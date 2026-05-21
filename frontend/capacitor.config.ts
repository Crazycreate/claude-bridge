import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web app (`dist/`) into a native Android shell.
 *
 * Bridge servers normally run plain HTTP on a LAN address or a tunnel, so the
 * app is served over the `http` scheme and cleartext is allowed — otherwise
 * Android would block every request to the server as insecure. The server URL
 * itself is entered by the user on first launch (see TokenGate / lib/server).
 */
const config: CapacitorConfig = {
  appId: 'dev.claudebridge.app',
  appName: 'Claude Bridge',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
