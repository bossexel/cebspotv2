import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { radius, spacing } from '../constants/design';

export function SpotEditSuggestionModal({ visible, onClose, mapInteracting, children }: {
  visible: boolean; onClose: () => void; mapInteracting: boolean; children: React.ReactNode;
}) {
  const { appColors } = useTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss edit suggestion" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: appColors.surface }]}>
        <ScrollView testID="edit-suggestion-scroll" scrollEnabled={!mapInteracting}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, overflow: 'hidden' },
  content: { padding: spacing.xl, gap: spacing.lg },
});
