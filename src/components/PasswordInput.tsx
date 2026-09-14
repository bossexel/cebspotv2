import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type StyleProp, type TextInputProps, type ViewStyle, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { radius, spacing } from '../constants/design';
import { useTheme } from '../hooks/useTheme';

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'> & {
  containerStyle?: StyleProp<ViewStyle>;
};

export function PasswordInput({ containerStyle, style, ...props }: PasswordInputProps) {
  const { appColors } = useTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: appColors.inputSurface, borderColor: appColors.inputBorder },
        containerStyle,
      ]}
    >
      <TextInput
        {...props}
        secureTextEntry={!passwordVisible}
        placeholderTextColor={props.placeholderTextColor ?? appColors.onSurfaceVariant}
        selectionColor={appColors.primary}
        style={[styles.input, { color: appColors.onSurface }, style]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
        accessibilityState={{ expanded: passwordVisible }}
        hitSlop={8}
        onPress={() => setPasswordVisible((visible) => !visible)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        {passwordVisible ? (
          <EyeOff size={20} color={appColors.onSurfaceVariant} />
        ) : (
          <Eye size={20} color={appColors.onSurfaceVariant} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    fontSize: 16,
    fontWeight: '700',
  },
  toggle: {
    width: 48,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
});
