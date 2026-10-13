const { withAppBuildGradle } = require('expo/config-plugins');

// Signs Android release builds with the Play upload key instead of the
// template's debug keystore. The key itself never lives in this repo: the
// Gradle property `puraeventsKeystoreProperties` (set in
// ~/.gradle/gradle.properties) points at a keystore.properties file
// holding storeFile/storePassword/keyAlias/keyPassword. Without it, release
// builds fall back to debug signing, so a fresh clone still builds.
const LOAD_PROPS = `
def puraeventsKeystoreProps = new Properties()
def puraeventsKeystorePropsPath = findProperty('puraeventsKeystoreProperties')
if (puraeventsKeystorePropsPath && file(puraeventsKeystorePropsPath).exists()) {
    file(puraeventsKeystorePropsPath).withInputStream { puraeventsKeystoreProps.load(it) }
}
`;

const RELEASE_SIGNING_CONFIG = `signingConfigs {
        release {
            if (puraeventsKeystoreProps['storeFile']) {
                storeFile file(puraeventsKeystoreProps['storeFile'])
                storePassword puraeventsKeystoreProps['storePassword']
                keyAlias puraeventsKeystoreProps['keyAlias']
                keyPassword puraeventsKeystoreProps['keyPassword']
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes('puraeventsKeystoreProps')) return config;

    gradle = gradle.replace(/\nandroid \{/, `${LOAD_PROPS}\nandroid {`);
    gradle = gradle.replace(/signingConfigs \{/, RELEASE_SIGNING_CONFIG);
    gradle = gradle.replace(
      /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig puraeventsKeystoreProps['storeFile'] ? signingConfigs.release : signingConfigs.debug"
    );
    config.modResults.contents = gradle;
    return config;
  });
};
