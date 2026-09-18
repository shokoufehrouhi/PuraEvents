const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// react-native-share's own bundled res/xml/share_download_paths.xml (the
// FileProvider <paths> its RNShareFileProvider exposes, see
// node_modules/react-native-share/android/src/main/res/xml) only declares
// <external-path path="Download/"> (public Downloads) and <cache-path
// path="/"> (internal cache, getCacheDir()) — but the base64 `urls` case
// (see event/[id]/index.tsx's handleShare, used whenever a voice message
// is attached) writes its temp files under getExternalCacheDir()/Download/
// instead (confirmed live on a real device: RNSharePathUtil::
// compatUriFromFile fails to resolve a content:// URI for that path,
// silently producing a broken share Intent — WhatsApp errors, Telegram
// opens with nothing attached). Android resource merging lets an app
// module's res/xml/share_download_paths.xml *replace* the library's own
// same-named one outright, so re-declaring it here (with an added
// <external-cache-path>) is enough — no patch-package needed.
module.exports = function withShareDownloadPaths(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'share_download_paths.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="rnshare1" path="Download/" />
    <cache-path name="rnshare2" path="/" />
    <external-cache-path name="rnshare3" path="." />
</paths>
`
      );
      return config;
    },
  ]);
};
