export default {
  expo: {
    name: '信用デモ取引', slug: 'shinyo-demo-trade', version: '1.3.0',
    icon: './assets/icon.png',
    orientation: 'portrait', userInterfaceStyle: 'dark',
    ios: { bundleIdentifier: 'jp.example.shinyodemotrade', supportsTablet: true, infoPlist: { ITSAppUsesNonExemptEncryption: false } },
    android: { package: 'jp.example.shinyodemotrade', versionCode: 1, allowBackup: false, adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#164d48' } },
    web: { bundler: 'metro' },
    experiments: { baseUrl: process.env.EXPO_PUBLIC_BASE_PATH ?? '' }
  }
};
