import { Alert, Platform, type AlertButton } from 'react-native';

// React Native Web's Alert is a no-op. The retained admin site needs visible
// errors and a real decision before executing its two-button confirmations.
export const platformAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') return Alert.alert(title, message, buttons);
    const text = [title, message].filter(Boolean).join('\n\n');
    const cancel = buttons?.find((button) => button.style === 'cancel');
    const action = buttons?.find((button) => button.style !== 'cancel');
    if (buttons && buttons.length > 1) {
      if (window.confirm(text)) action?.onPress?.();
      else cancel?.onPress?.();
    } else {
      window.alert(text);
      action?.onPress?.();
    }
  },
};
