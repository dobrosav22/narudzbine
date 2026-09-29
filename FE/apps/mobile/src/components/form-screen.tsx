import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

/** Scrollable, keyboard-aware container for form screens. */
export function FormScreen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 p-4 pb-12"
        contentInsetAdjustmentBehavior="automatic">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
