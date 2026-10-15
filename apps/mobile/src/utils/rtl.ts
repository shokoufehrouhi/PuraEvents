import { I18nManager } from 'react-native';

/** Icon glyphs are drawn as-is, so React Native's RTL mirroring never
 *  turns them around. Directional ones (chevron-forward on a row, a back
 *  chevron) get this style to point the right way in fa/ar. */
export const flipInRTL = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;
