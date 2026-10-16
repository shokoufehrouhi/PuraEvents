// Sentry's Expo Metro config: gives every bundle and its source map a
// matching Debug ID, so crash reports in Sentry point at the real source
// lines instead of the minified bundle.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
