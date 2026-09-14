import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowLeft,
  CheckCircle2,
  FileImage,
  FileText,
  MessageSquareText,
  Store,
  Upload,
  X,
} from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useTheme } from '../src/hooks/useTheme';
import { ownerAccessService } from '../src/services/ownerAccessService';
import { ownerVerificationDocumentService, type VerificationDocument } from '../src/services/ownerVerificationDocumentService';
import { isValidEmail, normalizeEmail } from '../src/utils/auth';

const accessCategories = ['Restaurant', 'Cafe', 'Bar', 'Club', 'Lounge', 'Food Park'];
const accessNeeds = ['Reservations', 'Down Payments', 'Guest Reviews', 'Tables & Pricing'];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function OwnerAccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    spotId?: string | string[];
    spotName?: string | string[];
    spotAddress?: string | string[];
    category?: string | string[];
  }>();
  const { width } = useWindowDimensions();
  const { appColors } = useTheme();
  const wide = width >= 880;
  const selectedSpotId = firstParam(params.spotId);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [spotName, setSpotName] = useState('');
  const [spotAddress, setSpotAddress] = useState('');
  const [category, setCategory] = useState(accessCategories[0]);
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>(['Reservations', 'Down Payments']);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [checkingOwnership, setCheckingOwnership] = useState(Boolean(selectedSpotId));
  const [claimStatus, setClaimStatus] = useState<Awaited<ReturnType<typeof ownerAccessService.getSpotClaimStatus>> | null>(null);
  const [claimStatusError, setClaimStatusError] = useState<string | null>(null);
  const [requestingAccess, setRequestingAccess] = useState(false);

  useEffect(() => {
    const nextSpotName = firstParam(params.spotName);
    const nextSpotAddress = firstParam(params.spotAddress);
    const nextCategory = firstParam(params.category);
    if (nextSpotName) setSpotName(nextSpotName);
    if (nextSpotAddress) setSpotAddress(nextSpotAddress);
    if (nextCategory && accessCategories.includes(nextCategory)) setCategory(nextCategory);
  }, [params.category, params.spotAddress, params.spotName]);

  useEffect(() => {
    let active = true;
    if (!selectedSpotId) {
      setCheckingOwnership(false);
      return () => undefined;
    }

    setCheckingOwnership(true);
    setClaimStatusError(null);
    ownerAccessService
      .getSpotClaimStatus(selectedSpotId)
      .then((status) => {
        if (!active) return;
        setClaimStatus(status);
        setSpotName((current) => current || status.spotName);
      })
      .catch((error: any) => {
        if (!active) return;
        setClaimStatusError(error?.message ?? 'Unable to check the current owner.');
      })
      .finally(() => {
        if (active) setCheckingOwnership(false);
      });

    return () => {
      active = false;
    };
  }, [selectedSpotId]);

  const completionCopy = useMemo(() => {
    if (!submitted) return 'Submit your venue details. CebSpot will create a dedicated business account after verification.';
    return 'Request received. If approved, the business email will receive a secure account setup invitation.';
  }, [submitted]);

  function toggleNeed(need: string) {
    setSelectedNeeds((current) =>
      current.includes(need) ? current.filter((item) => item !== need) : [...current, need],
    );
  }

  async function pickVerificationDocuments() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (!result.canceled) {
      setDocuments((current) => [
        ...current,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? undefined,
          size: asset.size ?? undefined,
        })),
      ]);
    }
  }

  function documentLabel(document: VerificationDocument, index: number) {
    return document.name || document.uri.split('/').pop()?.split('?')[0] || `Document ${index + 1}`;
  }

  async function submitRequest() {
    if (!contactName.trim() || !contactEmail.trim() || !spotName.trim() || !spotAddress.trim()) {
      Alert.alert('Missing details', 'Please complete your contact and spot details.');
      return;
    }
    const businessEmail = normalizeEmail(contactEmail);
    if (!isValidEmail(businessEmail)) {
      Alert.alert('Invalid business email', 'Enter a valid, unregistered email for the dedicated owner account.');
      return;
    }
    if (!selectedNeeds.length) {
      Alert.alert('Select access needs', 'Choose at least one owner portal area.');
      return;
    }

    let uploadedDocuments: string[] = [];
    try {
      setSubmitting(true);
      const emailStatus = await ownerAccessService.getBusinessEmailStatus(businessEmail);
      if (emailStatus === 'registered') {
        Alert.alert(
          'Email already registered',
          'This email already belongs to a CebSpot user. Use a separate, unregistered business email for the owner account.',
        );
        return;
      }
      if (emailStatus === 'pending') {
        Alert.alert(
          'Request already pending',
          'An owner access request for this business email is already awaiting CebSpot review.',
        );
        return;
      }
      if (emailStatus === 'invalid') {
        Alert.alert('Invalid business email', 'Enter a valid, unregistered email for the dedicated owner account.');
        return;
      }

      const requestKey = `owner-request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      uploadedDocuments = await ownerVerificationDocumentService.upload(documents, requestKey);
      await ownerAccessService.createRequest(
        {
          requester_id: null,
          spot_id: selectedSpotId ?? null,
          contact_name: contactName.trim(),
          contact_email: businessEmail,
          contact_phone: contactPhone.trim() || null,
          spot_name: spotName.trim(),
          spot_address: spotAddress.trim(),
          category,
          access_needs: selectedNeeds,
          verification_documents: uploadedDocuments,
          message: message.trim() || null,
        },
        contactName.trim() || 'Spot Owner',
      );
      setSubmitted(true);
      Alert.alert(
        'Request sent',
        'CebSpot will review the documents. If approved, the unregistered business email will receive a secure account setup invitation.',
      );
    } catch (error: any) {
      await ownerVerificationDocumentService.remove(uploadedDocuments).catch(() => undefined);
      console.error('Owner access request failed:', error);
      Alert.alert('Request failed', error.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.keyboard, { backgroundColor: appColors.surface }]}
    >
      <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <Pressable style={[styles.backButton, { backgroundColor: appColors.surfaceLow }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={appColors.onSurface} />
          </Pressable>
          <View style={styles.topbarCopy}>
            <Text style={[styles.kicker, { color: colors.primary }]}>Spot Owner Access</Text>
            <Text style={[styles.pageTitle, { color: appColors.onSurface }]}>Request Owner Access</Text>
          </View>
        </View>

        <View style={styles.content}>
          {checkingOwnership && (
            <View style={[styles.claimStatusPanel, { backgroundColor: appColors.surfaceLow }]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.claimStatusLoading, { color: appColors.onSurfaceVariant }]}>Checking ownership...</Text>
            </View>
          )}

          {!checkingOwnership && claimStatus?.managed && !requestingAccess && (
            <View style={[styles.claimStatusPanel, { backgroundColor: appColors.surfaceLow }]}>
              <View style={styles.claimStatusIcon}>
                <Store size={24} color={colors.white} />
              </View>
              <Text style={[styles.claimStatusTitle, { color: appColors.onSurface }]}>This spot is already managed</Text>
              <Text style={[styles.claimStatusMessage, { color: appColors.onSurfaceVariant }]}>
                <Text style={[styles.claimStatusSpotName, { color: appColors.onSurface }]}>{claimStatus.spotName}</Text>
                {' is owned by '}
                <Text style={[styles.claimStatusOwner, { color: appColors.onSurface }]}>
                  {claimStatus.ownerHint ?? 'another verified account'}
                </Text>
                .
              </Text>
              <Text style={[styles.claimStatusHelp, { color: appColors.onSurfaceVariant }]}>
                {claimStatus.hasAccess
                  ? 'Your account already has access to this spot.'
                  : 'If you represent this business, submit an access request for manual verification.'}
              </Text>
              <View style={styles.claimStatusActions}>
                <AppButton
                  label={claimStatus.hasAccess ? 'Open Owner Dashboard' : 'Request Access'}
                  onPress={() => {
                    if (claimStatus.hasAccess) router.push('/owner-dashboard');
                    else setRequestingAccess(true);
                  }}
                  style={styles.claimStatusButton}
                />
                <AppButton label="Go Back" variant="secondary" onPress={() => router.back()} style={styles.claimStatusButton} />
              </View>
            </View>
          )}

          {!checkingOwnership && claimStatusError && (
            <Text style={[styles.claimStatusError, { color: appColors.onSurfaceVariant }]}>{claimStatusError}</Text>
          )}

          {!checkingOwnership && (!claimStatus?.managed || requestingAccess) && (
          <View style={[styles.formPanel, { backgroundColor: appColors.surfaceLow }]}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}>
                <Store size={22} color={colors.white} />
              </View>
              <View style={styles.formHeaderCopy}>
                <Text style={[styles.formTitle, { color: appColors.onSurface }]}>Contact CebSpot</Text>
                <Text style={[styles.formSubtitle, { color: appColors.onSurfaceVariant }]}>{completionCopy}</Text>
                <Text style={[styles.formHint, { color: appColors.onSurfaceVariant }]}>Use a dedicated business email that has never been registered as a CebSpot user. Existing user accounts cannot be converted into owner accounts.</Text>
              </View>
              {submitted && <CheckCircle2 size={24} color={colors.success} />}
            </View>

            <View style={[styles.fieldGrid, wide && styles.fieldGridWide]}>
              <FormField
                label="Contact Name"
                value={contactName}
                onChangeText={setContactName}
                appColors={appColors}
              />
              <FormField
                label="New Business Account Email"
                value={contactEmail}
                onChangeText={setContactEmail}
                keyboardType="email-address"
                appColors={appColors}
              />
            </View>

            <FormField
              label="Contact Number"
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="+639"
              keyboardType="phone-pad"
              appColors={appColors}
            />

            <View style={[styles.fieldGrid, wide && styles.fieldGridWide]}>
              <FormField
                label="Spot Name"
                value={spotName}
                onChangeText={setSpotName}
                appColors={appColors}
              />
              <View style={styles.field}>
                <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Category</Text>
                <View style={styles.categoryGrid}>
                  {accessCategories.map((item) => {
                    const selected = item === category;
                    return (
                      <Pressable
                        key={item}
                        style={[
                          styles.choiceChip,
                          {
                            backgroundColor: selected ? colors.primary : appColors.surfaceRaised,
                          },
                        ]}
                        onPress={() => setCategory(item)}
                      >
                        <Text style={[styles.choiceText, { color: selected ? colors.white : appColors.onSurfaceVariant }]}>
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <FormField
              label="Spot Address"
              value={spotAddress}
              onChangeText={setSpotAddress}
              appColors={appColors}
            />

            <View style={styles.field}>
              <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Access Needed</Text>
              <View style={styles.needGrid}>
                {accessNeeds.map((need) => {
                  const selected = selectedNeeds.includes(need);
                  return (
                    <Pressable
                      key={need}
                      style={[
                        styles.needChip,
                        {
                          backgroundColor: selected ? colors.primary + '16' : appColors.surfaceRaised,
                        },
                      ]}
                      onPress={() => toggleNeed(need)}
                    >
                      <CheckCircle2 size={15} color={selected ? colors.primary : appColors.onSurfaceVariant} />
                      <Text style={[styles.needText, { color: selected ? colors.primary : appColors.onSurfaceVariant }]}>
                        {need}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Verification Documents</Text>
              <Text style={[styles.helperText, { color: appColors.onSurfaceVariant }]}>Attach IDs, business permits, proof of ownership, photos, or PDFs to help us verify your request faster. You may attach as many documents as needed.</Text>
              <Pressable
                disabled={submitted || submitting}
                onPress={pickVerificationDocuments}
                style={[styles.uploadButton, { backgroundColor: appColors.surfaceRaised, borderColor: appColors.outlineVariant }, (submitted || submitting) && styles.disabled]}
              >
                <Upload size={17} color={colors.primary} />
                <Text style={styles.uploadButtonText}>Insert Documents</Text>
              </Pressable>
              {documents.map((document, index) => (
                <View key={`${document.uri}-${index}`} style={[styles.documentRow, { backgroundColor: appColors.inputSurface }]}>
                  {document.mimeType === 'application/pdf' ? <FileText size={17} color={colors.primary} /> : <FileImage size={17} color={colors.primary} />}
                  <Text style={[styles.documentName, { color: appColors.onSurface }]} numberOfLines={1}>{documentLabel(document, index)}</Text>
                  <Pressable disabled={submitted || submitting} onPress={() => setDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <X size={17} color={appColors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>Message</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholderTextColor={appColors.onSurfaceVariant + '88'}
                multiline
                style={[
                  styles.textArea,
                  {
                    backgroundColor: appColors.inputSurface,
                    color: appColors.onSurface,
                  },
                ]}
              />
            </View>

            <AppButton
              label={submitted ? 'Request Sent' : 'Send Request'}
              loading={submitting}
              disabled={submitted}
              onPress={submitRequest}
              icon={!submitted ? <MessageSquareText size={18} color={colors.white} /> : undefined}
            />
          </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  appColors,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  appColors: typeof colors;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: appColors.onSurfaceVariant }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={appColors.onSurfaceVariant + '88'}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={[
          styles.input,
          {
            backgroundColor: appColors.inputSurface,
            color: appColors.onSurface,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  page: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  pageWide: {
    paddingHorizontal: 42,
    paddingVertical: 32,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbarCopy: {
    flex: 1,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  content: {
    gap: spacing.xl,
  },
  formPanel: {
    flex: 1,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  claimStatusPanel: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.card,
  },
  claimStatusIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimStatusLoading: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  claimStatusTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textAlign: 'center',
  },
  claimStatusMessage: {
    maxWidth: 560,
    fontSize: fontSize.md,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  claimStatusSpotName: {
    fontWeight: '900',
  },
  claimStatusOwner: {
    fontWeight: '900',
  },
  claimStatusHelp: {
    maxWidth: 520,
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  claimStatusActions: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  claimStatusButton: {
    minWidth: 210,
  },
  claimStatusError: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  formIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHeaderCopy: {
    flex: 1,
  },
  formTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  formSubtitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  formHint: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  fieldGrid: {
    gap: spacing.lg,
  },
  fieldGridWide: {
    flexDirection: 'row',
  },
  field: {
    flex: 1,
    gap: spacing.sm,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  textArea: {
    minHeight: 116,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceChip: {
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  needGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  needChip: {
    minHeight: 42,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  needText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  helperText: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '600',
  },
  uploadButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  uploadButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  documentRow: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  documentName: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.55,
  },
});
