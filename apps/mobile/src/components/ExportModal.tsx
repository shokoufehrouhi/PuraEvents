import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import type { ExportDestination, ExportFormat } from '../utils/dataTransfer';
import { Button } from './ui/Button';

interface Props {
  visible: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, destination: ExportDestination) => void;
}

const FORMATS: { key: ExportFormat; icon: keyof typeof Ionicons.glyphMap; label: string; description: string }[] = [
  { key: 'xlsx', icon: 'grid-outline', label: 'dataExport.excelLabel', description: 'dataExport.excelDescription' },
  { key: 'json', icon: 'code-slash-outline', label: 'dataExport.jsonLabel', description: 'dataExport.jsonDescription' },
];

// One sheet for the whole export: pick the format (Excel preselected), then
// either save it straight to the phone or share it. iOS only gets Share —
// its share sheet already has "Save to Files". Same Modal/backdrop/card
// grammar as ConfirmModal/AppAlertModal.
export function ExportModal({ visible, onClose, onExport }: Props) {
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const [format, setFormat] = useState<ExportFormat>('xlsx');

  // Back to the default on every close, so the next open starts on Excel
  // rather than whatever was picked last.
  function close() {
    setFormat('xlsx');
    onClose();
  }

  function choose(destination: ExportDestination) {
    close();
    onExport(format, destination);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
        onPress={close}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
          <Text style={[typography.headline, { color: colors.text }]}>{t('dataExport.title')}</Text>
          <Text style={[typography.body, { color: colors.secondary, marginTop: 8 }]}>{t('dataExport.chooseMessage')}</Text>

          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {FORMATS.map((option) => {
              const selected = option.key === format;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setFormat(option.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: spacing.sm,
                    borderRadius: radius.md,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? colors.primary : colors.outline,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surfaceAlt,
                    }}
                  >
                    <Ionicons name={option.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{t(option.label)}</Text>
                    <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{t(option.description)}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? colors.primary : colors.secondary}
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', marginTop: spacing.lg }}>
            {Platform.OS === 'android' ? (
              <>
                <Button label={t('dataExport.shareLabel')} variant="secondary" onPress={() => choose('share')} style={{ flex: 1, marginRight: 8 }} />
                <Button label={t('dataExport.saveLabel')} onPress={() => choose('device')} style={{ flex: 1, marginLeft: 8 }} />
              </>
            ) : (
              <Button label={t('dataExport.shareLabel')} onPress={() => choose('share')} style={{ flex: 1 }} />
            )}
          </View>
          <Pressable onPress={close} hitSlop={8} style={{ alignItems: 'center', marginTop: spacing.md }}>
            <Text style={[typography.bodyStrong, { color: colors.secondary }]}>{t('manage.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
