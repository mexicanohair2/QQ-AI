import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.qqai.app",
  appName: "QQ AI",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
