const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Android Auto Backup (allowBackup is already on) copies the app's data to
// the user's Google Drive roughly once a day and restores it on a reinstall
// or a new phone. Cloud backups are capped at 25MB, and going over skips
// the *whole* backup — so instead of "everything", these rules name what
// actually matters:
//  - database: AsyncStorage's RKStorage (events, widgets, preferences,
//    saved language, notification history).
//  - sharedpref: native-side state (RevenueCat's user id, the RTL flag).
//  - file/event-sounds: recorded voice messages (small m4a files).
// widget-photos/ (picked photos and downloaded Pexels images, a few MB
// each) is left out of cloud backup so a handful of photos can't push it
// past the cap; a widget whose photo didn't come back falls back to its
// plain look. A direct phone-to-phone transfer has no such cap, so it
// takes the photos too.
const INCLUDES = `        <include domain="database" path="." />
        <include domain="sharedpref" path="." />
        <include domain="file" path="event-sounds/" />`;

// Android 11 and below.
const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${INCLUDES.replace(/^ {4}/gm, '')}
</full-backup-content>
`;

// Android 12+ (ignores the file above).
const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
${INCLUDES}
    </cloud-backup>
    <device-transfer>
${INCLUDES}
        <include domain="file" path="widget-photos/" />
    </device-transfer>
</data-extraction-rules>
`;

function withBackupRuleFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'backup_rules.xml'), FULL_BACKUP_CONTENT);
      fs.writeFileSync(path.join(dir, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
      return config;
    },
  ]);
}

module.exports = function withBackupRules(config) {
  config = withBackupRuleFiles(config);
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = '@xml/backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return config;
  });
};
