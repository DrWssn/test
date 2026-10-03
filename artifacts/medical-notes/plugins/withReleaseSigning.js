// Signs release builds with the keystore at $ANDROID_KEYSTORE_PATH (PKCS12) when that variable is set.
// Without it, release builds fall back to the debug key, as the Expo template does.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING_CONFIG = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storeType 'pkcs12'
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS') ?: 'medicalnotes'
                keyPassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes("System.getenv('ANDROID_KEYSTORE_PATH')")) return config;

    // Point the release build type at the release signing config. Done before adding the signingConfigs
    // release block below, so this matches buildTypes { release { ... } } and not that block.
    const releaseBuildType = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!releaseBuildType.test(gradle)) throw new Error('withReleaseSigning: release signingConfig not found in build.gradle');
    gradle = gradle.replace(
      releaseBuildType,
      "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );

    if (!/signingConfigs\s*\{/.test(gradle)) throw new Error('withReleaseSigning: signingConfigs block not found in build.gradle');
    gradle = gradle.replace(/signingConfigs\s*\{/, (match) => match + RELEASE_SIGNING_CONFIG);

    config.modResults.contents = gradle;
    return config;
  });
};
