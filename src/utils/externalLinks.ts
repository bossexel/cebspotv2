import { Alert, Linking } from 'react-native';
import { isValidAboutLink, type AboutLink } from '../constants/about';

// Shared by locally bundled information screens; never attaches user data.
export async function openInformationLink(link: AboutLink) {
  if (!isValidAboutLink(link.url)) return;
  try {
    await Linking.openURL(link.url);
  } catch {
    Alert.alert('Unable to open link', 'Please try again or check that an app is available to open this link.');
  }
}
