import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, Compass, MapPin, Plus, Search, Users } from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { radius, shadow, spacing } from '../../constants/design';

const logo = require('../../../assets/cebspot-logo.png');

type Props = { scene: number; height: number; reducedMotion: boolean };

export function GuideArtwork({ scene, height, reducedMotion }: Props) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    float.setValue(0);
    if (reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [float, reducedMotion, scene]);

  const lift = { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) }] };

  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={[styles.canvas, { height, backgroundColor: scene === 1 ? colors.secondary : colors.primary }]}>
    {scene === 0 ? <>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 380 320" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="mapWash" x1="0" y1="0" x2="1" y2="1">
            <Stop offset={0} stopColor="#F9C98F" /><Stop offset={0.55} stopColor="#F6E5C7" /><Stop offset={1} stopColor="#A8D6DC" />
          </LinearGradient>
        </Defs>
        <Rect width="380" height="320" fill="url(#mapWash)" />
        <Path d="M-35 240 C36 208 46 195 101 197 C169 203 188 228 258 207 C311 192 340 205 408 231 L408 343 L-35 343Z" fill="#80C9D4" />
        <Path d="M-30 80 C20 64 47 60 88 86 C137 116 162 126 221 113 C268 103 296 79 408 91" stroke="#FFFFFF" strokeWidth="20" fill="none" opacity={0.94} />
        <Path d="M18 -28 C36 42 47 94 112 151 C165 196 196 226 216 350" stroke="#FFFFFF" strokeWidth="17" fill="none" opacity={0.93} />
        <Path d="M238 -20 C252 45 251 99 278 145 C303 188 337 205 408 224" stroke="#FFFFFF" strokeWidth="13" fill="none" opacity={0.9} />
        <Path d="M-30 169 C50 154 93 168 149 142 C204 116 255 128 409 151" stroke="#FFFFFF" strokeWidth="13" fill="none" opacity={0.9} />
        <Path d="M33 19 L83 13 L87 54 L51 61Z M130 25 L213 31 L217 72 L167 81 L128 62Z M314 26 L362 29 L352 68 L306 65Z M35 115 L69 126 L64 155 L25 154Z M205 164 L259 162 L273 190 L224 201Z" fill="#8CC878" opacity={0.85} />
        <Path d="M160 57 C205 75 168 127 218 145 C244 156 232 188 264 218" stroke={colors.primary} strokeWidth="6" strokeDasharray="2 13" strokeLinecap="round" fill="none" />
        <Circle cx="157" cy="59" r="14" fill={colors.secondary} /><Circle cx="157" cy="59" r="5" fill={colors.white} />
        <Circle cx="267" cy="222" r="23" fill={colors.primary} /><Circle cx="267" cy="222" r="13" fill={colors.white} /><Circle cx="267" cy="222" r="5" fill={colors.primary} />
      </Svg>
      <View style={styles.mapCorner}><Compass size={16} color={colors.secondary} /><Text style={styles.mapCornerText}>CEBU, PH</Text></View>
      <Animated.View style={[styles.mapTag, lift]}>
        <View style={styles.tagIcon}><MapPin size={18} color={colors.white} fill={colors.primary} /></View>
        <View><Text style={styles.tagEyebrow}>YOUR NEXT STOP</Text><Text style={styles.tagTitle}>Somewhere worth finding</Text></View>
      </Animated.View>
    </> : scene === 1 ? <>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 380 320" preserveAspectRatio="xMidYMid slice">
        <Defs><LinearGradient id="nightWash" x1="0" y1="0" x2="1" y2="1"><Stop offset={0} stopColor="#153B55" /><Stop offset={1} stopColor={colors.secondary} /></LinearGradient></Defs>
        <Rect width="380" height="320" fill="url(#nightWash)" />
        <Path d="M-20 72 C55 106 100 97 148 70 C201 40 233 33 400 66 M-15 179 C95 152 133 171 199 211 C243 238 305 241 406 184 M68 -20 C50 80 112 131 104 350 M283 -20 C302 79 253 139 321 350" fill="none" stroke="#376075" strokeWidth="20" opacity={0.65} />
        <Path d="M-20 72 C55 106 100 97 148 70 C201 40 233 33 400 66 M-15 179 C95 152 133 171 199 211 C243 238 305 241 406 184 M68 -20 C50 80 112 131 104 350 M283 -20 C302 79 253 139 321 350" fill="none" stroke="#91A9AD" strokeWidth="2" opacity={0.45} />
        <Circle cx="288" cy="143" r="57" stroke={colors.primary} strokeWidth="1.5" fill="none" opacity={0.5} />
        <Circle cx="288" cy="143" r="37" stroke={colors.primary} strokeWidth="1.5" fill="none" opacity={0.8} />
        <Circle cx="288" cy="143" r="17" fill={colors.primary} /><Circle cx="288" cy="143" r="6" fill={colors.white} />
        <Circle cx="116" cy="229" r="11" fill="#76BFC8" /><Circle cx="116" cy="229" r="4" fill={colors.white} />
      </Svg>
      <View style={styles.searchSceneLabel}><Text style={styles.searchSceneLabelText}>FIND YOUR THING</Text></View>
      <Animated.View style={[styles.searchSceneCard, lift]}>
        <View style={styles.searchSceneInput}><Search size={18} color={colors.primary} /><Text style={styles.searchScenePlaceholder}>Search spots...</Text></View>
        <View style={styles.chipRow}><View style={styles.chipPrimary}><Text style={styles.chipPrimaryText}>Outdoor</Text></View><View style={styles.chipNeutral}><Text style={styles.chipNeutralText}>Specialty Coffee</Text></View></View>
        <View style={styles.searchSceneFooter}><Text style={styles.searchSceneFooterText}>Follow your curiosity</Text><ArrowUpRight size={18} color={colors.primary} /></View>
      </Animated.View>
    </> : <>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 380 320" preserveAspectRatio="xMidYMid slice">
        <Defs><LinearGradient id="socialWash" x1="0" y1="0" x2="1" y2="1"><Stop offset={0} stopColor="#FF9C43" /><Stop offset={0.55} stopColor={colors.primary} /><Stop offset={1} stopColor="#D44B00" /></LinearGradient></Defs>
        <Rect width="380" height="320" fill="url(#socialWash)" />
        <Circle cx="315" cy="82" r="105" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity={0.45} />
        <Circle cx="315" cy="82" r="79" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity={0.45} />
        <Circle cx="315" cy="82" r="50" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity={0.5} />
        <Path d="M-20 258 C75 191 137 248 214 197 C282 152 300 142 403 157" stroke="#FFCC99" strokeWidth="24" opacity={0.25} fill="none" />
        <Circle cx="47" cy="246" r="9" fill={colors.white} /><Circle cx="332" cy="83" r="8" fill={colors.white} />
      </Svg>
      <View style={styles.socialSceneLabel}><Text style={styles.socialSceneLabelText}>GOOD PLACES TRAVEL</Text></View>
      <Animated.View style={[styles.socialStack, lift]}>
        <View style={styles.socialMainCard}>
          <View style={styles.socialIcon}><Plus size={24} strokeWidth={2.6} color={colors.white} /></View>
          <View><Text style={styles.socialOverline}>A PLACE WORTH SHARING</Text><Text style={styles.socialTitle}>Put it on the map.</Text></View>
        </View>
        <View style={styles.socialSubCard}><View style={styles.socialGroupIcon}><Users size={18} color={colors.white} /></View><Text style={styles.socialSubText}>Bring your Circle along</Text><ArrowUpRight size={17} color={colors.secondary} /></View>
      </Animated.View>
    </>}
    {scene === 0 && <Image source={logo} style={styles.mapLogo} resizeMode="contain" />}
  </View>;
}

const styles = StyleSheet.create({
  canvas: { borderRadius: radius.xxl, overflow: 'hidden', width: '100%', position: 'relative' },
  mapCorner: { position: 'absolute', top: spacing.lg, left: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 35, borderRadius: radius.pill, backgroundColor: '#FFFFFFE8' },
  mapCornerText: { color: colors.secondary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 10, letterSpacing: 1.1 },
  mapLogo: { width: 63, height: 76, position: 'absolute', top: '29%', left: '37%' },
  mapTag: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, height: 70, borderRadius: radius.lg, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, ...shadow.lifted },
  tagIcon: { backgroundColor: colors.primary, width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tagEyebrow: { color: colors.primary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 9, letterSpacing: 1.2 },
  tagTitle: { color: colors.secondary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 13, marginTop: 3 },
  searchSceneLabel: { position: 'absolute', top: spacing.lg, left: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 8 },
  searchSceneLabelText: { color: colors.white, fontFamily: 'Montserrat_800ExtraBold', fontSize: 11, letterSpacing: 1.3 },
  searchSceneCard: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.white, padding: spacing.md, borderRadius: radius.xl, ...shadow.lifted },
  searchSceneInput: { borderRadius: radius.md, minHeight: 43, backgroundColor: colors.surfaceLow, flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 12 },
  searchScenePlaceholder: { color: colors.onSurfaceVariant, fontFamily: 'Montserrat_400Regular', fontSize: 13 },
  chipRow: { flexDirection: 'row', gap: 7, marginTop: 10, flexWrap: 'wrap' },
  chipPrimary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  chipPrimaryText: { color: colors.white, fontFamily: 'Montserrat_700Bold', fontSize: 10 },
  chipNeutral: { backgroundColor: colors.surfaceLow, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  chipNeutralText: { color: colors.secondary, fontFamily: 'Montserrat_700Bold', fontSize: 10 },
  searchSceneFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11, paddingHorizontal: 2 },
  searchSceneFooterText: { color: colors.secondary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 12 },
  socialSceneLabel: { position: 'absolute', top: spacing.lg, left: spacing.lg },
  socialSceneLabelText: { color: colors.white, fontFamily: 'Montserrat_800ExtraBold', fontSize: 11, letterSpacing: 1.25 },
  socialStack: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
  socialMainCard: { minHeight: 112, borderRadius: radius.xl, padding: spacing.lg, backgroundColor: colors.white, flexDirection: 'row', gap: 12, alignItems: 'center', ...shadow.lifted },
  socialIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  socialOverline: { color: colors.primary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 9, letterSpacing: 1 },
  socialTitle: { color: colors.secondary, fontFamily: 'Montserrat_800ExtraBold', fontSize: 15, marginTop: 6 },
  socialSubCard: { marginTop: 9, marginLeft: 32, minHeight: 54, backgroundColor: colors.secondary, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: 10 },
  socialGroupIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  socialSubText: { color: colors.white, fontFamily: 'Montserrat_700Bold', fontSize: 11, flex: 1 },
});
